import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongoose';
import Transfer from '@/models/Transfer';
import LedgerEntry from '@/models/LedgerEntry';
import Period from '@/models/Period';
import { rebuildMonthlySummaryForMonth } from '@/lib/summary-engine';
import { syncApprovedTransferToSheet } from '@/lib/transfer-sheet-sync';
import { getClientIp } from '@/lib/request-ip';
import { toPaisa } from '@/lib/money';
import mongoose from 'mongoose';
import AuditLog from '@/models/AuditLog';
import { assertTransactionSupport } from '@/lib/monthly-payments';

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

// Verifying a Transfer is the only place that should ever turn a member
// contribution into a POSTED LedgerEntry — every read (dashboard, ledger,
// summaries) sums LedgerEntry only, never Transfer directly (see
// src/lib/ledger.ts). Without this, a VERIFIED transfer is invisible
// everywhere except the transfers list itself.
//
// The unique source index prevents duplicate postings. A valid entry left by
// an older interrupted approval can be reused when the review is retried.
async function createLedgerEntriesForTransfer(transfer: any, verifiedById: string, session: mongoose.ClientSession) {
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
        const existing = await LedgerEntry.findOne({
            'source.sourceType': 'Transfer',
            'source.id': transfer._id,
            type: part.type,
        }).session(session);
        if (existing) {
            if (existing.status !== 'POSTED' || existing.period !== transfer.selectMonth || existing.amount !== part.amount ||
                String(existing.memberId) !== String(transfer.initiator?._id || transfer.initiator)) {
                throw new Error(`Existing ledger entry for ${transfer.selectMonth} does not match this payment.`);
            }
            continue;
        }
        const entry = {
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
        };
        await LedgerEntry.create([entry], { session, ordered: true });
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
async function reopenClosedPeriodIfNeeded(month: string, actorId: string, actorName: string, session: mongoose.ClientSession): Promise<boolean> {
    const period = await Period.findOne({ month }).session(session);
    if (!period || period.status !== 'CLOSED') return false;

    const reason = `Auto-reopened: a late payment for ${month} was verified after this month was closed.`;
    period.status = 'REOPENED';
    period.reopenedBy = actorId as any;
    period.reopenedAt = new Date();
    period.reopenReason = reason;
    await period.save({ session });

    const log = {
        actorId,
        actorName,
        action: 'PERIOD_REOPENED',
        targetCollection: 'Period',
        targetId: String(period._id),
        newValue: { month, reason, trigger: 'late_transfer_verification' },
    };
    await AuditLog.create([log], { session, ordered: true });

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

        {
            await assertTransactionSupport();
            const isGroup = Boolean(transfer.paymentGroupId);
            let months: string[] = [];
            let groupedTransfers: any[] = [];
            let reopenedClosedPeriod = false;
            let syncedAt: Date | undefined;
            const summaryRefreshFailures: string[] = [];
            const verifiedAt = new Date();
            await mongoose.connection.transaction(async (dbSession) => {
                const group = await Transfer.find(isGroup ? { paymentGroupId: transfer.paymentGroupId } : { _id: transfer._id })
                    .session(dbSession).sort({ selectMonth: 1 });
                if (group.length !== (isGroup ? transfer.paymentGroupSize : 1) || group.some((item) => item.status !== 'PENDING') ||
                    new Set(group.map((item) => item.selectMonth)).size !== group.length) {
                    throw new Error('This submission is incomplete or has already been reviewed.');
                }
                months = group.map((item) => item.selectMonth);
                for (const item of group) {
                    item.status = status;
                    item.verifiedById = session.user.id as any;
                    item.verifiedAt = verifiedAt;
                    item.syncedToSheet = false;
                    item.syncedAt = undefined;
                    if (remarks !== undefined) item.remarks = remarks;
                    if (status === 'REJECTED') {
                        item.rejectionReason = rejectionReason;
                        item.remarks = rejectionReason;
                        item.paymentType = undefined;
                    } else {
                        item.rejectionReason = undefined;
                    }
                    await item.save({ session: dbSession });
                    if (status === 'VERIFIED') {
                        await createLedgerEntriesForTransfer(item, session.user.id, dbSession);
                        reopenedClosedPeriod = await reopenClosedPeriodIfNeeded(
                            item.selectMonth, session.user.id, session.user.name || 'Unknown', dbSession
                        ) || reopenedClosedPeriod;
                    }
                }
                await AuditLog.create([{
                    actorId: session.user.id,
                    actorName: session.user.name || 'Unknown',
                    action: status === 'VERIFIED' ? 'TRANSFER_VERIFIED' : 'TRANSFER_REJECTED',
                    targetCollection: 'Transfers',
                    targetId: String(group[0]._id),
                    newValue: { paymentGroupId: isGroup ? String(transfer.paymentGroupId) : undefined, months },
                    ipAddress: getClientIp(request.headers),
                }], { session: dbSession, ordered: true });
                groupedTransfers = group;
            });

            if (status === 'VERIFIED') {
                for (const month of months) {
                    try { await rebuildMonthlySummaryForMonth(month); }
                    catch (summaryError) {
                        summaryRefreshFailures.push(month);
                        console.error(`Summary rebuild failed for ${month}:`, summaryError);
                    }
                }
                try {
                    syncedAt = await syncApprovedTransferToSheet(id, session.user.name || 'Unknown');
                    await AuditLog.create({
                        actorId: session.user.id,
                        actorName: session.user.name || 'Unknown',
                        action: 'SHEET_SYNCED', targetCollection: 'Transfers', targetId: String(groupedTransfers[0]._id),
                    });
                } catch (syncError) {
                    console.warn('Grouped transfer sheet sync failed:', syncError);
                }
            }
            const totalAmount = groupedTransfers.reduce((sum, item) => sum + item.totalAmount, 0);
            const monthlyAmount = groupedTransfers.reduce((sum, item) => sum + item.monthlyAmount, 0);
            const flexAmount = groupedTransfers.reduce((sum, item) => sum + item.flexAmount, 0);
            return NextResponse.json({
                success: true,
                message: [
                    `Payment ${status.toLowerCase()} successfully.`,
                    reopenedClosedPeriod ? `A closed month was reopened; close it again after review.` : '',
                    summaryRefreshFailures.length
                        ? `Cached summaries for ${summaryRefreshFailures.join(', ')} could not refresh yet; opening monthly summaries will retry.`
                        : '',
                ].filter(Boolean).join(' '),
                data: { ...mapTransfer(groupedTransfers[0]), months: isGroup ? months : undefined,
                    totalAmount, monthlyAmount, flexAmount,
                    syncedToSheet: Boolean(syncedAt), syncedAt,
                    paymentGroupId: isGroup ? String(transfer.paymentGroupId) : undefined },
            });
        }

    } catch (error: any) {
        console.error('Transfer verification error:', error);
        return NextResponse.json(
            { success: false, message: error.message || 'Failed to verify transfer' },
            { status: 500 }
        );
    }
}
