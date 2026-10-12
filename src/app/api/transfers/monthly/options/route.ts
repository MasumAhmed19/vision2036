import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongoose';
import Transfer from '@/models/Transfer';
import { getMonthlyPaymentLimits, monthFromOrdinal, parseMonth } from '@/lib/monthly-payments';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    await connectDB();
    const limits = getMonthlyPaymentLimits();
    const months = Array.from(
      { length: parseMonth(limits.lastMonth)! - parseMonth(limits.earliestMonth)! + 1 },
      (_, index) => monthFromOrdinal(parseMonth(limits.earliestMonth)! + index)
    );
    const active = await Transfer.find({
      initiator: session.user.id,
      selectMonth: { $in: months },
      monthlyAmount: { $gt: 0 },
      status: { $ne: 'REJECTED' },
    }).select('selectMonth');
    const unavailable = new Set(active.map((row) => row.selectMonth));
    return NextResponse.json({
      success: true,
      data: { ...limits, months: months.filter((month) => !unavailable.has(month)) },
    });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : 'Failed to load months' }, { status: 500 });
  }
}
