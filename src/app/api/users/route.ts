import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongoose';
import User from '@/models/User';

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(12),
  role: z.enum(['member', 'moderator', 'admin']).optional(),
  isActive: z.coerce.boolean().optional(),
  search: z.string().trim().optional(),
});

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id || !['admin', 'moderator'].includes(session.user.role)) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      page: url.searchParams.get('page') || '1',
      limit: url.searchParams.get('limit') || '12',
      role: url.searchParams.get('role') || undefined,
      isActive: url.searchParams.get('isActive') ?? undefined,
      search: url.searchParams.get('search') || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json({ success: false, message: 'Invalid query parameters' }, { status: 400 });
    }

    const { page, limit, role, isActive, search } = parsed.data;
    const query: Record<string, unknown> = {};

    if (role) query.role = role;
    if (typeof isActive === 'boolean') query.isActive = isActive;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    await connectDB();

    const [users, totalItems] = await Promise.all([
      User.find(query)
        .sort({ joinedAt: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      User.countDocuments(query),
    ]);

    return NextResponse.json({
      users: users.map((user) => ({
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar || null,
        phoneNumber: user.phoneNumber || null,
        isActive: user.isActive,
        joinedAt: user.joinedAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })),
      pagination: {
        currentPage: page,
        totalPages: Math.max(Math.ceil(totalItems / limit), 1),
        totalItems,
        itemsPerPage: limit,
      },
    });
  } catch (error: any) {
    console.error('List users error:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to list users' }, { status: 500 });
  }
}
