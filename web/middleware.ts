import { NextResponse, type NextRequest } from 'next/server';

// Only checks that a session cookie exists; the API validates the token on every call.
export function middleware(request: NextRequest) {
  const signedIn = request.cookies.has('token');
  const onLogin = request.nextUrl.pathname === '/login';
  if (!signedIn && !onLogin) return NextResponse.redirect(new URL('/login', request.url));
  if (signedIn && onLogin) return NextResponse.redirect(new URL('/', request.url));
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next|favicon.ico|icon.svg).*)'] };
