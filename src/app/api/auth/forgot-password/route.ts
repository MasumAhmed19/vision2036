import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import connectDB from '@/lib/mongoose';
import User from '@/models/User';
import { sendPasswordResetEmail } from '@/lib/email';
import { consumeRateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
    try {
        // Rate limit: 3 requests per 15 minutes per IP
        const ip =
            request.headers.get('x-forwarded-for') ||
            request.headers.get('x-real-ip') ||
            'unknown';

        const rateLimit = consumeRateLimit(`forgot-password:${ip}`, {
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

        // Always return the same response to prevent email enumeration attacks
        const successResponse = NextResponse.json({
            success: true,
            message: 'If that email is registered, you will receive a password reset link shortly.',
        });

        const user = await User.findOne({ email: email.toLowerCase().trim() });

        // Silently exit if user not found — same response as success
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

        // Send the email (fire and forget — errors logged but don't fail the response)
        try {
            await sendPasswordResetEmail(user.email, user.name, resetLink);
        } catch (emailError) {
            console.error('Failed to send password reset email:', emailError);
            // Clear the token so the user can try again
            user.resetTokenHash = undefined;
            user.resetTokenExpiry = undefined;
            await user.save();
            return NextResponse.json(
                { success: false, message: 'Failed to send reset email. Please try again later.' },
                { status: 500 }
            );
        }

        return successResponse;
    } catch (error: any) {
        console.error('Forgot password error:', error);
        return NextResponse.json(
            { success: false, message: 'An unexpected error occurred. Please try again.' },
            { status: 500 }
        );
    }
}
