import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth.config';
import { NextResponse } from 'next/server';

const { auth } = NextAuth(authConfig);

// Routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/forgot-password', '/reset-password'];

// Routes that require admin or moderator role
const ADMIN_ROUTES = ['/admin'];

export default auth((req) => {
    const { nextUrl, auth: session } = req;
    const pathname = nextUrl.pathname;

    const isPublicRoute = PUBLIC_ROUTES.some(route => pathname.startsWith(route));
    const isAdminRoute = ADMIN_ROUTES.some(route => pathname.startsWith(route));
    // A deactivated member keeps a valid JWT until it's next refreshed —
    // treat that session as unauthenticated for routing purposes, same as
    // no session at all. This must be folded into isAuthenticated itself
    // (not a separate later check) — a separate check redirects deactivated
    // sessions to /login, but the public-route branch below unconditionally
    // sends any *authenticated* session away from /login back to '/',
    // producing an infinite redirect loop between the two.
    const isAuthenticated = !!session?.user && session.user.isActive !== false;

    // Allow public routes regardless of auth state
    if (isPublicRoute) {
        // Redirect authenticated users away from login
        if (isAuthenticated) {
            return NextResponse.redirect(new URL('/', nextUrl));
        }
        return NextResponse.next();
    }

    // Unauthenticated (or deactivated) users trying to access protected
    // routes (including root) → redirect to login
    if (!isAuthenticated) {
        const loginUrl = new URL('/login', nextUrl);
        loginUrl.searchParams.set('callbackUrl', pathname);
        return NextResponse.redirect(loginUrl);
    }

    // Admin routes but user is just a member → redirect to dashboard
    if (isAdminRoute) {
        const userRole = session?.user?.role as string | undefined;
        const hasAdminAccess = ['admin', 'moderator'].includes(userRole || '');
        if (!hasAdminAccess) {
            return NextResponse.redirect(new URL('/', nextUrl));
        }
    }

    // Active session — allow
    return NextResponse.next();
});

export const config = {
    // Match all routes except static files, _next, and API routes
    matcher: [
        '/((?!api|_next/static|_next/image|favicon.ico|manifest.json|icons|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp)).*)',
    ],
};
