import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongoose';
import User from '@/models/User';

/**
 * The public member directory — every authenticated member can see every
 * other member (newDesign.md §6.1: "everyone can see everything"). This is
 * deliberately a separate, minimal endpoint from GET /api/users (which
 * stays admin/moderator/co_admin-only, since it also returns email and
 * phoneNumber — contact details other members shouldn't see about each
 * other just because the group's finances are transparent).
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();

        const members = await User.find({ isActive: true }).sort({ joinedAt: 1, createdAt: 1 });

        return NextResponse.json({
            success: true,
            data: members.map((member) => ({
                id: String(member._id),
                name: member.name,
                avatar: member.avatar || null,
                role: member.role,
                joinedAt: member.joinedAt,
            })),
            message: 'Members fetched successfully',
        });
    } catch (error: any) {
        console.error('List members error:', error);
        return NextResponse.json({ success: false, message: error.message || 'Failed to list members' }, { status: 500 });
    }
}
