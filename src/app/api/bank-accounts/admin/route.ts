import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongoose';
import BankAccount from '@/models/BankAccount';
import User from '@/models/User';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const admins = await User.find({ role: { $in: ['admin', 'moderator'] }, isActive: true }).select('_id');
    const adminIds = admins.map((user) => user._id);

    const bankAccounts = await BankAccount.find({
      userId: { $in: adminIds },
      isActive: true,
    })
      .sort({ isPrimary: -1, createdAt: -1 })
      .populate('userId', 'name email role');

    return NextResponse.json({
      success: true,
      data: bankAccounts.map((account: any) => ({
        id: String(account._id),
        userId: typeof account.userId === 'object' ? String(account.userId._id) : String(account.userId),
        ownerName: typeof account.userId === 'object' ? account.userId.name : undefined,
        ownerEmail: typeof account.userId === 'object' ? account.userId.email : undefined,
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
      message: 'Admin bank accounts fetched successfully',
    });
  } catch (error: any) {
    console.error('Fetch admin bank accounts error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch admin bank accounts' },
      { status: 500 }
    );
  }
}
