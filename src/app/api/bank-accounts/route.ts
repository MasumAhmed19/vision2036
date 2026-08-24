import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongoose';
import BankAccount from '@/models/BankAccount';

const mapBankAccount = (account: any) => ({
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
});

// GET is served by /api/bank-accounts/me — the client never calls GET here.

const ALLOWED_FIELDS = [
  'bankName',
  'accountNumber',
  'accountHolderName',
  'branchName',
  'routingNumber',
  'isPrimary',
] as const;

function pickBankAccountFields(body: Record<string, unknown>) {
  const picked: Record<string, unknown> = {};
  for (const key of ALLOWED_FIELDS) {
    if (body[key] !== undefined) picked[key] = body[key];
  }
  return picked;
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    await connectDB();

    // userId always comes from the session, never from the request body —
    // body is whitelisted first so a client-supplied `userId` can't override it.
    const newAccount = await BankAccount.create({
      ...pickBankAccountFields(body),
      userId: session.user.id,
    });

    return NextResponse.json(
      {
        success: true,
        data: mapBankAccount(newAccount),
        message: 'Bank account added successfully',
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Create bank account error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to create bank account' },
      { status: 500 }
    );
  }
}
