import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import connectDB from '@/lib/mongoose';
import User from '@/models/User';

export async function POST(request: NextRequest) {
    try {
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
