import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongoose';
import Transfer from '@/models/Transfer';
import Cost from '@/models/Cost';
import MonthlySummary from '@/models/MonthlySummary';
import { getYearRange } from '@/lib/policies';
import { rebuildMonthlySummaryForMonth } from '@/lib/summary-engine';

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id || !['admin', 'moderator'].includes(session.user.role)) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const year = Number(searchParams.get('year') || new Date().getFullYear());

    await connectDB();

    const { start, end } = getYearRange(year);
    const [transferMonths, costRows] = await Promise.all([
      Transfer.distinct('selectMonth', { transferDate: { $gte: start, $lt: end } }),
      Cost.find({ date: { $gte: start, $lt: end } }).select('date'),
    ]);

    const costMonths = costRows.map((row) => new Date(row.date).toISOString().slice(0, 7));
    const months = Array.from(new Set([...transferMonths, ...costMonths])).sort();

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
