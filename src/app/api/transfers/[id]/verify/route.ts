import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongoose';
import Transfer from '@/models/Transfer';
import { rebuildMonthlySummaryForMonth } from '@/lib/summary-engine';
import { syncTransferToGoogleSheets } from '@/lib/google-sheets';

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
        if (!session?.user?.id || !['admin', 'moderator'].includes(session.user.role)) {
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
        transfer.remarks = remarks;
        transfer.syncedToSheet = false;
        transfer.syncedAt = undefined;

        if (status === 'REJECTED') {
            transfer.rejectionReason = rejectionReason;
            transfer.remarks = rejectionReason;
        } else {
            transfer.rejectionReason = undefined;
        }

        await transfer.save();

        if (status === 'VERIFIED') {
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
            ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'Unknown',
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
            message: `Payment ${status.toLowerCase()} successfully`,
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
