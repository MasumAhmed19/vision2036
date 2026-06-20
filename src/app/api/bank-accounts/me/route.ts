import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongoose';
import BankAccount from '@/models/BankAccount';

// GET all bank accounts for the logged-in user
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();

        const bankAccounts = await BankAccount.find({ userId: session.user.id }).sort({ createdAt: -1 });

        return NextResponse.json({
            success: true,
            data: bankAccounts.map(account => ({
                id: (account._id as { toString(): string }).toString(),
                userId: (account.userId as { toString(): string }).toString(),
                bankName: account.bankName,
                accountNumber: account.accountNumber,
                accountHolderName: account.accountHolderName,
                branchName: account.branchName,
                routingNumber: account.routingNumber,
                isPrimary: account.isPrimary,
                isActive: account.isActive,
                createdAt: account.createdAt,
                updatedAt: account.updatedAt,
            })),
        });
    } catch (error: any) {
        console.error('Fetch bank accounts error:', error);
        return NextResponse.json(
            { success: false, message: error.message || 'Failed to fetch bank accounts' },
            { status: 500 }
        );
    }
}

// POST create a new bank account
export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();

        await connectDB();

        const newAccount = new BankAccount({
            userId: session.user.id,
            ...body,
        });

        await newAccount.save(); // The pre-save hook handles the isPrimary singular logic

        return NextResponse.json({
            success: true,
            data: {
                id: (newAccount._id as { toString(): string }).toString(),
                userId: (newAccount.userId as { toString(): string }).toString(),
                bankName: newAccount.bankName,
                accountNumber: newAccount.accountNumber,
                accountHolderName: newAccount.accountHolderName,
                branchName: newAccount.branchName,
                routingNumber: newAccount.routingNumber,
                isPrimary: newAccount.isPrimary,
                isActive: newAccount.isActive,
                createdAt: newAccount.createdAt,
                updatedAt: newAccount.updatedAt,
            },
            message: 'Bank account added successfully',
        }, { status: 201 });
    } catch (error: any) {
        console.error('Create bank account error:', error);
        return NextResponse.json(
            { success: false, message: error.message || 'Failed to create bank account' },
            { status: 500 }
        );
    }
}
