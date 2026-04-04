import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

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
          setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value),
            );
            supabaseResponse = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options),
            );
          },
        },
      },
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const pathname = request.nextUrl.pathname;

    // Allow API routes through always
    if (pathname.startsWith('/api/')) {
      return supabaseResponse;
    }

    // Not authenticated — redirect to login for protected routes
    if (!user && pathname !== '/') {
      return NextResponse.redirect(new URL('/', request.url));
    }

    // Authenticated on login page — send to dashboard
    // (pages handle role-specific routing client-side)
    if (user && pathname === '/') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    return supabaseResponse;
  } catch {
    // If middleware throws for any reason, let the request through
    // rather than showing a 500 to the user
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
