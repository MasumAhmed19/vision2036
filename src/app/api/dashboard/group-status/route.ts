import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongoose';
import User from '@/models/User';
import Transfer from '@/models/Transfer';
import { getMemberContributionsInRange } from '@/lib/ledger';
import { getContributionPolicy, getCurrentMonthIso } from '@/lib/policies';
import { fromPaisa } from '@/lib/money';

/**
 * "Who's paid this month" — open to every authenticated member, not just
 * admins (newDesign.md §10.1's GroupBoard / §6.1's transparency principle).
 * Distinct from GET /api/dashboard/admin, which stays admin/moderator/
 * co_admin-only since it also carries sync-failure/audit detail members
 * don't need.
 */
export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const period = searchParams.get('period') || getCurrentMonthIso();
        if (!/^\d{4}-\d{2}$/.test(period)) {
            return NextResponse.json({ success: false, message: 'Invalid period' }, { status: 400 });
        }

        await connectDB();

        const year = Number(period.split('-')[0]);
        const policy = getContributionPolicy(year);

        const [members, contributions, pendingTransfers] = await Promise.all([
            User.find({ isActive: true }).select('_id name avatar headshot').sort({ joinedAt: 1 }),
            getMemberContributionsInRange(period, period),
            // A submitted transfer does not create a posted ledger entry until
            // an admin verifies it. Keep this separate from the ledger query so
            // the group board can distinguish "waiting for approval" from
            // "not yet paid".
            Transfer.find({
                selectMonth: period,
                status: 'PENDING',
                monthlyAmount: { $gt: 0 },
            }).select('initiator').lean(),
        ]);

        const paidByMember = new Map(contributions.map((c) => [c.memberId, fromPaisa(c.monthlyPaid)]));
        const pendingMemberIds = new Set(pendingTransfers.map((transfer) => String(transfer.initiator)));

        const members_ = members.map((member) => {
            const memberId = String(member._id);
            const paid = paidByMember.get(memberId) || 0;
            const status: 'paid' | 'pending' | 'unpaid' =
                paid >= policy.monthlyAmount
                    ? 'paid'
                    : pendingMemberIds.has(memberId) || paid > 0
                        ? 'pending'
                        : 'unpaid';
            return {
                id: String(member._id),
                name: member.name,
                avatar: member.avatar || null,
                headshot: member.headshot || null,
                status,
                paid,
            };
        });

        return NextResponse.json({
            success: true,
            data: { period, members: members_ },
            message: 'Group status fetched successfully',
        });
    } catch (error: unknown) {
        console.error('Group status error:', error);
        const message = error instanceof Error ? error.message : 'Failed to fetch group status';
        return NextResponse.json({ success: false, message }, { status: 500 });
    }
}
