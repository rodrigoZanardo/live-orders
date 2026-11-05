import { NextResponse, type NextRequest } from 'next/server';
import { homeOf } from '@/lib/types';

// Public pages: the home with its two buttons, the customer screen (browse; staff sign in to order) and sign-in.
const PUBLIC_PATHS = new Set(['/', '/cliente', '/login', '/cadastro']);

// Only checks that a session cookie exists; the API validates the token on every call.
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const signedIn = request.cookies.has('token');
  if (!signedIn && !PUBLIC_PATHS.has(pathname)) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  if (signedIn && (pathname === '/login' || pathname === '/cadastro')) {
    // the role cookie only picks the landing page; the API still checks every call
    return NextResponse.redirect(new URL(homeOf(request.cookies.get('role')?.value), request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next|favicon.ico|icon.svg).*)'] };
