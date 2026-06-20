import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongoose';
import Transfer from '@/models/Transfer';
import { buildUserYearlySummary } from '@/lib/summary-engine';
import { getContributionPolicy, getCurrentMonthIso } from '@/lib/policies';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const now = new Date();
    const year = now.getFullYear();
    const currentMonth = getCurrentMonthIso(now);
    const policy = getContributionPolicy(year);

    const [summary, currentMonthTransfers, recentTransfers] = await Promise.all([
      buildUserYearlySummary(session.user.id, year),
      Transfer.find({ initiator: session.user.id, selectMonth: currentMonth }).sort({ transferDate: -1 }),
      Transfer.find({ initiator: session.user.id }).sort({ transferDate: -1 }).limit(5),
    ]);

    const verifiedMonthly = currentMonthTransfers
      .filter((item) => item.status === 'VERIFIED')
      .reduce((sum, item) => sum + (item.monthlyAmount || 0), 0);
    const submittedMonthly = currentMonthTransfers.reduce((sum, item) => sum + (item.monthlyAmount || 0), 0);

    let status: 'paid' | 'partial' | 'unpaid' = 'unpaid';
    if (verifiedMonthly >= policy.monthlyAmount) {
      status = 'paid';
    } else if (submittedMonthly > 0) {
      status = 'partial';
    }

    return NextResponse.json({
      success: true,
      data: {
        currentMonth,
        monthlyStatus: {
          status,
          targetAmount: policy.monthlyAmount,
          verifiedAmount: verifiedMonthly,
          submittedAmount: submittedMonthly,
          remainingAmount: Math.max(policy.monthlyAmount - verifiedMonthly, 0),
          deadlineDay: policy.deadlineDay,
        },
        flexStatus: {
          paid: summary.flexible.paid,
          target: policy.yearlyFlexibleAmount,
          halfTarget: policy.flexHalfMinimum,
          warning: summary.flexible.hasWarning,
          remaining: summary.flexible.remaining,
        },
        summary,
        recentTransfers: recentTransfers.map((transfer) => ({
          id: String(transfer._id),
          selectMonth: transfer.selectMonth,
          totalAmount: transfer.totalAmount,
          monthlyAmount: transfer.monthlyAmount,
          flexAmount: transfer.flexAmount,
          status: transfer.status,
          transferDate: transfer.transferDate,
          createdAt: transfer.createdAt,
        })),
      },
      message: 'Member dashboard fetched successfully',
    });
  } catch (error: any) {
    console.error('Fetch member dashboard error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch member dashboard' },
      { status: 500 }
    );
  }
}
