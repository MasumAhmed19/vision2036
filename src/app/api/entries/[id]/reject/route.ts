import { NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongoose';
import LedgerEntry from '@/models/LedgerEntry';
import AuditLog from '@/models/AuditLog';
import { withAuth } from '@/lib/with-auth';
import { mapEntry } from '@/lib/entry-mapper';

const rejectSchema = z.object({
    reason: z.string().trim().min(5, 'A reason of at least 5 characters is required'),
});

export const POST = withAuth<{ params: Promise<{ id: string }> }>(
    { capability: 'entry.approve' },
    async ({ member, request, context }) => {
        const { id } = await context.params;
        const body = await request.json().catch(() => null);
        const parsed = rejectSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { success: false, message: parsed.error.issues[0]?.message || 'Invalid payload' },
                { status: 400 }
            );
        }

        await connectDB();

        const entry = await LedgerEntry.findById(id);
        if (!entry) {
            return NextResponse.json({ success: false, message: 'Entry not found' }, { status: 404 });
        }

        if (entry.status !== 'PENDING') {
            return NextResponse.json(
                { success: false, message: `Entry is already ${entry.status.toLowerCase()}` },
                { status: 400 }
            );
        }

        if (String(entry.createdBy) === member.id) {
            return NextResponse.json(
                { success: false, message: 'You cannot reject your own entry' },
                { status: 403 }
            );
        }

        entry.status = 'REJECTED';
        entry.rejectedBy = member.id;
        entry.rejectedAt = new Date();
        entry.rejectionReason = parsed.data.reason;
        await entry.save();

        await AuditLog.create({
            actorId: member.id,
            actorName: member.name,
            action: 'LEDGER_ENTRY_REJECTED',
            targetCollection: 'LedgerEntry',
            targetId: String(entry._id),
            newValue: { rejectionReason: entry.rejectionReason },
        });

        return NextResponse.json({ success: true, data: mapEntry(entry), message: 'Entry rejected' });
    }
);
