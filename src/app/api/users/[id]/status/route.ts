import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongoose';
import User from '@/models/User';
import AuditLog from '@/models/AuditLog';

const payloadSchema = z.object({
  isActive: z.boolean(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id || !['admin', 'moderator', 'co_admin'].includes(session.user.role)) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = payloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, message: 'Invalid payload' }, { status: 400 });
    }

    const { id } = await params;
    if (id === session.user.id) {
      return NextResponse.json({ success: false, message: 'You cannot change your own active status' }, { status: 400 });
    }

    await connectDB();

    const user = await User.findById(id);
    if (!user) {
      return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
    }

    // A moderator may only change the status of a regular member — only an
    // admin may (de)activate another admin or moderator.
    if (session.user.role === 'moderator' && user.role !== 'member') {
      return NextResponse.json(
        { success: false, message: 'Only an admin can change the status of an admin or moderator' },
        { status: 403 }
      );
    }

    const previousIsActive = user.isActive;
    user.isActive = parsed.data.isActive;
    await user.save();

    await AuditLog.create({
      actorId: session.user.id,
      actorName: session.user.name || 'Unknown',
      action: user.isActive ? 'MEMBER_ACTIVATED' : 'MEMBER_DEACTIVATED',
      targetCollection: 'Users',
      targetId: String(user._id),
      previousValue: { isActive: previousIsActive },
      newValue: { isActive: user.isActive },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar || null,
        phoneNumber: user.phoneNumber || null,
        isActive: user.isActive,
        joinedAt: user.joinedAt,
      },
      message: `Member ${user.isActive ? 'activated' : 'deactivated'} successfully`,
    });
  } catch (error: any) {
    console.error('Update user status error:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to update member status' }, { status: 500 });
  }
}
