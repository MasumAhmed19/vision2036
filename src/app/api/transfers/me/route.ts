import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongoose';
import { findGroupedTransfers } from '@/lib/monthly-payments';

const mapTransfer = (t: any) => ({
    id: t._id.toString(),
    userId: t.initiator?.toString?.() || '',
    transferDate: t.transferDate,
    accountName: t.accountName,
    accountNumber: t.accountNumber,
    bankName: t.bankName,
    selectMonth: t.selectMonth,
    paymentGroupId: t.paymentGroupId?.toString?.(),
    months: t.months,
    transferChannel: t.transferChannel,
    monthlyAmount: t.monthlyAmount,
    flexAmount: t.flexAmount,
    totalAmount: t.totalAmount,
    paymentProofUrl: t.paymentProofUrl,
    paymentProofPublicId: t.paymentProofPublicId,
    status: t.status,
    remarks: t.remarks,
    rejectionReason: t.rejectionReason,
    verifiedById: t.verifiedById ? t.verifiedById._id.toString() : undefined,
    verifiedAt: t.verifiedAt,
    syncedToSheet: t.syncedToSheet,
    syncedAt: t.syncedAt,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
});

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '10');
        const status = searchParams.get('status');
        const year = searchParams.get('year');
        const paymentType = searchParams.get('paymentType');
        const month = searchParams.get('month');
        const channel = searchParams.get('channel');

        await connectDB();

        const query: any = { initiator: session.user.id };

        if (status && status !== 'all') {
            query.status = status;
        }

        if (month) {
            query.selectMonth = month;
        } else if (year && year !== 'all') {
            query.selectMonth = { $regex: `^${year}-` };
        }

        if (channel && channel !== 'all') {
            query.transferChannel = channel;
        }

        if (paymentType && paymentType !== 'all') {
            if (paymentType === 'monthly') {
                query.monthlyAmount = { $gt: 0 };
            } else if (paymentType === 'yearly') {
                query.flexAmount = { $gt: 0 };
            }
        }

        const { rows: transfers, total, page: safePage, limit: safeLimit } = await findGroupedTransfers(query, page, limit);

        return NextResponse.json({
            success: true,
            data: transfers.map(mapTransfer),
            message: 'Transfers fetched successfully',
            meta: {
                total,
                page: safePage,
                limit: safeLimit,
                totalPage: Math.ceil(total / safeLimit),
            },
        });
    } catch (error: any) {
        console.error('Fetch user transfers error:', error);
        return NextResponse.json(
            { success: false, message: error.message || 'Failed to fetch transfers' },
            { status: 500 }
        );
    }
}
