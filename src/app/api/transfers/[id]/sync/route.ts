import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongoose';
import Transfer from '@/models/Transfer';
import AuditLog from '@/models/AuditLog';
import { syncApprovedTransferToSheet } from '@/lib/transfer-sheet-sync';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id || !['admin', 'moderator', 'co_admin'].includes(session.user.role)) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    await connectDB();

    const transfer = await Transfer.findById(id)
      .populate('initiator', 'name email')
      .populate('verifiedById', 'name email');

    if (!transfer) {
      return NextResponse.json({ success: false, message: 'Transfer not found' }, { status: 404 });
    }

    if (transfer.status !== 'VERIFIED') {
      return NextResponse.json({ success: false, message: 'Only verified transfers can be synced' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    if (transfer.syncedToSheet && body?.force !== true) {
      return NextResponse.json(
        { success: false, message: 'Already synced. Pass { "force": true } to re-check the existing row.' },
        { status: 400 }
      );
    }

    if (transfer.paymentGroupId && body?.force !== true) {
      const alreadySynced = await Transfer.exists({ paymentGroupId: transfer.paymentGroupId, syncedToSheet: true });
      if (alreadySynced) return NextResponse.json({ success: false, message: 'This payment was already synced.' }, { status: 409 });
    }
    const syncedAt = await syncApprovedTransferToSheet(String(transfer._id), (transfer.verifiedById as any)?.name || session.user.name || 'Unknown');

    await AuditLog.create({
      actorId: session.user.id,
      actorName: session.user.name || 'Unknown',
      action: 'SHEET_SYNCED',
      targetCollection: 'Transfers',
      targetId: String(transfer._id),
    });

    return NextResponse.json({
      success: true,
      data: { id: String(transfer._id), syncedToSheet: true, syncedAt },
      message: 'Transfer synced successfully',
    });
  } catch (error: any) {
    console.error('Sync transfer error:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to sync transfer' }, { status: 500 });
  }
}
