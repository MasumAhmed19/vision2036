import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongoose';
import User from '@/models/User';

const payloadSchema = z.object({
  newPassword: z.string().min(8).max(64).optional(),
});

function generateTemporaryPassword() {
  return `V2036-${randomBytes(4).toString('hex')}`;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.role !== 'admin') {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = payloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, message: 'Invalid payload' }, { status: 400 });
    }

    const { id } = await params;
    await connectDB();

    const user = await User.findById(id).select('+password');
    if (!user) {
      return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
    }

    const temporaryPassword = parsed.data.newPassword || generateTemporaryPassword();
    user.password = temporaryPassword;
    await user.save();

    return NextResponse.json({
      success: true,
      data: {
        id: String(user._id),
        temporaryPassword,
      },
      message: 'Password reset successfully',
    });
  } catch (error: any) {
    console.error('Reset password error:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to reset password' }, { status: 500 });
  }
}
