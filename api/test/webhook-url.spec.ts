import { AppError } from '../src/domain/errors';
import { isPrivateAddress, validWebhookUrl } from '../src/domain/webhook-subscription';

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1',
    '127.255.0.9',
    '0.0.0.0',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.0.10',
    '169.254.169.254',
    '::',
    '::1',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    'febf::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:a9fe:a9fe',
  ])('refuses %s', (ip) => expect(isPrivateAddress(ip)).toBe(true));

  it.each([
    '8.8.8.8',
    '172.15.0.1',
    '172.32.0.1',
    '192.169.0.1',
    '2001:db8::1',
    'fec0::1',
    '::ffff:8.8.8.8',
  ])('allows %s', (ip) => expect(isPrivateAddress(ip)).toBe(false));
});

describe('validWebhookUrl', () => {
  const refused = (url: string, allowPrivate = false) => {
    try {
      validWebhookUrl(url, allowPrivate);
    } catch (error) {
      return error instanceof AppError && error.code === 'WEBHOOK_URL_INVALID';
    }
    return false;
  };

  it('accepts a public http(s) URL and normalizes it', () => {
    expect(validWebhookUrl(' https://example.com/hook ')).toBe('https://example.com/hook');
    expect(validWebhookUrl('http://93.184.216.34:8080/x')).toBe('http://93.184.216.34:8080/x');
  });

  it.each([
    'not a url',
    'ftp://example.com',
    'http://localhost:4000',
    'http://api.localhost/x',
    'http://127.0.0.1/x',
    'http://10.0.0.5/x',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]:4000/',
    'http://[fe80::1]/',
    'http://[::ffff:127.0.0.1]/',
  ])('refuses %s', (url) => expect(refused(url)).toBe(true));

  it('accepts private targets only when allowed (local demo receiver)', () => {
    expect(validWebhookUrl('http://localhost:4000', true)).toBe('http://localhost:4000/');
    expect(refused('ftp://localhost', true)).toBe(true);
  });
});
