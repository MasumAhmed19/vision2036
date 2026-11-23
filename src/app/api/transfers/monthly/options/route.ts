import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongoose';
import Transfer from '@/models/Transfer';
import { getMonthlyPaymentLimits, parseMonth } from '@/lib/monthly-payments';

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    const limits = getMonthlyPaymentLimits();
    const yearParam = new URL(request.url).searchParams.get('year');
    if (yearParam !== null && !/^\d{4}$/.test(yearParam)) {
      return NextResponse.json({ success: false, message: 'Invalid contribution year' }, { status: 400 });
    }
    const year = yearParam === null ? Number(limits.currentMonth.slice(0, 4)) : Number(yearParam);
    if (year < Number(limits.earliestMonth.slice(0, 4))) {
      return NextResponse.json({ success: false, message: `Choose ${limits.earliestMonth.slice(0, 4)} or later.` }, { status: 400 });
    }
    const months = Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`)
      .filter((month) => parseMonth(month)! >= parseMonth(limits.earliestMonth)!);
    await connectDB();
    const active = await Transfer.find({
      initiator: session.user.id,
      selectMonth: { $in: months },
      monthlyAmount: { $gt: 0 },
      status: { $ne: 'REJECTED' },
    }).select('selectMonth');
    const unavailable = new Set(active.map((row) => row.selectMonth));
    return NextResponse.json({
      success: true,
      data: { ...limits, year, months: months.filter((month) => !unavailable.has(month)) },
    });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : 'Failed to load months' }, { status: 500 });
  }
}
