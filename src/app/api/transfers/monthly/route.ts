import { NextResponse, after } from 'next/server';
import mongoose from 'mongoose';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongoose';
import Transfer from '@/models/Transfer';
import BankAccount from '@/models/BankAccount';
import User from '@/models/User';
import AuditLog from '@/models/AuditLog';
import { getClientIp } from '@/lib/request-ip';
import { sendPaymentSubmittedEmail } from '@/lib/email';
import { formatMonthLabel } from '@/lib/policies';
import { assertMonthlyMonthsAvailable, assertTransactionSupport, getMonthlyPaymentLimits, MonthlyPaymentConflictError, validateMonthlyMonths } from '@/lib/monthly-payments';

const schema = z.object({
  months: z.array(z.string()).min(1),
  transferDate: z.coerce.date(),
  transferChannel: z.enum(['BANK_TRANSFER', 'BKASH', 'NAGAD', 'ROCKET', 'CASH', 'OTHER']),
  bankAccountId: z.string().optional(),
  accountName: z.string().trim().optional(),
  accountNumber: z.string().trim().optional(),
  bankName: z.string().trim().optional(),
  paymentProofUrl: z.string().url(),
  paymentProofPublicId: z.string().optional(),
  remarks: z.string().trim().max(500).optional(),
  flexAmount: z.number().finite().min(0).default(0),
  totalAmount: z.number().finite().optional(),
});

export async function POST(request: Request) {
  try {
    const user = await auth();
    if (!user?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ success: false, message: parsed.error.issues[0]?.message }, { status: 400 });
    const data = parsed.data;
    let months: string[];
    try { months = validateMonthlyMonths(data.months); }
    catch (error: unknown) { return NextResponse.json({ success: false, message: error instanceof Error ? error.message : 'Invalid months' }, { status: 400 }); }
    const limits = getMonthlyPaymentLimits();
    const flexPaisa = Math.round(data.flexAmount * 100);
    if (!Number.isSafeInteger(flexPaisa) || Math.abs(data.flexAmount * 100 - flexPaisa) > 0.000001) {
      return NextResponse.json({ success: false, message: 'Flexible amount must have at most two decimal places.' }, { status: 400 });
    }
    if (data.flexAmount > 0 && new Set(months.map((month) => month.slice(0, 4))).size > 1) {
      return NextResponse.json({ success: false, message: 'Months with an extra flexible payment must be in the same year.' }, { status: 400 });
    }
    const monthlyAmount = months.length * limits.monthlyAmount;
    const totalAmount = monthlyAmount + data.flexAmount;
    if (data.totalAmount !== undefined && data.totalAmount !== totalAmount) {
      return NextResponse.json({ success: false, message: 'Payment total does not match the selected months.' }, { status: 400 });
    }
    if (data.transferDate > new Date()) {
      return NextResponse.json({ success: false, message: 'Transfer date cannot be in the future.' }, { status: 400 });
    }
    await connectDB();
    await assertTransactionSupport();

    let accountName = data.accountName;
    let accountNumber = data.accountNumber;
    let bankName = data.bankName;
    if (data.transferChannel === 'BANK_TRANSFER' && data.bankAccountId) {
      const bank = await BankAccount.findOne({ _id: data.bankAccountId, userId: user.user.id, isActive: true });
      if (!bank) return NextResponse.json({ success: false, message: 'Selected bank account was not found or is inactive.' }, { status: 400 });
      accountName = bank.accountHolderName || accountName;
      accountNumber = bank.accountNumber || accountNumber;
      bankName = bank.bankName || bankName;
    }
    if (data.transferChannel === 'BANK_TRANSFER' && (!accountName || !accountNumber || !bankName)) {
      return NextResponse.json({ success: false, message: 'Bank transfer submissions must include bank details.' }, { status: 400 });
    }

    const groupId = months.length > 1 ? new mongoose.Types.ObjectId() : undefined;
    let firstId = '';
    let createdAt = new Date();
    await mongoose.connection.transaction(async (dbSession) => {
      await assertMonthlyMonthsAvailable(user.user.id, months, dbSession);
      const records = await Transfer.create(months.map((month, index) => ({
        initiator: user.user.id,
        transferDate: data.transferDate,
        selectMonth: month,
        paymentGroupId: groupId,
        paymentGroupSize: groupId ? months.length : undefined,
        transferChannel: data.transferChannel,
        accountName,
        accountNumber,
        bankName,
        monthlyAmount: limits.monthlyAmount,
        // The yearly flexible amount is attributed to the first selected
        // month; the other month records keep exactly one monthly amount each.
        flexAmount: index === 0 ? data.flexAmount : 0,
        paymentType: 'monthly',
        totalAmount: limits.monthlyAmount + (index === 0 ? data.flexAmount : 0),
        paymentProofUrl: data.paymentProofUrl,
        paymentProofPublicId: data.paymentProofPublicId,
        remarks: data.remarks,
        status: 'PENDING',
      })), { session: dbSession, ordered: true });
      firstId = String(records[0]._id);
      createdAt = records[0].createdAt;
      await AuditLog.create([{
        actorId: user.user.id,
        actorName: user.user.name || 'Unknown',
        action: 'TRANSFER_CREATED',
        targetCollection: 'Transfers',
        targetId: firstId,
        newValue: { months, paymentGroupId: groupId ? String(groupId) : undefined, monthlyAmount, flexAmount: data.flexAmount, totalAmount },
        ipAddress: getClientIp(request.headers),
      }], { session: dbSession, ordered: true });
    });

    try {
      const reviewers = await User.find({ role: { $in: ['admin', 'co_admin'] }, isActive: true, _id: { $ne: user.user.id } }).select('name email');
      if (reviewers.length) {
        const appUrl = process.env.NEXTAUTH_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
        const periodLabel = months.map(formatMonthLabel).join(', ');
        after(async () => {
          await Promise.all(reviewers.map((reviewer) => sendPaymentSubmittedEmail(
            reviewer.email, reviewer.name, user.user.name || 'A member', totalAmount, periodLabel,
            data.transferChannel.replaceAll('_', ' '), `${appUrl}/admin/payments/pending`
          ).catch((error) => console.error('Payment notification failed:', error))));
        });
      }
    } catch (notificationError) {
      console.error('Payment saved, but reviewer notification setup failed:', notificationError);
    }
    return NextResponse.json({ success: true, message: 'Payment submitted successfully', data: {
      id: firstId,
      userId: user.user.id,
      transferDate: data.transferDate,
      accountName,
      accountNumber,
      bankName,
      selectMonth: months[0],
      paymentGroupId: groupId ? String(groupId) : undefined,
      months: groupId ? months : undefined,
      transferChannel: data.transferChannel,
      monthlyAmount,
      flexAmount: data.flexAmount,
      totalAmount,
      paymentProofUrl: data.paymentProofUrl,
      paymentProofPublicId: data.paymentProofPublicId,
      status: 'PENDING',
      remarks: data.remarks,
      syncedToSheet: false,
      createdAt,
      updatedAt: createdAt,
    } }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof MonthlyPaymentConflictError) {
      return NextResponse.json({ success: false, message: error.message }, { status: 409 });
    }
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
      return NextResponse.json({ success: false, message: 'A payment for one of these months already exists.' }, { status: 409 });
    }
    console.error('Monthly payment submission error:', error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : 'Failed to submit payment' }, { status: 500 });
  }
}
