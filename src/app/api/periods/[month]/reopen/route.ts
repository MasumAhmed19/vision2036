import { NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongoose';
import Period from '@/models/Period';
import AuditLog from '@/models/AuditLog';
import { withAuth } from '@/lib/with-auth';

const MONTH_RE = /^\d{4}-\d{2}$/;

const reopenSchema = z.object({
    reason: z.string().trim().min(1, 'A reason is required to reopen a closed period').max(500),
});

// Admin-only (newDesign.md §4.5) — reopening a closed month is rare and
// consequential enough that it isn't delegated to co_admin. The old
// snapshot is left in place on the Period document (not cleared) so there's
// still a record of what was frozen before the reopen; closing again
// overwrites it with a freshly computed one.
export const POST = withAuth<{ params: Promise<{ month: string }> }>(
    { capability: 'period.reopen' },
    async ({ member, request, context }) => {
        const { month } = await context.params;
        if (!MONTH_RE.test(month)) {
            return NextResponse.json({ success: false, message: 'Invalid month' }, { status: 400 });
        }

        const body = await request.json().catch(() => null);
        const parsed = reopenSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { success: false, message: parsed.error.issues[0]?.message || 'Invalid request' },
                { status: 400 }
            );
        }

        await connectDB();

        const period = await Period.findOne({ month });
        if (!period || period.status !== 'CLOSED') {
            return NextResponse.json({ success: false, message: 'Period is not closed' }, { status: 400 });
        }

        period.status = 'REOPENED';
        period.reopenedBy = member.id;
        period.reopenedAt = new Date();
        period.reopenReason = parsed.data.reason;
        await period.save();

        await AuditLog.create({
            actorId: member.id,
            actorName: member.name,
            action: 'PERIOD_REOPENED',
            targetCollection: 'Period',
            targetId: String(period._id),
            newValue: { month, reason: parsed.data.reason },
        });

        return NextResponse.json({
            success: true,
            data: { month, status: period.status },
            message: 'Period reopened',
        });
    }
);
