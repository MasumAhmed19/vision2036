import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongoose';
import Transfer from '@/models/Transfer';
import User from '@/models/User';
import BankAccount from '@/models/BankAccount';

const transferChannels = ['BANK_TRANSFER', 'BKASH', 'NAGAD', 'ROCKET', 'CASH', 'OTHER'] as const;

const createTransferSchema = z.object({
    bankAccountId: z.string().optional(),
    transferDate: z.coerce.date(),
    accountName: z.string().trim().optional(),
    accountNumber: z.string().trim().optional(),
    bankName: z.string().trim().optional(),
    selectMonth: z.string().regex(/^\d{4}-\d{2}$/, 'Invalid contribution month'),
    transferChannel: z.enum(transferChannels),
    monthlyAmount: z.coerce.number().min(0).default(0),
    flexAmount: z.coerce.number().min(0).default(0),
    totalAmount: z.coerce.number().positive('Total amount must be greater than 0'),
    paymentProofUrl: z.string().url('Payment proof is required'),
    paymentProofPublicId: z.string().optional(),
    remarks: z.string().trim().max(500).optional(),
}).superRefine((data, ctx) => {
    if (data.monthlyAmount <= 0 && data.flexAmount <= 0) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['totalAmount'],
            message: 'Monthly amount or flex amount must be greater than 0.',
        });
    }

    if (data.totalAmount !== data.monthlyAmount + data.flexAmount) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['totalAmount'],
            message: 'Total amount must equal monthly amount plus flex amount.',
        });
    }

    if (
        data.transferChannel === 'BANK_TRANSFER'
        && !data.bankAccountId
        && (!data.accountName || !data.accountNumber || !data.bankName)
    ) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['transferChannel'],
            message: 'Bank transfer submissions must include bank details.',
        });
    }
});

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

export async function GET(request: Request) {
    try {
        const session = await auth();
        // Only allow admins and moderators
        if (!session?.user?.id || !['admin', 'moderator'].includes(session.user.role)) {
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
        const member = searchParams.get('member');
        const memberId = searchParams.get('memberId');

        await connectDB();

        const query: any = {};

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

        if (memberId && memberId !== 'all') {
            query.initiator = memberId;
        } else if (member?.trim()) {
            const matchingUsers = await User.find({
                $or: [
                    { name: { $regex: member.trim(), $options: 'i' } },
                    { email: { $regex: member.trim(), $options: 'i' } },
                ],
            }).select('_id');

            query.initiator = {
                $in: matchingUsers.map((user) => user._id),
            };
        }

        if (paymentType && paymentType !== 'all') {
            if (paymentType === 'monthly') {
                query.monthlyAmount = { $gt: 0 };
                query.flexAmount = 0;
            } else if (paymentType === 'yearly') {
                query.flexAmount = { $gt: 0 };
                query.monthlyAmount = 0;
            }
        }

        const skip = (page - 1) * limit;

        const [transfers, total] = await Promise.all([
            Transfer.find(query)
                .sort({ transferDate: -1 })
                .skip(skip)
                .limit(limit)
                .populate('initiator', 'name email avatar role phoneNumber isActive')
                .populate('verifiedById', 'name email'),
            Transfer.countDocuments(query),
        ]);

        return NextResponse.json({
            success: true,
            data: transfers.map(mapTransfer),
            message: 'Transfers fetched successfully',
            meta: {
                total,
                page,
                limit,
                totalPage: Math.ceil(total / limit),
            },
        });
    } catch (error: any) {
        console.error('Fetch all transfers error:', error);
        return NextResponse.json(
            { success: false, message: error.message || 'Failed to fetch transfers' },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const parsedBody = createTransferSchema.safeParse(body);

        if (!parsedBody.success) {
            return NextResponse.json(
                {
                    success: false,
                    message: parsedBody.error.issues[0]?.message || 'Invalid payment submission payload',
                },
                { status: 400 }
            );
        }

        const {
            bankAccountId,
            transferDate,
            accountName,
            accountNumber,
            bankName,
            selectMonth,
            transferChannel,
            monthlyAmount,
            flexAmount,
            totalAmount,
            paymentProofUrl,
            paymentProofPublicId,
            remarks,
        } = parsedBody.data;

        await connectDB();

        let resolvedAccountName = accountName;
        let resolvedAccountNumber = accountNumber;
        let resolvedBankName = bankName;

        if (transferChannel === 'BANK_TRANSFER' && bankAccountId) {
            const bankAccount = await BankAccount.findOne({
                _id: bankAccountId,
                userId: session.user.id,
                isActive: true,
            });

            if (!bankAccount) {
                return NextResponse.json({
                    success: false,
                    message: 'Selected bank account was not found or is inactive.',
                }, { status: 400 });
            }

            resolvedAccountName = bankAccount.accountHolderName || resolvedAccountName;
            resolvedAccountNumber = bankAccount.accountNumber || resolvedAccountNumber;
            resolvedBankName = bankAccount.bankName || resolvedBankName;
        }

        if (
            transferChannel === 'BANK_TRANSFER'
            && (!resolvedAccountName || !resolvedAccountNumber || !resolvedBankName)
        ) {
            return NextResponse.json({
                success: false,
                message: 'Bank transfer submissions must include bank details.',
            }, { status: 400 });
        }

        // Check for duplicate monthly payment: block if a monthly payment already exists for this month
        if (monthlyAmount > 0) {
            const existingMonthlyTransfer = await Transfer.findOne({
                initiator: session.user.id,
                selectMonth,
                monthlyAmount: { $gt: 0 },
            });

            if (existingMonthlyTransfer) {
                return NextResponse.json({
                    success: false,
                    message: `A monthly payment for ${selectMonth} has already been submitted.`,
                }, { status: 400 });
            }
        }

        // Check for duplicate flex payment: block if a flex-only payment already exists for this month
        if (monthlyAmount === 0 && flexAmount > 0) {
            const existingFlexTransfer = await Transfer.findOne({
                initiator: session.user.id,
                selectMonth,
                monthlyAmount: 0,
                flexAmount: { $gt: 0 },
            });

            if (existingFlexTransfer) {
                return NextResponse.json({
                    success: false,
                    message: `A flexible payment for ${selectMonth} has already been submitted.`,
                }, { status: 400 });
            }
        }

        const newTransferData: any = {
            initiator: session.user.id,
            transferDate,
            accountName: resolvedAccountName,
            accountNumber: resolvedAccountNumber,
            bankName: resolvedBankName,
            selectMonth,
            transferChannel,
            monthlyAmount: monthlyAmount || 0,
            flexAmount: flexAmount || 0,
            totalAmount,
            paymentProofUrl,
            paymentProofPublicId,
            status: 'PENDING',
            remarks,
        };

        if (bankAccountId) {
            newTransferData.bankAccount = bankAccountId;
        }

        const newTransfer = await Transfer.create(newTransferData);

        // Create an audit log
        const AuditLog = (await import('@/models/AuditLog')).default;
        await AuditLog.create({
            actorId: session.user.id,
            actorName: session.user.name || 'Unknown',
            action: 'TRANSFER_CREATED',
            targetCollection: 'Transfers',
            targetId: newTransfer._id.toString(),
            ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'Unknown',
        });

        return NextResponse.json({
            success: true,
            message: 'Payment submitted successfully',
            data: mapTransfer(newTransfer)
        }, { status: 201 });

    } catch (error: any) {
        console.error('Payment submission error:', error);

        // Handle Mongoose duplicate key error specifically
        if (error.code === 11000) {
            return NextResponse.json(
                { success: false, message: 'A payment for this month already exists.' },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { success: false, message: error.message || 'Failed to submit payment' },
            { status: 500 }
        );
    }
}
