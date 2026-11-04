import { NextResponse, type NextRequest } from 'next/server';
import { ROLE_COOKIE, TOKEN_COOKIE } from '@/lib/api';

// A server component cannot delete cookies; without this hop an expired token loops between / and /login.
export function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/login', request.url));
  response.cookies.delete(TOKEN_COOKIE);
  response.cookies.delete(ROLE_COOKIE);
  return response;
}
