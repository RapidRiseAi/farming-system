import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { getDashboardPathForRole, isFarmRole, type UserRole } from '@/lib/auth/role-redirect';
import { shouldBypassMiddlewareForRequest } from '@/lib/auth/middleware-guards';

type CookieToSet = { name: string; value: string; options?: CookieOptions };

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });

  if (shouldBypassMiddlewareForRequest(request.headers)) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        }
      }
    }
  );

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isWorkshopRoute = path.startsWith('/workshop');
  const isCustomerRoute = path.startsWith('/customer');
  const isFarmRoute = path.startsWith('/farm');

  if ((isWorkshopRoute || isCustomerRoute || isFarmRoute) && !user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (!user) {
    return response;
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const role = profile?.role as UserRole | undefined;

  if ((path === '/login' || path === '/signup') && role) {
    return NextResponse.redirect(new URL(getDashboardPathForRole(role), request.url));
  }

  if (isCustomerRoute && role !== 'customer') {
    return NextResponse.redirect(new URL(getDashboardPathForRole(role), request.url));
  }

  if ((isWorkshopRoute || isFarmRoute) && !isFarmRole(role)) {
    return NextResponse.redirect(new URL(getDashboardPathForRole(role), request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
