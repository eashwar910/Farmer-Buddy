import { NextResponse, type NextRequest } from 'next/server';

// Middleware runs on the Edge Runtime. We do NOT import @supabase/ssr here
// because its transitive dependencies reference __dirname (a Node.js global
// unavailable on the Edge Runtime). Instead we do a lightweight cookie check:
// Supabase writes a cookie named sb-<project-ref>-auth-token (or chunked as
// sb-<ref>-auth-token.0) when the user is signed in. If that cookie is present
// with a non-empty value, we treat the user as authenticated and let the
// individual pages do the authoritative getUser() verification.

export async function middleware(request: NextRequest) {
  try {
    const pathname = request.nextUrl.pathname;

    // Allow API routes through without auth check
    if (pathname.startsWith('/api/')) {
      return NextResponse.next({ request });
    }

    // Check for any Supabase auth session cookie.
    // Matches: sb-<ref>-auth-token  and  sb-<ref>-auth-token.0 (chunked).
    const isAuthenticated = request.cookies.getAll().some(
      ({ name, value }) => /^sb-.+-auth-token/.test(name) && value.length > 0,
    );

    // Unauthenticated users can only access the login page (/)
    if (!isAuthenticated && pathname !== '/') {
      return NextResponse.redirect(new URL('/', request.url));
    }

    // Authenticated users visiting the login page get sent to /dashboard;
    // the dashboard page then redirects employees to /employee.
    if (isAuthenticated && pathname === '/') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    return NextResponse.next({ request });
  } catch {
    // Never let middleware throw — just pass the request through
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    // Exclude ALL _next/ paths to prevent recursive middleware invocations
    // on Next.js internal routes (_next/data/, _next/chunks/, etc.).
    '/((?!_next/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
