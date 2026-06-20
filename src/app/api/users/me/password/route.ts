import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongoose';
import User from '@/models/User';

export async function PATCH(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { currentPassword, newPassword } = body;

        if (!currentPassword || !newPassword) {
            return NextResponse.json(
                { success: false, message: 'Current password and new password are required' },
                { status: 400 }
            );
        }

        await connectDB();

        // Fetch user with password explicitly selected
        const user = await User.findById(session.user.id).select('+password');
        if (!user) {
            return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
        }

        // Verify current password
        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
            return NextResponse.json({ success: false, message: 'Incorrect current password' }, { status: 400 });
        }

        // Set new password (the pre-save hook will hash it)
        user.password = newPassword;
        await user.save();

        return NextResponse.json({
            success: true,
            message: 'Password changed successfully',
        });
    } catch (error: any) {
        console.error('Password change error:', error);
        return NextResponse.json(
            { success: false, message: error.message || 'Failed to change password' },
            { status: 500 }
        );
    }
}
