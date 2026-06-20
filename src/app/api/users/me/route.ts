import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongoose';
import User from '@/models/User';

// Allowed profile updates
export async function PATCH(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { name, phoneNumber } = body;

        await connectDB();

        const user = await User.findById(session.user.id);
        if (!user) {
            return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
        }

        let isUpdated = false;

        if (name && name !== user.name) {
            user.name = name;
            isUpdated = true;
        }

        if (phoneNumber !== undefined && phoneNumber !== user.phoneNumber) {
            user.phoneNumber = phoneNumber;
            isUpdated = true;
        }

        if (isUpdated) {
            await user.save();
        }

        return NextResponse.json({
            success: true,
            data: {
                id: (user._id as { toString(): string }).toString(),
                name: user.name,
                email: user.email,
                role: user.role,
                avatar: user.avatar,
                phoneNumber: user.phoneNumber,
                isActive: user.isActive,
            },
            message: 'Profile updated successfully',
        });
    } catch (error: any) {
        console.error('Profile update error:', error);
        return NextResponse.json(
            { success: false, message: error.message || 'Failed to update profile' },
            { status: 500 }
        );
    }
}
