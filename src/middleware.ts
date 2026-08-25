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
    // IMPORTANT — read before touching this: middleware runs on the edge
    // runtime and decodes whatever the browser's current JWT cookie says.
    // It does NOT call the DB. auth.ts's jwt callback re-validates role/
    // isActive against the DB on every Node-runtime auth() call (API routes,
    // and — critically — the /api/auth/session endpoint useSession() polls
    // on mount and on window focus by default), and that re-validated value
    // gets baked into a refreshed cookie at that point. So a deactivation
    // reaches this check on the user's *next session refetch* (tab focus,
    // page reload, or an explicit update() call) — not instantly on a tab
    // left open and continuously focused. That's a real, bounded staleness
    // window, not a broken check: it's still a major improvement over doing
    // nothing (the pre-Phase-0 behavior), just not a hard real-time guarantee.
    //
    // The actual authorization boundary for anything that matters — every
    // sensitive mutation (submit a payment, change a role, deactivate
    // someone, ...) — is enforced at the API route level via auth() from
    // '@/lib/auth', which re-checks the DB per request regardless of
    // whether this cookie is stale. This check here is a UX layer (redirect
    // a deactivated user out of pages sooner when we can), not the
    // authoritative gate.
    //
    // Deactivated must be folded into isAuthenticated itself, not a
    // separate later check — a separate check redirects a deactivated
    // session to /login, but the public-route branch below unconditionally
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
        const hasAdminAccess = ['admin', 'moderator', 'co_admin'].includes(userRole || '');
        if (!hasAdminAccess) {
            return NextResponse.redirect(new URL('/', nextUrl));
        }
    }

    // Active session — allow
    return NextResponse.next();
});

export const config = {
    // Match all routes except static files, _next, and API routes.
    // sw.js must be excluded: it's fetched by the browser before/without
    // auth (the PWA registers it on every visit, including the login page),
    // so gating it behind auth turned every registration into a redirect to
    // /login — "the script resource is behind a redirect" — and silently
    // broke the service worker for any visitor without a session, which
    // also blocks push notifications from ever working.
    matcher: [
        '/((?!api|_next/static|_next/image|favicon.ico|manifest.json|sw\\.js|icons|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp)).*)',
    ],
};
