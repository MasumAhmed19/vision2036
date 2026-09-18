import { NextResponse } from 'next/server';
import { getFundPosition, getAllTimeAggregate, getMemberAllTimeContribution } from '@/lib/ledger';
import { fromPaisa } from '@/lib/money';
import { withAuth } from '@/lib/with-auth';
import connectDB from '@/lib/mongoose';
import User from '@/models/User';

// Open to any authenticated member — the fund's position is not sensitive
// within the group (newDesign.md §6.1: "everyone can see everything").
export const GET = withAuth({}, async ({ request, member }) => {
    const { searchParams } = new URL(request.url);
    const throughPeriod = searchParams.get('throughPeriod') || undefined;

    if (throughPeriod && !/^\d{4}-\d{2}$/.test(throughPeriod)) {
        return NextResponse.json({ success: false, message: 'Invalid throughPeriod' }, { status: 400 });
    }

    await connectDB();

    const [position, allTime, myContribution, activeMemberCount] = await Promise.all([
        getFundPosition({ throughPeriod }),
        getAllTimeAggregate(),
        getMemberAllTimeContribution(member.id),
        User.countDocuments({ isActive: true }),
    ]);

    // "My share" — what this member personally paid in, all-time, plus an
    // even split of investment returns and operational costs across every
    // active member. Interest is deliberately left out of the split (it
    // stays pooled, not attributed to anyone) — matches the explicit
    // per-member accounting rule this was built to, distinct from the
    // fund-wide netAmount in buildGlobalSummary (which does include
    // interest, since that one's a whole-fund total, not a per-member
    // split). This is an even-split view, not a legal claim on the fund.
    const myOwnContribution = myContribution.monthlyPaid + myContribution.flexiblePaid;
    const perMemberShare = activeMemberCount > 0
        ? (allTime.investmentReturns - allTime.totalCosts) / activeMemberCount
        : 0;
    const myShare = myOwnContribution + perMemberShare;

    return NextResponse.json({
        success: true,
        data: {
            cash: fromPaisa(position.cash),
            investedAtCost: fromPaisa(position.investedAtCost),
            fundValue: fromPaisa(position.fundValue),
            // Home's Net Balance means liquid cash currently available.
            // Use the authoritative fund position so investment outflows
            // reduce cash and principal-back entries increase it.
            netBalance: fromPaisa(position.cash),
            myShare: fromPaisa(myShare),
        },
        message: 'Fund position fetched successfully',
    });
});
