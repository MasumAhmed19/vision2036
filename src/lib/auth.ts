import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import connectDB from '@/lib/mongoose';
import User from '@/models/User';
import { headers } from 'next/headers';
import { consumeRateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/request-ip';
import { authConfig } from '@/lib/auth.config';

const ROLE_RECHECK_INTERVAL_MS = 60 * 1000;

export const { handlers, auth, signIn, signOut } = NextAuth({
    ...authConfig,
    callbacks: {
        ...authConfig.callbacks,
        async jwt(params) {
            const token = await authConfig.callbacks!.jwt!(params);
            if (!token) return token;

            // Re-validate role/isActive against the DB. This runs only in the
            // Node runtime (API routes, RSC via auth()) — never in edge
            // middleware, which reuses authConfig directly without this
            // override. Throttled so it costs one query per session per
            // minute, not one per request.
            const now = Date.now();
            const checkedAt: number = Number(token.checkedAt) || 0;
            if (params.user || now - checkedAt > ROLE_RECHECK_INTERVAL_MS) {
                try {
                    await connectDB();
                    // .lean() is required here: a full Mongoose document
                    // applies schema defaults (default: Date.now on
                    // sessionsValidFrom) to any *stored* document that
                    // predates the field, at READ time — meaning every
                    // pre-existing user would get "now" back on every
                    // check, always failing the staleness comparison below
                    // and locking them out. .lean() returns the raw stored
                    // data with no defaults applied, so a genuinely-missing
                    // field comes back as undefined, as it should.
                    const fresh = await User.findById(token.id)
                        .select('role isActive sessionsValidFrom')
                        .lean();
                    token.role = fresh?.role ?? token.role;
                    token.isActive = fresh?.isActive ?? false;

                    // If the password was reset (or another session-invalidating
                    // event happened) after this JWT was issued, force it stale
                    // rather than let it keep working until it naturally expires.
                    if (fresh?.sessionsValidFrom && token.iat && new Date(fresh.sessionsValidFrom).getTime() > token.iat * 1000) {
                        token.isActive = false;
                    }
                } catch {
                    // Transient DB error — keep the last-known values rather
                    // than locking the user out.
                }
                token.checkedAt = now;
            }

            return token;
        },
    },
    providers: [
        Credentials({
            name: 'credentials',
            credentials: {
                email: { label: 'Email', type: 'email' },
                password: { label: 'Password', type: 'password' },
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) {
                    throw new Error('Email and password are required');
                }

                try {
                    await connectDB();
                } catch {
                    throw new Error('Database is unreachable. Whitelist your IP in MongoDB Atlas, or set MONGODB_URI_LOCAL for local MongoDB.');
                }

                const headersList = await headers();
                const ip = getClientIp(headersList);

                // The rate limiter is itself backed by the DB (see rate-limit.ts).
                // A hiccup there should never block a legitimate login attempt —
                // fail open (allow the attempt) rather than surface a confusing
                // error, or worse, mask the real problem behind a generic one.
                let rateLimitOk = true;
                try {
                    const rateLimit = await consumeRateLimit(`auth:${ip}:${String(credentials.email).toLowerCase()}`, {
                        windowMs: 15 * 60 * 1000,
                        max: 5,
                    });
                    rateLimitOk = rateLimit.success;
                } catch (error) {
                    console.error('Rate limit check failed, allowing login attempt:', error);
                }

                if (!rateLimitOk) {
                    throw new Error('Too many login attempts. Please wait a few minutes and try again.');
                }

                const user = await User.findByEmail(credentials.email as string);

                if (!user) {
                    throw new Error('Invalid email or password');
                }

                if (!user.isActive) {
                    throw new Error('Your account has been deactivated. Please contact admin.');
                }

                const isValid = await user.comparePassword(credentials.password as string);

                if (!isValid) {
                    throw new Error('Invalid email or password');
                }

                return {
                    id: (user._id as { toString(): string }).toString(),
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    avatar: user.avatar ?? null,
                    phoneNumber: user.phoneNumber ?? null,
                    isActive: user.isActive,
                };
            },
        }),
    ],
});
