import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieMethodsServer } from '@supabase/ssr';

// Run on Node.js runtime instead of Edge to avoid fetch/crypto
// compatibility issues with @supabase/ssr on Vercel's edge network.
export const runtime = 'nodejs';

export async function middleware(request: NextRequest) {
  try {
    let supabaseResponse = NextResponse.next({ request });

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value),
            );
            supabaseResponse = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options),
            );
          },
        } satisfies CookieMethodsServer,
      },
    );

    const pathname = request.nextUrl.pathname;

    // Allow API routes through without auth check
    if (pathname.startsWith('/api/')) {
      return supabaseResponse;
    }

    // Use getSession() instead of getUser() for middleware.
    // getUser() makes a live round-trip to Supabase's auth server on every
    // request, which can timeout or fail in Edge/Node runtime and cause
    // MIDDLEWARE_INVOCATION_FAILED. getSession() reads and verifies the JWT
    // from the cookie locally — no outbound network call.
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const isAuthenticated = !!session?.user;

    // Unauthenticated users can only access the login page (/)
    // No redirect loop: hitting / while unauthenticated falls through to supabaseResponse
    if (!isAuthenticated && pathname !== '/') {
      return NextResponse.redirect(new URL('/', request.url));
    }

    // Authenticated users visiting the login page get sent to dashboard
    // Pages handle role-specific routing (manager→/dashboard, employee→/employee)
    if (isAuthenticated && pathname === '/') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    return supabaseResponse;
  } catch {
    // Never let middleware throw a 500 — just pass the request through
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    // Exclude ALL _next/ paths (static, image, data, chunks, server) to
    // prevent recursive middleware invocation on Next.js internal routes.
    // Previously only _next/static and _next/image were excluded, which
    // allowed _next/data/ and _next/chunks/ to trigger middleware.
    '/((?!_next/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
