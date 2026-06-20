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
  category: z.enum(['bank_charge', 'operational', 'investment', 'other']),
  receiptImage: z.string().url().optional(),
  receiptImagePublicId: z.string().optional(),
});

const mapCost = (cost: any) => ({
  id: String(cost._id),
  amount: cost.amount,
  date: cost.date,
  reason: cost.reason,
  category: cost.category,
  submittedBy: typeof cost.submittedBy === 'object'
    ? { id: String(cost.submittedBy._id), name: cost.submittedBy.name, email: cost.submittedBy.email }
    : String(cost.submittedBy),
  approvedBy: cost.approvedBy
    ? typeof cost.approvedBy === 'object'
      ? { id: String(cost.approvedBy._id), name: cost.approvedBy.name, email: cost.approvedBy.email }
      : String(cost.approvedBy)
    : null,
  receiptImage: cost.receiptImage,
  receiptImagePublicId: cost.receiptImagePublicId,
  syncedToSheet: cost.syncedToSheet,
  syncedAt: cost.syncedAt,
  createdAt: cost.createdAt,
  updatedAt: cost.updatedAt,
});

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id || !['admin', 'moderator'].includes(session.user.role)) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year');
    const month = searchParams.get('month');
    const category = searchParams.get('category');
    const query: any = {};

    if (month) {
      const start = new Date(`${month}-01T00:00:00.000Z`);
      const end = new Date(start);
      end.setUTCMonth(end.getUTCMonth() + 1);
      query.date = { $gte: start, $lt: end };
    } else if (year && year !== 'all') {
      query.date = {
        $gte: new Date(`${year}-01-01T00:00:00.000Z`),
        $lt: new Date(`${Number(year) + 1}-01-01T00:00:00.000Z`),
      };
    }

    if (category && category !== 'all') {
      query.category = category;
    }

    await connectDB();

    const costs = await Cost.find(query)
      .sort({ date: -1, createdAt: -1 })
      .populate('submittedBy', 'name email')
      .populate('approvedBy', 'name email');

    return NextResponse.json({
      success: true,
      data: costs.map(mapCost),
      message: 'Costs fetched successfully',
    });
  } catch (error: any) {
    console.error('Fetch costs error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch costs' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
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

    await connectDB();

    const cost = await Cost.create({
      ...parsed.data,
      submittedBy: session.user.id,
      approvedBy: session.user.id,
      syncedToSheet: false,
    });

    const monthIso = new Date(cost.date).toISOString().slice(0, 7);
    await rebuildMonthlySummaryForMonth(monthIso);

    await AuditLog.create({
      actorId: session.user.id,
      actorName: session.user.name || 'Unknown',
      action: 'COST_ADDED',
      targetCollection: 'Costs',
      targetId: String(cost._id),
      newValue: { amount: cost.amount, date: cost.date, category: cost.category, reason: cost.reason },
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
      console.warn('Cost sheet sync failed:', syncError);
    }

    const savedCost = await Cost.findById(cost._id).populate('submittedBy', 'name email').populate('approvedBy', 'name email');

    return NextResponse.json({
      success: true,
      data: mapCost(savedCost),
      message: 'Cost created successfully',
    }, { status: 201 });
  } catch (error: any) {
    console.error('Create cost error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to create cost' },
      { status: 500 }
    );
  }
}
