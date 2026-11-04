import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TokenService, type Actor } from '../application/auth.ports';
import { AppError } from '../domain/errors';
import type { Role } from '../domain/user';

const PUBLIC = 'public';
const ROLES = 'roles';

/** The route needs no token. */
export const Public = () => SetMetadata(PUBLIC, true);
/** Only these roles may call the route; without it any signed-in role may. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

type AuthRequest = { headers: { authorization?: string }; user?: Actor };

/** Global guard: every route needs a valid token unless marked @Public(). Attaches the caller as `request.user`. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean | undefined>(PUBLIC, targets)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    const actor = scheme === 'Bearer' && token ? await this.tokens.verify(token) : null;
    if (!actor) {
      throw new AppError('SESSION_INVALID');
    }

    const allowed = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, targets);
    if (allowed && !allowed.includes(actor.role)) {
      throw new AppError('FORBIDDEN');
    }
    request.user = actor;
    return true;
  }
}

/** The caller the AuthGuard attached. Only valid on routes that are not @Public(). */
export const CurrentUser = createParamDecorator((_: unknown, context: ExecutionContext): Actor => {
  const user = context.switchToHttp().getRequest<AuthRequest>().user;
  if (!user) {
    throw new AppError('SESSION_INVALID');
  }
  return user;
});
