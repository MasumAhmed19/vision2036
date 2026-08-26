import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongoose';
import Period from '@/models/Period';
import LedgerEntry from '@/models/LedgerEntry';
import AuditLog from '@/models/AuditLog';
import { withAuth } from '@/lib/with-auth';
import { computePeriodSnapshot } from '@/lib/ledger';
import { mapSnapshot } from '@/lib/period-mapper';

const MONTH_RE = /^\d{4}-\d{2}$/;

// Freezes the month's numbers into Period.snapshot (newDesign.md §4.5) so a
// closed month's reported totals are a permanent fact, not a query re-run
// against data that keeps changing. Blocks on any still-PENDING entry for
// the month — those need to be approved/rejected first, not silently
// excluded from the freeze.
export const POST = withAuth<{ params: Promise<{ month: string }> }>(
    { capability: 'period.close' },
    async ({ member, context }) => {
        const { month } = await context.params;
        if (!MONTH_RE.test(month)) {
            return NextResponse.json({ success: false, message: 'Invalid month' }, { status: 400 });
        }

        await connectDB();

        const existing = await Period.findOne({ month });
        if (existing?.status === 'CLOSED') {
            return NextResponse.json({ success: false, message: 'Period is already closed' }, { status: 400 });
        }

        const pendingCount = await LedgerEntry.countDocuments({ period: month, status: 'PENDING' });
        if (pendingCount > 0) {
            return NextResponse.json(
                { success: false, message: `${pendingCount} entr${pendingCount > 1 ? 'ies' : 'y'} still pending approval for this month — resolve those first` },
                { status: 400 }
            );
        }

        const snapshot = await computePeriodSnapshot(month);

        const period = await Period.findOneAndUpdate(
            { month },
            {
                $set: {
                    month,
                    status: 'CLOSED',
                    closedBy: member.id,
                    closedAt: new Date(),
                    snapshot,
                },
                $unset: { reopenedBy: 1, reopenedAt: 1, reopenReason: 1 },
            },
            { upsert: true, new: true }
        );

        await AuditLog.create({
            actorId: member.id,
            actorName: member.name,
            action: 'PERIOD_CLOSED',
            targetCollection: 'Period',
            targetId: String(period._id),
            newValue: { month, fundValue: snapshot.fundValue },
        });

        return NextResponse.json({
            success: true,
            data: { month, status: period.status, closedAt: period.closedAt, snapshot: mapSnapshot(snapshot) },
            message: 'Period closed',
        });
    }
);
