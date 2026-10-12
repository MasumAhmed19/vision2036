import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongoose';
import User from '@/models/User';
import Transfer from '@/models/Transfer';
import Cost from '@/models/Cost';
import AuditLog from '@/models/AuditLog';
import { buildGlobalSummary } from '@/lib/summary-engine';
import { getContributionPolicy, getCurrentMonthIso } from '@/lib/policies';
import { getFundPosition } from '@/lib/ledger';
import { fromPaisa } from '@/lib/money';
import { findGroupedTransfers } from '@/lib/monthly-payments';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id || !['admin', 'moderator', 'co_admin'].includes(session.user.role)) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const now = new Date();
    const year = now.getFullYear();
    const currentMonth = getCurrentMonthIso(now);
    const policy = getContributionPolicy(year);

    const [members, currentMonthTransfers, pendingTransfers, globalSummary, fundPosition, recentActivity, unsyncedTransferPage, unsyncedCosts] = await Promise.all([
      User.find({ isActive: true }).select('_id name avatar'),
      // REJECTED excluded — a rejected transfer isn't an active submission
      // (the member can resubmit for the same month, see the verify
      // route's handling), so it must not count toward "submitted this
      // month" or it misleadingly looks like something is still pending
      // review when it's actually already been declined.
      Transfer.find({ selectMonth: currentMonth, status: { $ne: 'REJECTED' } }).populate('initiator', 'name'),
      Transfer.find({ status: 'PENDING' }).select('_id paymentGroupId'),
      buildGlobalSummary(year),
      getFundPosition(),
      AuditLog.find({ action: { $in: ['TRANSFER_CREATED', 'TRANSFER_VERIFIED', 'TRANSFER_REJECTED', 'COST_ADDED', 'COST_UPDATED', 'COST_DELETED'] } })
        .sort({ timestamp: -1 })
        .limit(8),
      findGroupedTransfers({ status: 'VERIFIED', syncedToSheet: false }, 1, 5, true),
      Cost.find({ syncedToSheet: false }).sort({ date: -1 }).limit(5),
    ]);
    const pendingCount = new Set(pendingTransfers.map((item) => item.paymentGroupId ? String(item.paymentGroupId) : String(item._id))).size;

    const monthTotals = new Map<string, { verified: number; submitted: number }>();
    for (const member of members) {
      monthTotals.set(String(member._id), { verified: 0, submitted: 0 });
    }

    for (const transfer of currentMonthTransfers) {
      const memberId = typeof transfer.initiator === 'object' ? String((transfer.initiator as any)._id) : String(transfer.initiator);
      const current = monthTotals.get(memberId) || { verified: 0, submitted: 0 };
      current.submitted += transfer.monthlyAmount || 0;
      if (transfer.status === 'VERIFIED') {
        current.verified += transfer.monthlyAmount || 0;
      }
      monthTotals.set(memberId, current);
    }

    const statusGrid = members.map((member) => {
      const totals = monthTotals.get(String(member._id)) || { verified: 0, submitted: 0 };
      let status: 'paid' | 'partial' | 'unpaid' = 'unpaid';
      if (totals.verified >= policy.monthlyAmount) {
        status = 'paid';
      } else if (totals.submitted > 0) {
        status = 'partial';
      }

      return {
        userId: String(member._id),
        name: member.name,
        avatar: member.avatar ?? null,
        status,
        amountSubmitted: totals.submitted,
        amountVerified: totals.verified,
      };
    }).sort((a, b) => a.name.localeCompare(b.name));

    const flexProgress = globalSummary.userSummaries.map((item) => ({
      userId: item.userId,
      userName: item.userName,
      userAvatar: item.userAvatar ?? null,
      paid: item.flexiblePaid,
      target: policy.flexHalfMinimum,
      progress: policy.flexHalfMinimum > 0 ? Math.min(Math.round((item.flexiblePaid / policy.flexHalfMinimum) * 100), 100) : 0,
      warning: now.getMonth() + 1 >= policy.flexHalfDeadlineMonth && item.flexiblePaid < policy.flexHalfMinimum,
    }));

    return NextResponse.json({
      success: true,
      data: {
        currentMonth,
        stats: {
          totalMembers: members.length,
          targetThisMonth: members.length * policy.monthlyAmount,
          collectedThisMonth: statusGrid.reduce((sum, item) => sum + item.amountVerified, 0),
          pendingCount,
          // Fund value = cash + invested at cost — investing capital moves
          // it from cash to invested, it doesn't reduce the fund's value.
          // See getFundPosition() in src/lib/ledger.ts.
          totalFundBalance: fromPaisa(fundPosition.fundValue),
          collectionRate: members.length > 0 ? Math.round((statusGrid.reduce((sum, item) => sum + item.amountVerified, 0) / (members.length * policy.monthlyAmount)) * 100) : 0,
        },
        paymentStatus: {
          paid: statusGrid.filter((item) => item.status === 'paid').length,
          partial: statusGrid.filter((item) => item.status === 'partial').length,
          unpaid: statusGrid.filter((item) => item.status === 'unpaid').length,
          members: statusGrid,
        },
        flexProgress,
        recentActivity: recentActivity.map((item) => ({
          id: String(item._id),
          actorName: item.actorName,
          action: item.action,
          targetCollection: item.targetCollection,
          timestamp: item.timestamp,
        })),
        syncFailures: {
          transferCount: unsyncedTransferPage.total,
          costCount: await Cost.countDocuments({ syncedToSheet: false }),
          items: [
            ...unsyncedTransferPage.rows.map((transfer) => ({
              id: String(transfer._id),
              type: 'transfer',
              label: `${(transfer.initiator as any)?.name || 'Unknown'} · ${(transfer.months || [transfer.selectMonth]).join(', ')} · Tk. ${transfer.totalAmount.toLocaleString()}`,
              date: transfer.verifiedAt || transfer.updatedAt,
            })),
            ...unsyncedCosts.map((cost) => ({
              id: String(cost._id),
              type: 'cost',
              label: `${cost.category} · Tk. ${cost.amount.toLocaleString()}`,
              date: cost.date,
            })),
          ].sort((a, b) => +new Date(b.date) - +new Date(a.date)).slice(0, 6),
        },
      },
      message: 'Admin dashboard fetched successfully',
    });
  } catch (error: any) {
    console.error('Fetch admin dashboard error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch admin dashboard' },
      { status: 500 }
    );
  }
}
