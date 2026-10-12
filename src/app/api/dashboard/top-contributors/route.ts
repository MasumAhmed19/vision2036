import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongoose';
import User from '@/models/User';
import { getAllMemberContributions, getAllTimeAggregate } from '@/lib/ledger';
import { fromPaisa } from '@/lib/money';

/**
 * All-time contribution ranking — open to any authenticated member, matching
 * newDesign.md §6.1 ("everyone can see everything"). A posted payment counts
 * even when its accounting month is in the future.
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

        const [members, contributions, allTime] = await Promise.all([
            User.find({ isActive: true }).select('_id name avatar headshot'),
            getAllMemberContributions(),
            getAllTimeAggregate(),
        ]);

        const totalPaisaByMember = new Map(
            contributions.map((c) => [c.memberId, c.monthlyPaid + c.flexiblePaid])
        );

        // Preserve fundShare in the API for callers that need the same
        // even-split formula as FundPosition.myShare (see /api/fund).
        // The leaderboard itself ranks by the amount personally contributed.
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
            .sort((a, b) => b.totalPaid - a.totalPaid)
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
