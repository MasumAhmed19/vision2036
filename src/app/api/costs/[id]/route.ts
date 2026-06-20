import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongoose';
import Cost from '@/models/Cost';
import AuditLog from '@/models/AuditLog';
import { rebuildMonthlySummaryForMonth } from '@/lib/summary-engine';
import { syncCostToGoogleSheets } from '@/lib/google-sheets';

const costSchema = z.object({
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  date: z.coerce.date(),
  reason: z.string().trim().min(3, 'Reason is required').max(500),
  category: z.enum(['bank_charge', 'operational', 'investment' ,'other']),
  receiptImage: z.string().url().optional().nullable(),
  receiptImagePublicId: z.string().optional().nullable(),
});

const mapCost = (cost: any) => ({
  id: String(cost._id),
  amount: cost.amount,
  date: cost.date,
  reason: cost.reason,
  category: cost.category,
  submittedBy: cost.submittedBy && typeof cost.submittedBy === 'object'
    ? { id: String(cost.submittedBy._id), name: cost.submittedBy.name, email: cost.submittedBy.email }
    : String(cost.submittedBy),
  approvedBy: cost.approvedBy && typeof cost.approvedBy === 'object'
    ? { id: String(cost.approvedBy._id), name: cost.approvedBy.name, email: cost.approvedBy.email }
    : cost.approvedBy ? String(cost.approvedBy) : null,
  receiptImage: cost.receiptImage,
  receiptImagePublicId: cost.receiptImagePublicId,
  syncedToSheet: cost.syncedToSheet,
  syncedAt: cost.syncedAt,
  createdAt: cost.createdAt,
  updatedAt: cost.updatedAt,
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    return NextResponse.json({ success: true, data: mapCost(cost), message: 'Cost fetched successfully' });
  } catch (error: any) {
    console.error('Fetch cost error:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to fetch cost' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id || !['admin', 'moderator'].includes(session.user.role)) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = costSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, message: parsed.error.issues[0]?.message || 'Invalid payload' }, { status: 400 });
    }

    const { id } = await params;
    await connectDB();

    const cost = await Cost.findById(id);
    if (!cost) {
      return NextResponse.json({ success: false, message: 'Cost not found' }, { status: 404 });
    }

    const previousValue = cost.toObject();
    const previousMonth = new Date(cost.date).toISOString().slice(0, 7);

    cost.amount = parsed.data.amount;
    cost.date = parsed.data.date;
    cost.reason = parsed.data.reason;
    cost.category = parsed.data.category;
    cost.receiptImage = parsed.data.receiptImage || undefined;
    cost.receiptImagePublicId = parsed.data.receiptImagePublicId || undefined;
    cost.approvedBy = session.user.id as any;
    cost.syncedToSheet = false;
    cost.syncedAt = undefined;
    await cost.save();

    const currentMonth = new Date(cost.date).toISOString().slice(0, 7);
    await Promise.all([
      rebuildMonthlySummaryForMonth(previousMonth),
      previousMonth === currentMonth ? Promise.resolve() : rebuildMonthlySummaryForMonth(currentMonth),
    ]);

    await AuditLog.create({
      actorId: session.user.id,
      actorName: session.user.name || 'Unknown',
      action: 'COST_UPDATED',
      targetCollection: 'Costs',
      targetId: String(cost._id),
      previousValue: previousValue as unknown as Record<string, unknown>,
      newValue: cost.toObject() as unknown as Record<string, unknown>,
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'Unknown',
    });

    try {
      const populated = await Cost.findById(cost._id).populate('submittedBy', 'name email').populate('approvedBy', 'name email');
      if (populated) {
        await syncCostToGoogleSheets(populated as any);
        populated.syncedToSheet = true;
        populated.syncedAt = new Date();
        await populated.save();

        await AuditLog.create({
          actorId: session.user.id,
          actorName: session.user.name || 'Unknown',
          action: 'SHEET_SYNCED',
          targetCollection: 'Costs',
          targetId: String(populated._id),
        });
      }
    } catch (syncError) {
      console.warn('Cost resync failed:', syncError);
    }

    const updated = await Cost.findById(cost._id).populate('submittedBy', 'name email').populate('approvedBy', 'name email');

    return NextResponse.json({ success: true, data: mapCost(updated), message: 'Cost updated successfully' });
  } catch (error: any) {
    console.error('Update cost error:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to update cost' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id || !['admin', 'moderator'].includes(session.user.role)) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    await connectDB();

    const cost = await Cost.findById(id);
    if (!cost) {
      return NextResponse.json({ success: false, message: 'Cost not found' }, { status: 404 });
    }

    const previousValue = cost.toObject();
    const monthIso = new Date(cost.date).toISOString().slice(0, 7);
    await cost.deleteOne();
    await rebuildMonthlySummaryForMonth(monthIso);

    await AuditLog.create({
      actorId: session.user.id,
      actorName: session.user.name || 'Unknown',
      action: 'COST_DELETED',
      targetCollection: 'Costs',
      targetId: id,
      previousValue: previousValue as unknown as Record<string, unknown>,
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'Unknown',
    });

    return NextResponse.json({ success: true, data: null, message: 'Cost deleted successfully' });
  } catch (error: any) {
    console.error('Delete cost error:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to delete cost' }, { status: 500 });
  }
}
