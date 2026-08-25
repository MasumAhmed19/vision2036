import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongoose';
import MonthlySummary from '@/models/MonthlySummary';
import { rebuildMonthlySummaryForMonth } from '@/lib/summary-engine';
import { listPeriodsWithActivity } from '@/lib/ledger';

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id || !['admin', 'moderator', 'co_admin'].includes(session.user.role)) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const year = Number(searchParams.get('year') || new Date().getFullYear());

    await connectDB();

    // Single accounting-month basis (period), not the old mix of
    // transferDate-range + selectMonth-distinct + Cost.date — see
    // listPeriodsWithActivity in src/lib/ledger.ts.
    const months = await listPeriodsWithActivity(`${year}-01`, `${year}-12`);

    if (months.length > 0) {
      await Promise.all(months.map((month) => rebuildMonthlySummaryForMonth(month)));
    }

    const summaries = await MonthlySummary.find({ year }).sort({ month: -1 });

    return NextResponse.json({
      success: true,
      data: summaries.map((summary) => ({
        id: String(summary._id),
        month: summary.month,
        year: summary.year,
        totalCollected: summary.totalCollected,
        totalMonthly: summary.totalMonthly,
        totalFlex: summary.totalFlex,
        totalCosts: summary.totalCosts,
        netBalance: summary.netBalance,
        fullyPaidMembers: summary.fullyPaidMembers,
        partiallyPaidMembers: summary.partiallyPaidMembers,
        unpaidMembers: summary.unpaidMembers,
        generatedAt: summary.generatedAt,
        syncedToSheet: summary.syncedToSheet,
        syncedAt: summary.syncedAt,
        createdAt: summary.createdAt,
        updatedAt: summary.updatedAt,
      })),
      message: 'Monthly summaries fetched successfully',
    });
  } catch (error: any) {
    console.error('Fetch monthly summaries error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch monthly summaries' },
      { status: 500 }
    );
  }
}
