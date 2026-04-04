import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow API routes through always
  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Check for Supabase session cookie
  const hasSession = request.cookies.has('sb-bkwrixhpykvcdpkvezsd-auth-token');

  // Not authenticated — redirect to login
  if (!hasSession && pathname !== '/') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Authenticated — redirect away from login page
  if (hasSession && pathname === '/') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};