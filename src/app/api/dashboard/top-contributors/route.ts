import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongoose';
import User from '@/models/User';
import { getMemberContributionsInRange, getAllTimeAggregate } from '@/lib/ledger';
import { fromPaisa } from '@/lib/money';

/**
 * All-time contribution ranking — open to any authenticated member, matching
 * newDesign.md §6.1 ("everyone can see everything"). "All-time" is
 * implemented as a very early start period rather than a special "no lower
 * bound" code path in getMemberContributionsInRange, since 'YYYY-MM' string
 * comparison already sorts correctly and the fund didn't exist before 2025.
 */
export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const limitParam = parseInt(searchParams.get('limit') || '3', 10);
        const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 20) : 3;

        await connectDB();

        const currentPeriod = new Date().toISOString().slice(0, 7);
        const [members, contributions, allTime] = await Promise.all([
            User.find({ isActive: true }).select('_id name avatar headshot'),
            getMemberContributionsInRange('2000-01', currentPeriod),
            getAllTimeAggregate(),
        ]);

        const totalPaisaByMember = new Map(
            contributions.map((c) => [c.memberId, c.monthlyPaid + c.flexiblePaid])
        );

        // Same even-split formula as FundPosition.myShare (see /api/fund) —
        // interest stays pooled, not attributed to anyone. It's a constant
        // added to every member alike, so it never changes who ranks where;
        // it only makes the displayed number match what Home calls "Your
        // share" instead of just the raw amount submitted.
        const perMemberShare = members.length > 0
            ? (allTime.investmentReturns - allTime.totalCosts) / members.length
            : 0;

        const ranked = members
            .map((member) => {
                const totalPaidPaisa = totalPaisaByMember.get(String(member._id)) || 0;
                return {
                    id: String(member._id),
                    name: member.name,
                    avatar: member.avatar || null,
                    headshot: member.headshot || null,
                    totalPaid: fromPaisa(totalPaidPaisa),
                    fundShare: fromPaisa(totalPaidPaisa + perMemberShare),
                };
            })
            // Still gated on actually having contributed — sharing in the
            // fund's investment gains isn't the same as being a "top
            // contributor" if someone hasn't paid in anything themselves.
            .filter((m) => m.totalPaid > 0)
            .sort((a, b) => b.fundShare - a.fundShare)
            .slice(0, limit);

        return NextResponse.json({
            success: true,
            data: ranked,
            message: 'Top contributors fetched successfully',
        });
    } catch (error: any) {
        console.error('Top contributors error:', error);
        return NextResponse.json(
            { success: false, message: error.message || 'Failed to fetch top contributors' },
            { status: 500 }
        );
    }
}
