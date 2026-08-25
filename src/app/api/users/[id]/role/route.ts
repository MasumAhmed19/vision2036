import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongoose';
import User, { IUserDocument } from '@/models/User';
import AuditLog from '@/models/AuditLog';
import { withMutex } from '@/lib/mutex';

const payloadSchema = z.object({
  role: z.enum(['member', 'moderator', 'co_admin', 'admin']),
});

class NotFoundError extends Error { }
class LastAdminError extends Error { }

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

    let result: { user: IUserDocument; previousRole: string };

    try {
      // The count-check-then-save below is only safe against concurrent
      // demotions of *different* admins because withMutex forces them to
      // serialize on a shared lock document — a plain countDocuments()
      // before save() would let two concurrent requests each read a stale
      // "2 active admins" count and both proceed, leaving zero.
      result = await withMutex('role-change-admin-guard', async (dbSession) => {
        const found = await User.findById(id).session(dbSession);
        if (!found) {
          throw new NotFoundError();
        }

        const prevRole = found.role;

        if (prevRole === 'admin' && parsed.data.role !== 'admin') {
          const activeAdminCount = await User.countDocuments({ role: 'admin', isActive: true }).session(dbSession);
          if (activeAdminCount <= 1) {
            throw new LastAdminError();
          }
        }

        found.role = parsed.data.role;
        await found.save({ session: dbSession });

        return { user: found, previousRole: prevRole };
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
      }
      if (error instanceof LastAdminError) {
        return NextResponse.json(
          { success: false, message: 'Cannot demote the last remaining admin' },
          { status: 400 }
        );
      }
      throw error;
    }

    const { user, previousRole } = result;

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
