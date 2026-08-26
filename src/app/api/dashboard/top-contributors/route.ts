import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongoose';
import User from '@/models/User';
import { getMemberContributionsInRange } from '@/lib/ledger';
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
        const [members, contributions] = await Promise.all([
            User.find({ isActive: true }).select('_id name avatar headshot'),
            getMemberContributionsInRange('2000-01', currentPeriod),
        ]);

        const totalPaisaByMember = new Map(
            contributions.map((c) => [c.memberId, c.monthlyPaid + c.flexiblePaid])
        );

        const ranked = members
            .map((member) => ({
                id: String(member._id),
                name: member.name,
                avatar: member.avatar || null,
                headshot: member.headshot || null,
                totalPaid: fromPaisa(totalPaisaByMember.get(String(member._id)) || 0),
            }))
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
