import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongoose';
import User from '@/models/User';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const isAdmin = ['admin', 'moderator'].includes(session.user.role);
        if (!isAdmin) {
            return NextResponse.json({ success: false, message: 'Forbidden: Admins only' }, { status: 403 });
        }

        await connectDB();

        const params = await context.params;

        const user = await User.findById(params.id);
        if (!user) {
            return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
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
                joinedAt: user.joinedAt,
            },
        });
    } catch (error: any) {
        console.error('Fetch user error:', error);
        return NextResponse.json(
            { success: false, message: error.message || 'Failed to fetch user' },
            { status: 500 }
        );
    }
}
