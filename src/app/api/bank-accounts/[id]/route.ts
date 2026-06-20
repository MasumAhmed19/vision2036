import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongoose';
import BankAccount from '@/models/BankAccount';

// Helper to check ownership or admin access
async function verifyAccess(accountId: string, sessionUser: any) {
    await connectDB();
    const account = await BankAccount.findById(accountId);

    if (!account) return { account: null, error: 'Not found', status: 404 };

    // Check if user owns account or is admin
    const isOwner = account.userId.toString() === sessionUser.id;
    const isAdmin = ['admin', 'moderator'].includes(sessionUser.role);

    if (!isOwner && !isAdmin) {
        return { account: null, error: 'Unauthorized', status: 403 };
    }

    return { account, error: null };
}

// GET single account
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const params = await context.params;
        const { account, error, status } = await verifyAccess(params.id, session.user);

        if (error) {
            return NextResponse.json({ success: false, message: error }, { status });
        }

        return NextResponse.json({
            success: true,
            data: {
                id: String(account!._id),
                userId: String(account!.userId),
                bankName: account!.bankName,
                accountNumber: account!.accountNumber,
                accountHolderName: account!.accountHolderName,
                branchName: account!.branchName,
                routingNumber: account!.routingNumber,
                isPrimary: account!.isPrimary,
                isActive: account!.isActive,
                createdAt: account!.createdAt,
                updatedAt: account!.updatedAt,
            },
        });
    } catch (error: any) {
        return NextResponse.json(
            { success: false, message: error.message || 'Error fetching account' },
            { status: 500 }
        );
    }
}

// PATCH update account
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const params = await context.params;
        const { account, error, status } = await verifyAccess(params.id, session.user);

        if (error || !account) {
            return NextResponse.json({ success: false, message: error }, { status });
        }

        const body = await request.json();
        // Update fields safely
        ['bankName', 'accountNumber', 'accountHolderName', 'branchName', 'routingNumber', 'isPrimary', 'isActive'].forEach((key) => {
            if (body[key] !== undefined) {
                (account as any)[key] = body[key];
            }
        });

        await account.save();

        return NextResponse.json({
            success: true,
            data: {
                id: String(account._id),
                userId: String(account.userId),
                bankName: account.bankName,
                accountNumber: account.accountNumber,
                accountHolderName: account.accountHolderName,
                branchName: account.branchName,
                routingNumber: account.routingNumber,
                isPrimary: account.isPrimary,
                isActive: account.isActive,
                createdAt: account.createdAt,
                updatedAt: account.updatedAt,
            },
            message: 'Account updated successfully',
        });
    } catch (error: any) {
        return NextResponse.json(
            { success: false, message: error.message || 'Error updating account' },
            { status: 500 }
        );
    }
}

// DELETE account
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const params = await context.params;
        const { account, error, status } = await verifyAccess(params.id, session.user);

        if (error || !account) {
            return NextResponse.json({ success: false, message: error }, { status });
        }

        await account.deleteOne();
        return NextResponse.json({
            success: true,
            data: null,
            message: 'Bank account deleted successfully',
        });
    } catch (error: any) {
        return NextResponse.json(
            { success: false, message: error.message || 'Error deleting account' },
            { status: 500 }
        );
    }
}
