import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongoose';
import User from '@/models/User';
import AuditLog from '@/models/AuditLog';

const payloadSchema = z.object({
  role: z.enum(['member', 'moderator', 'admin']),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.role !== 'admin') {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = payloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, message: 'Invalid payload' }, { status: 400 });
    }

    const { id } = await params;

    if (id === session.user.id) {
      return NextResponse.json({ success: false, message: 'You cannot change your own role' }, { status: 400 });
    }

    await connectDB();

    const user = await User.findById(id);
    if (!user) {
      return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
    }

    const previousRole = user.role;

    if (previousRole === 'admin' && parsed.data.role !== 'admin') {
      const activeAdminCount = await User.countDocuments({ role: 'admin', isActive: true });
      if (activeAdminCount <= 1) {
        return NextResponse.json(
          { success: false, message: 'Cannot demote the last remaining admin' },
          { status: 400 }
        );
      }
    }

    user.role = parsed.data.role;
    await user.save();

    await AuditLog.create({
      actorId: session.user.id,
      actorName: session.user.name || 'Unknown',
      action: 'ROLE_CHANGED',
      targetCollection: 'Users',
      targetId: String(user._id),
      previousValue: { role: previousRole },
      newValue: { role: user.role },
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
      message: 'Role updated successfully',
    });
  } catch (error: any) {
    console.error('Update user role error:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to update member role' }, { status: 500 });
  }
}
