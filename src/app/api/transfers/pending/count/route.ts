import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongoose';
import Transfer from '@/models/Transfer';

export async function GET() {
    try {
        const session = await auth();
        // Only allow admins and moderators
        if (!session?.user?.id || !['admin', 'moderator', 'co_admin'].includes(session.user.role)) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();

        // Return badges count
        const pending = await Transfer.find({ status: 'PENDING' }).select('_id paymentGroupId');
        const count = new Set(pending.map((item) => item.paymentGroupId ? String(item.paymentGroupId) : String(item._id))).size;

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
