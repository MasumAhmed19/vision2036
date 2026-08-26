import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongoose';
import Period from '@/models/Period';
import { withAuth } from '@/lib/with-auth';
import { computePeriodSnapshot } from '@/lib/ledger';
import { mapSnapshot } from '@/lib/period-mapper';

const MONTH_RE = /^\d{4}-\d{2}$/;

// Open to any authenticated member (newDesign.md §6.1) — a CLOSED month
// returns its frozen snapshot; an OPEN/REOPENED month (or one that's never
// been touched) returns a live preview computed on the fly, not saved.
export const GET = withAuth<{ params: Promise<{ month: string }> }>({}, async ({ context }) => {
    const { month } = await context.params;
    if (!MONTH_RE.test(month)) {
        return NextResponse.json({ success: false, message: 'Invalid month' }, { status: 400 });
    }

    await connectDB();

    const period = await Period.findOne({ month });

    if (period?.status === 'CLOSED' && period.snapshot) {
        return NextResponse.json({
            success: true,
            data: {
                month,
                status: period.status,
                closedAt: period.closedAt,
                snapshot: mapSnapshot(period.snapshot),
            },
            message: 'Period fetched successfully',
        });
    }

    const snapshot = await computePeriodSnapshot(month);
    return NextResponse.json({
        success: true,
        data: {
            month,
            status: period?.status ?? 'OPEN',
            reopenReason: period?.reopenReason ?? null,
            snapshot: mapSnapshot(snapshot),
        },
        message: 'Period fetched successfully',
    });
});
