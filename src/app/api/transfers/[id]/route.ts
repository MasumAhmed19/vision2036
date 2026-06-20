import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongoose';
import Transfer from '@/models/Transfer';

const mapTransfer = (t: any) => {
    const initiator = t.initiator && typeof t.initiator === 'object' ? t.initiator : null;
    const verifiedBy = t.verifiedById && typeof t.verifiedById === 'object' ? t.verifiedById : null;

    return {
        id: t._id.toString(),
        userId: initiator?._id?.toString?.() || t.initiator?.toString?.() || '',
        user: initiator ? {
            id: initiator._id.toString(),
            name: initiator.name,
            email: initiator.email,
            avatar: initiator.avatar,
            role: initiator.role,
            phoneNumber: initiator.phoneNumber ?? null,
            isActive: initiator.isActive ?? true,
        } : undefined,
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
        verifiedById: verifiedBy?._id?.toString?.() || t.verifiedById?.toString?.() || undefined,
        verifiedAt: t.verifiedAt,
        syncedToSheet: t.syncedToSheet,
        syncedAt: t.syncedAt,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
    };
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();

        if (!session?.user?.id) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        await connectDB();

        const transfer = await Transfer.findById(id)
            .populate('initiator', 'name email avatar role phoneNumber isActive')
            .populate('verifiedById', 'name email');

        if (!transfer) {
            return NextResponse.json({ success: false, message: 'Transfer not found' }, { status: 404 });
        }

        const isPrivileged = ['admin', 'moderator'].includes(session.user.role);
        const initiatorId = typeof transfer.initiator === 'object'
            ? transfer.initiator._id.toString()
            : transfer.initiator?.toString?.();
        const ownsTransfer = initiatorId === session.user.id;

        if (!isPrivileged && !ownsTransfer) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 403 });
        }

        return NextResponse.json({
            success: true,
            data: mapTransfer(transfer),
            message: 'Transfer fetched successfully',
        });
    } catch (error: any) {
        console.error('Fetch transfer error:', error);
        return NextResponse.json(
            { success: false, message: error.message || 'Failed to fetch transfer' },
            { status: 500 }
        );
    }
}
