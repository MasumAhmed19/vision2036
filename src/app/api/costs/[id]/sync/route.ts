import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongoose';
import Cost from '@/models/Cost';
import AuditLog from '@/models/AuditLog';
import { syncCostToGoogleSheets } from '@/lib/google-sheets';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id || !['admin', 'moderator'].includes(session.user.role)) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    await connectDB();

    const cost = await Cost.findById(id).populate('submittedBy', 'name email').populate('approvedBy', 'name email');
    if (!cost) {
      return NextResponse.json({ success: false, message: 'Cost not found' }, { status: 404 });
    }

    await syncCostToGoogleSheets(cost as any);
    cost.syncedToSheet = true;
    cost.syncedAt = new Date();
    await cost.save();

    await AuditLog.create({
      actorId: session.user.id,
      actorName: session.user.name || 'Unknown',
      action: 'SHEET_SYNCED',
      targetCollection: 'Costs',
      targetId: String(cost._id),
    });

    return NextResponse.json({
      success: true,
      data: { id: String(cost._id), syncedToSheet: cost.syncedToSheet, syncedAt: cost.syncedAt },
      message: 'Cost synced successfully',
    });
  } catch (error: any) {
    console.error('Sync cost error:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to sync cost' }, { status: 500 });
  }
}
