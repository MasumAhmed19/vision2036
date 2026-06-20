import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongoose';
import Transfer from '@/models/Transfer';
import Cost from '@/models/Cost';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id || !['admin', 'moderator'].includes(session.user.role)) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const [transfers, costs] = await Promise.all([
      Transfer.find({ status: 'VERIFIED', syncedToSheet: false })
        .sort({ verifiedAt: -1, createdAt: -1 })
        .populate('initiator', 'name email'),
      Cost.find({ syncedToSheet: false })
        .sort({ date: -1, createdAt: -1 })
        .populate('submittedBy', 'name email'),
    ]);

    const transferItems = transfers.map((item) => ({
      id: String(item._id),
      type: 'transfer' as const,
      label: `${item.initiator && typeof item.initiator === 'object' ? (item.initiator as any).name : 'Unknown'} · ${item.selectMonth} · Tk. ${item.totalAmount.toLocaleString()}`,
      date: item.verifiedAt || item.createdAt,
      month: item.selectMonth,
      status: item.status,
    }));

    const costItems = costs.map((item) => ({
      id: String(item._id),
      type: 'cost' as const,
      label: `${item.reason} · Tk. ${item.amount.toLocaleString()}`,
      date: item.date,
      category: item.category,
    }));

    return NextResponse.json({
      success: true,
      data: {
        transfers: transferItems,
        costs: costItems,
        total: transferItems.length + costItems.length,
      },
      message: 'Sync failures fetched successfully',
    });
  } catch (error: any) {
    console.error('Sync failures fetch error:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to fetch sync failures' }, { status: 500 });
  }
}
