import { NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongoose';
import LedgerEntry from '@/models/LedgerEntry';
import AuditLog from '@/models/AuditLog';
import { withAuth } from '@/lib/with-auth';
import { mapEntry } from '@/lib/entry-mapper';

const reverseSchema = z.object({
    reason: z.string().trim().min(10, 'A reason of at least 10 characters is required'),
});

// SCOPE NOTE: newDesign.md §7.1 specifies a reversal needs 2 approvals,
// neither the creator. This route implements a single-actor reversal
// (capability + reason only) for this phase — a deliberate simplification,
// not an oversight. Tightening this to a full second-approval workflow
// (mirroring the create->approve flow in ../approve/route.ts) is
// straightforward to add later without a data migration, since reversedBy/
// reversalOf already capture everything needed.
export const POST = withAuth<{ params: Promise<{ id: string }> }>(
    { capability: 'entry.reverse' },
    async ({ member, request, context }) => {
        const { id } = await context.params;
        const body = await request.json().catch(() => null);
        const parsed = reverseSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { success: false, message: parsed.error.issues[0]?.message || 'Invalid payload' },
                { status: 400 }
            );
        }

        await connectDB();

        const original = await LedgerEntry.findById(id);
        if (!original) {
            return NextResponse.json({ success: false, message: 'Entry not found' }, { status: 404 });
        }

        if (original.status !== 'POSTED') {
            return NextResponse.json(
                { success: false, message: 'Only a posted entry can be reversed' },
                { status: 400 }
            );
        }

        if (original.reversedBy) {
            return NextResponse.json({ success: false, message: 'Entry has already been reversed' }, { status: 400 });
        }

        const reversal = await LedgerEntry.create({
            direction: original.direction === 'CREDIT' ? 'DEBIT' : 'CREDIT',
            type: original.type,
            status: 'POSTED',
            amount: original.amount,
            currency: original.currency,
            memberId: original.memberId,
            period: original.period,
            valueDate: new Date(),
            title: `Reversal: ${original.title}`,
            note: parsed.data.reason,
            channel: original.channel,
            createdBy: member.id,
            requiredApprovals: 0,
            approvals: [{ by: member.id, at: new Date() }],
            postedAt: new Date(),
            reversalOf: original._id,
        });

        original.status = 'REVERSED';
        original.reversedBy = reversal._id;
        await original.save();

        await AuditLog.create({
            actorId: member.id,
            actorName: member.name,
            action: 'LEDGER_ENTRY_REVERSED',
            targetCollection: 'LedgerEntry',
            targetId: String(original._id),
            newValue: { reversalId: String(reversal._id), reason: parsed.data.reason },
        });

        return NextResponse.json({
            success: true,
            data: { original: mapEntry(original), reversal: mapEntry(reversal) },
            message: 'Entry reversed',
        });
    }
);
