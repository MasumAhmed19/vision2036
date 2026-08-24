import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import connectDB from '@/lib/mongoose';
import User from '@/models/User';
import { consumeRateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/request-ip';

export async function POST(request: NextRequest) {
    try {
        // The 256-bit token itself makes brute force infeasible, but cap
        // attempts anyway — defense in depth, matching forgot-password.
        // consumeRateLimit fails open internally if its own DB access errors.
        const ip = getClientIp(request.headers);
        const rateLimit = await consumeRateLimit(`reset-password:${ip}`, {
            windowMs: 15 * 60 * 1000,
            max: 10,
        });

        if (!rateLimit.success) {
            return NextResponse.json(
                { success: false, message: 'Too many attempts. Please wait a few minutes and try again.' },
                { status: 429 }
            );
        }

        const body = await request.json();
        const { token, newPassword } = body;

        if (!token || typeof token !== 'string') {
            return NextResponse.json(
                { success: false, message: 'Reset token is required.' },
                { status: 400 }
            );
        }

        if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
            return NextResponse.json(
                { success: false, message: 'Password must be at least 6 characters.' },
                { status: 400 }
            );
        }

        await connectDB();

        // Hash the incoming raw token to compare against what's stored in the DB
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

        // Find user with matching hash AND non-expired token
        // Must explicitly select resetTokenHash since it has select: false
        const user = await User.findOne({
            resetTokenHash: tokenHash,
            resetTokenExpiry: { $gt: new Date() }, // Token must not be expired
        }).select('+resetTokenHash +password');

        if (!user) {
            return NextResponse.json(
                { success: false, message: 'This reset link is invalid or has expired. Please request a new one.' },
                { status: 400 }
            );
        }

        // Update password — the pre-save hook in User.ts will hash it automatically
        user.password = newPassword;

        // Invalidate the token immediately (single-use enforcement)
        user.resetTokenHash = undefined;
        user.resetTokenExpiry = undefined;

        // Any JWT issued before this moment is now stale — auth.ts's jwt
        // callback compares against this on its next DB re-check and signs
        // the old session out.
        user.sessionsValidFrom = new Date();

        await user.save();

        return NextResponse.json({
            success: true,
            message: 'Password reset successfully. You can now sign in with your new password.',
        });
    } catch (error: any) {
        console.error('Reset password error:', error);
        return NextResponse.json(
            { success: false, message: 'An unexpected error occurred. Please try again.' },
            { status: 500 }
        );
    }
}
