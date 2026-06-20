import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongoose';
import Transfer from '@/models/Transfer';
import User from '@/models/User';

export async function GET(request: Request) {
    try {
        const session = await auth();
        // Only allow admins and moderators
        if (!session?.user?.id || !['admin', 'moderator'].includes(session.user.role)) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();

        // Return badges count
        const count = await Transfer.countDocuments({ status: 'PENDING' });

        return NextResponse.json({
            success: true,
            data: { count }
        });
    } catch (error: any) {
        console.error('Fetch pending count error:', error);
        return NextResponse.json(
            { success: false, message: error.message || 'Failed to fetch count' },
            { status: 500 }
        );
    }
}
