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

// POST is handled by /api/bank-accounts (root) — this route only ever served
// GET from the client. Kept as GET-only to remove the duplicate, vulnerable
// POST handler that used to live here (see /api/bank-accounts/route.ts).
