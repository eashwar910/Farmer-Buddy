import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

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
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Public: login page + API routes
  if (pathname === '/' || pathname.startsWith('/api/')) {
    // If already logged in and visiting login, redirect to correct dashboard
    if (user && pathname === '/') {
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

      const role = profile?.role;
      if (role === 'manager') {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
      if (role === 'employee') {
        return NextResponse.redirect(new URL('/employee', request.url));
      }
    }
    return response;
  }

  // Protected routes: must be authenticated
  if (!user) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Role enforcement on protected routes
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/employee')) {
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    const role = profile?.role;

    if (pathname.startsWith('/dashboard') && role !== 'manager') {
      // Employee trying to access manager dashboard
      return NextResponse.redirect(new URL('/employee', request.url));
    }

    if (pathname.startsWith('/employee') && role !== 'employee') {
      // Manager trying to access employee dashboard
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
