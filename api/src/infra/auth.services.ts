import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { PasswordHasher, TokenService, type Actor } from '../application/auth.ports';
import { isRole } from '../domain/user';

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

async function derive(password: string, salt: Buffer): Promise<Buffer> {
  const key = await scryptAsync(password, salt, KEY_LENGTH);
  if (!Buffer.isBuffer(key)) {
    throw new Error('scrypt did not return a buffer');
  }
  return key;
}

/** Stored as `<salt hex>:<key hex>`. */
@Injectable()
export class ScryptPasswordHasher extends PasswordHasher {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    return `${salt.toString('hex')}:${(await derive(password, salt)).toString('hex')}`;
  }

  async verify(password: string, hash: string): Promise<boolean> {
    const [saltHex, keyHex] = hash.split(':');
    if (!saltHex || !keyHex) {
      return false;
    }
    const expected = Buffer.from(keyHex, 'hex');
    const actual = await derive(password, Buffer.from(saltHex, 'hex'));
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}

@Injectable()
export class JwtTokenService extends TokenService {
  constructor(private readonly jwt: JwtService) {
    super();
  }

  issue(actor: Actor): Promise<string> {
    return this.jwt.signAsync({ sub: actor.id, email: actor.email, role: actor.role });
  }

  async verify(token: string): Promise<Actor | null> {
    let payload: { sub?: unknown; email?: unknown; role?: unknown };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      return null;
    }
    const { sub, email, role } = payload;
    if (typeof sub !== 'string' || typeof email !== 'string' || typeof role !== 'string') {
      return null;
    }
    return isRole(role) ? { id: sub, email, role } : null;
  }
}
