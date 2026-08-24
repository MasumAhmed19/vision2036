import { NextRequest, NextResponse, after } from 'next/server';
import crypto from 'crypto';
import connectDB from '@/lib/mongoose';
import User from '@/models/User';
import { sendPasswordResetEmail } from '@/lib/email';
import { consumeRateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/request-ip';

export async function POST(request: NextRequest) {
    try {
        // Rate limit: 3 requests per 15 minutes per IP. consumeRateLimit
        // fails open internally if its own DB access errors.
        const ip = getClientIp(request.headers);
        const rateLimit = await consumeRateLimit(`forgot-password:${ip}`, {
            windowMs: 15 * 60 * 1000,
            max: 3,
        });

        if (!rateLimit.success) {
            return NextResponse.json(
                { success: false, message: 'Too many requests. Please wait a few minutes and try again.' },
                { status: 429 }
            );
        }

        const body = await request.json();
        const { email } = body;

        if (!email || typeof email !== 'string') {
            return NextResponse.json(
                { success: false, message: 'Email is required.' },
                { status: 400 }
            );
        }

        await connectDB();

        const user = await User.findOne({ email: email.toLowerCase().trim() });

        // Always return the same response whether the account exists, is
        // inactive, or the email genuinely goes out — a distinct response
        // per case turns this endpoint into a membership oracle (an attacker
        // can enumerate who has an account just by trying emails).
        const successResponse = NextResponse.json({
            success: true,
            message: "If that email is registered, you'll receive a reset link shortly.",
        });

        if (!user || !user.isActive) {
            return successResponse;
        }

        // Generate a cryptographically secure random token (raw = goes in the email URL)
        const rawToken = crypto.randomBytes(32).toString('hex');

        // Store only the SHA-256 hash in the database (raw token never stored)
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

        // 15-minute expiry
        const expiry = new Date(Date.now() + 15 * 60 * 1000);

        user.resetTokenHash = tokenHash;
        user.resetTokenExpiry = expiry;
        await user.save();

        // Build the reset link using the raw token
        const appUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
        const resetLink = `${appUrl}/reset-password?token=${rawToken}`;
        const userId = user._id;
        const userEmail = user.email;
        const userName = user.name;

        // Genuinely fire-and-forget: send the email AFTER the response is
        // sent, via Next's after() (not just an un-awaited promise, which a
        // serverless function can kill before it resolves). This is required
        // for the unified response above to actually stay unified — awaiting
        // sendPasswordResetEmail (a live SMTP round-trip) before responding
        // made active accounts measurably slower than nonexistent/inactive
        // ones, and a send failure used to return a distinct 500, both of
        // which reopen exactly the enumeration the generic response above is
        // meant to prevent.
        after(async () => {
            try {
                await sendPasswordResetEmail(userEmail, userName, resetLink);
            } catch (emailError) {
                console.error('Failed to send password reset email:', emailError);
                try {
                    await User.findByIdAndUpdate(userId, {
                        $unset: { resetTokenHash: 1, resetTokenExpiry: 1 },
                    });
                } catch (cleanupError) {
                    console.error('Failed to clear reset token after email failure:', cleanupError);
                }
            }
        });

        return successResponse;
    } catch (error: any) {
        console.error('Forgot password error:', error);
        return NextResponse.json(
            { success: false, message: 'An unexpected error occurred. Please try again.' },
            { status: 500 }
        );
    }
}
