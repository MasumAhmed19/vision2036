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

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const bankAccounts = await BankAccount.find({ userId: session.user.id }).sort({ createdAt: -1 });

    return NextResponse.json({
      success: true,
      data: bankAccounts.map(mapBankAccount),
      message: 'Bank accounts fetched successfully',
    });
  } catch (error: any) {
    console.error('Fetch bank accounts error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch bank accounts' },
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
    await connectDB();

    const newAccount = await BankAccount.create({
      userId: session.user.id,
      ...body,
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
