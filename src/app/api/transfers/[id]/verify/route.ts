import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongoose';
import Transfer from '@/models/Transfer';
import LedgerEntry from '@/models/LedgerEntry';
import Period from '@/models/Period';
import { rebuildMonthlySummaryForMonth } from '@/lib/summary-engine';
import { syncTransferToGoogleSheets } from '@/lib/google-sheets';
import { getClientIp } from '@/lib/request-ip';
import { toPaisa } from '@/lib/money';

// Mirrors scripts/backfill-ledger.ts's CHANNEL_MAP — Transfer's channel enum
// isn't identical to LedgerEntry's (no BANK_TRANSFER/INTERNAL overlap).
const CHANNEL_MAP: Record<string, string> = {
    BANK_TRANSFER: 'BANK',
    BKASH: 'BKASH',
    NAGAD: 'NAGAD',
    ROCKET: 'ROCKET',
    CASH: 'CASH',
    OTHER: 'OTHER',
};

function isDuplicateKeyError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;
}

// Verifying a Transfer is the only place that should ever turn a member
// contribution into a POSTED LedgerEntry — every read (dashboard, ledger,
// summaries) sums LedgerEntry only, never Transfer directly (see
// src/lib/ledger.ts). Without this, a VERIFIED transfer is invisible
// everywhere except the transfers list itself.
//
// Idempotent via LedgerEntry's unique (source.sourceType, source.id, type)
// index (see src/models/LedgerEntry.ts) — a duplicate-key error here just
// means an entry already exists for this transfer/type, which is fine.
async function createLedgerEntriesForTransfer(transfer: any, verifiedById: string) {
    const attachments = transfer.paymentProofUrl
        ? [{
            url: transfer.paymentProofUrl,
            publicId: transfer.paymentProofPublicId,
            kind: 'SCREENSHOT' as const,
            uploadedAt: transfer.createdAt,
            uploadedBy: transfer.initiator?._id || transfer.initiator,
        }]
        : [];

    const parts: { type: 'CONTRIBUTION_MONTHLY' | 'CONTRIBUTION_FLEX'; amount: number; title: string }[] = [];
    if (transfer.monthlyAmount > 0) {
        parts.push({
            type: 'CONTRIBUTION_MONTHLY',
            amount: toPaisa(transfer.monthlyAmount),
            title: `Monthly contribution — ${transfer.selectMonth}`,
        });
    }
    if (transfer.flexAmount > 0) {
        parts.push({
            type: 'CONTRIBUTION_FLEX',
            amount: toPaisa(transfer.flexAmount),
            title: `Flexible contribution — ${transfer.selectMonth}`,
        });
    }

    for (const part of parts) {
        try {
            await LedgerEntry.create({
                direction: 'CREDIT',
                status: 'POSTED',
                currency: 'BDT',
                memberId: transfer.initiator?._id || transfer.initiator,
                period: transfer.selectMonth,
                valueDate: transfer.transferDate,
                channel: CHANNEL_MAP[transfer.transferChannel] || 'OTHER',
                attachments,
                createdBy: transfer.initiator?._id || transfer.initiator,
                requiredApprovals: 0,
                approvals: [{ by: verifiedById, at: transfer.verifiedAt }],
                postedAt: transfer.verifiedAt,
                source: { sourceType: 'Transfer', id: transfer._id },
                ...part,
            });
        } catch (error) {
            if (!isDuplicateKeyError(error)) throw error;
        }
    }
}

// A CLOSED month's Period.snapshot is meant to be a frozen, permanent fact
// (see /api/periods/[month]/close) — but late payments are common and
// verifying one must never be blocked by that freeze. Left alone, verifying
// a late payment for an already-closed month would silently make the
// frozen snapshot wrong (it wouldn't include this payment) while it keeps
// claiming to be the final word for that month. So instead: auto-reopen it.
// That flips /api/periods/[month] back to computing a live snapshot (see
// its GET handler) until someone deliberately closes the month again,
// re-freezing it with the corrected total.
async function reopenClosedPeriodIfNeeded(month: string, actorId: string, actorName: string): Promise<boolean> {
    const period = await Period.findOne({ month });
    if (!period || period.status !== 'CLOSED') return false;

    const reason = `Auto-reopened: a late payment for ${month} was verified after this month was closed.`;
    period.status = 'REOPENED';
    period.reopenedBy = actorId as any;
    period.reopenedAt = new Date();
    period.reopenReason = reason;
    await period.save();

    const AuditLog = (await import('@/models/AuditLog')).default;
    await AuditLog.create({
        actorId,
        actorName,
        action: 'PERIOD_REOPENED',
        targetCollection: 'Period',
        targetId: String(period._id),
        newValue: { month, reason, trigger: 'late_transfer_verification' },
    });

    return true;
}

const verifyTransferSchema = z.object({
    status: z.enum(['VERIFIED', 'REJECTED']),
    rejectionReason: z.string().trim().optional(),
    remarks: z.string().trim().max(500).optional(),
}).superRefine((data, ctx) => {
    if (data.status === 'REJECTED' && !data.rejectionReason) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['rejectionReason'],
            message: 'Rejection reason is required',
        });
    }
});

const mapTransfer = (t: any) => ({
    id: t._id.toString(),
    userId: t.initiator?.toString?.() || '',
    transferDate: t.transferDate,
    accountName: t.accountName,
    accountNumber: t.accountNumber,
    bankName: t.bankName,
    selectMonth: t.selectMonth,
    transferChannel: t.transferChannel,
    monthlyAmount: t.monthlyAmount,
    flexAmount: t.flexAmount,
    totalAmount: t.totalAmount,
    paymentProofUrl: t.paymentProofUrl,
    paymentProofPublicId: t.paymentProofPublicId,
    status: t.status,
    remarks: t.remarks,
    rejectionReason: t.rejectionReason,
    verifiedById: t.verifiedById?.toString?.(),
    verifiedAt: t.verifiedAt,
    syncedToSheet: t.syncedToSheet,
    syncedAt: t.syncedAt,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        
        const session = await auth();
        // Only allow admins and moderators
        if (!session?.user?.id || !['admin', 'moderator', 'co_admin'].includes(session.user.role)) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const parsedBody = verifyTransferSchema.safeParse(body);

        if (!parsedBody.success) {
            return NextResponse.json(
                { success: false, message: parsedBody.error.issues[0]?.message || 'Invalid status' },
                { status: 400 }
            );
        }

        const { status, rejectionReason, remarks } = parsedBody.data;

        await connectDB();

        const transfer = await Transfer.findById(id)
            .populate('initiator', 'name email')
            .populate('verifiedById', 'name email');

        if (!transfer) {
            return NextResponse.json({ success: false, message: 'Transfer not found' }, { status: 404 });
        }

        if (transfer.status !== 'PENDING') {
            return NextResponse.json({
                success: false,
                message: `Transfer is already ${transfer.status.toLowerCase()}`
            }, { status: 400 });
        }

        transfer.status = status;
        transfer.verifiedById = session.user.id as any;
        transfer.verifiedAt = new Date();
        // Only touch remarks if the request actually supplied one — an
        // omitted field must not wipe out remarks left by a prior action.
        if (remarks !== undefined) {
            transfer.remarks = remarks;
        }
        transfer.syncedToSheet = false;
        transfer.syncedAt = undefined;

        if (status === 'REJECTED') {
            transfer.rejectionReason = rejectionReason;
            transfer.remarks = rejectionReason;
            // Take this transfer out of the unique (initiator, selectMonth,
            // paymentType) index (see Transfer.ts) so the member can
            // resubmit for the same month without hitting a duplicate-key
            // error — a rejected transfer should never block a fresh one.
            transfer.paymentType = undefined;
        } else {
            transfer.rejectionReason = undefined;
        }

        await transfer.save();

        let reopenedClosedPeriod = false;
        if (status === 'VERIFIED') {
            await createLedgerEntriesForTransfer(transfer, session.user.id);
            reopenedClosedPeriod = await reopenClosedPeriodIfNeeded(
                transfer.selectMonth,
                session.user.id,
                session.user.name || 'Unknown'
            );
            await rebuildMonthlySummaryForMonth(transfer.selectMonth);

            try {
                await syncTransferToGoogleSheets(transfer as any, session.user.name || 'Unknown');
                transfer.syncedToSheet = true;
                transfer.syncedAt = new Date();
                await transfer.save();
            } catch (syncError) {
                console.warn('Transfer sheet sync failed:', syncError);
            }
        }

        // Create an audit log
        const AuditLog = (await import('@/models/AuditLog')).default;
        const actionLabel = status === 'VERIFIED' ? 'TRANSFER_VERIFIED' : 'TRANSFER_REJECTED';

        await AuditLog.create({
            actorId: session.user.id,
            actorName: session.user.name || 'Unknown',
            action: actionLabel,
            targetCollection: 'Transfers',
            targetId: transfer._id.toString(),
            ipAddress: getClientIp(request.headers),
        });

        if (status === 'VERIFIED' && transfer.syncedToSheet) {
            await AuditLog.create({
                actorId: session.user.id,
                actorName: session.user.name || 'Unknown',
                action: 'SHEET_SYNCED',
                targetCollection: 'Transfers',
                targetId: transfer._id.toString(),
            });
        }

        return NextResponse.json({
            success: true,
            message: reopenedClosedPeriod
                ? `Payment verified successfully. ${transfer.selectMonth} had already been closed — it's been reopened so this payment is reflected. Close it again once you're done.`
                : `Payment ${status.toLowerCase()} successfully`,
            data: mapTransfer(transfer)
        });

    } catch (error: any) {
        console.error('Transfer verification error:', error);
        return NextResponse.json(
            { success: false, message: error.message || 'Failed to verify transfer' },
            { status: 500 }
        );
    }
}
