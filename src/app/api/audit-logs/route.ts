import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongoose';
import AuditLog from '@/models/AuditLog';

const TRANSFER_COST_ACTIONS = ['TRANSFER_CREATED', 'TRANSFER_VERIFIED', 'TRANSFER_REJECTED', 'COST_ADDED', 'COST_UPDATED', 'COST_DELETED', 'SHEET_SYNCED'] as const;

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  actor: z.string().trim().optional(),
  action: z.string().trim().optional(),
  dateFrom: z.string().trim().optional(),
  dateTo: z.string().trim().optional(),
  targetCollection: z.string().trim().optional(),
});

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.role !== 'admin') {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      page: url.searchParams.get('page') || '1',
      limit: url.searchParams.get('limit') || '20',
      actor: url.searchParams.get('actor') || undefined,
      action: url.searchParams.get('action') || undefined,
      dateFrom: url.searchParams.get('dateFrom') || undefined,
      dateTo: url.searchParams.get('dateTo') || undefined,
      targetCollection: url.searchParams.get('targetCollection') || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json({ success: false, message: 'Invalid query parameters' }, { status: 400 });
    }

    const { page, limit, actor, action, dateFrom, dateTo, targetCollection } = parsed.data;
    const query: Record<string, unknown> = {
      action: { $in: TRANSFER_COST_ACTIONS },
    };

    if (actor) {
      query.actorName = { $regex: actor, $options: 'i' };
    }
    if (action && action !== 'all') {
      query.action = action;
    }
    if (targetCollection && targetCollection !== 'all') {
      query.targetCollection = targetCollection;
    }
    if (dateFrom || dateTo) {
      query.timestamp = {};
      if (dateFrom) {
        (query.timestamp as Record<string, unknown>).$gte = new Date(`${dateFrom}T00:00:00.000Z`);
      }
      if (dateTo) {
        (query.timestamp as Record<string, unknown>).$lte = new Date(`${dateTo}T23:59:59.999Z`);
      }
    }

    await connectDB();

    const [logs, totalItems] = await Promise.all([
      AuditLog.find(query).sort({ timestamp: -1 }).skip((page - 1) * limit).limit(limit),
      AuditLog.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        items: logs.map((log) => ({
          id: String(log._id),
          actorId: String(log.actorId),
          actorName: log.actorName,
          action: log.action,
          targetCollection: log.targetCollection || '',
          targetId: log.targetId || '',
          previousValue: log.previousValue || null,
          newValue: log.newValue || null,
          ipAddress: log.ipAddress || '',
          timestamp: log.timestamp,
        })),
        pagination: {
          currentPage: page,
          totalPages: Math.max(Math.ceil(totalItems / limit), 1),
          totalItems,
          itemsPerPage: limit,
        },
      },
      message: 'Audit logs fetched successfully',
    });
  } catch (error: any) {
    console.error('Audit logs fetch error:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to fetch audit logs' }, { status: 500 });
  }
}

const deleteSchema = z.object({
  ids: z.array(z.string()).optional(),
  actor: z.string().trim().optional(),
  action: z.string().trim().optional(),
  dateFrom: z.string().trim().optional(),
  dateTo: z.string().trim().optional(),
  targetCollection: z.string().trim().optional(),
  deleteAll: z.boolean().optional(),
});

export async function DELETE(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.role !== 'admin') {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = deleteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, message: 'Invalid delete payload' }, { status: 400 });
    }

    const { ids, actor, action, dateFrom, dateTo, targetCollection, deleteAll } = parsed.data;
    const query: Record<string, unknown> = {
      action: { $in: TRANSFER_COST_ACTIONS },
    };

    if (ids?.length) {
      query._id = { $in: ids };
    } else {
      if (actor) {
        query.actorName = { $regex: actor, $options: 'i' };
      }
      if (action && action !== 'all') {
        query.action = action;
      }
      if (targetCollection && targetCollection !== 'all') {
        query.targetCollection = targetCollection;
      }
      if (dateFrom || dateTo) {
        query.timestamp = {};
        if (dateFrom) {
          (query.timestamp as Record<string, unknown>).$gte = new Date(`${dateFrom}T00:00:00.000Z`);
        }
        if (dateTo) {
          (query.timestamp as Record<string, unknown>).$lte = new Date(`${dateTo}T23:59:59.999Z`);
        }
      }
      if (!deleteAll && !actor && !action && !targetCollection && !dateFrom && !dateTo) {
        return NextResponse.json({ success: false, message: 'Provide filters, ids, or set deleteAll=true for bulk deletion.' }, { status: 400 });
      }
    }

    await connectDB();
    const result = await AuditLog.deleteMany(query);

    return NextResponse.json({
      success: true,
      data: { deletedCount: result.deletedCount || 0 },
      message: 'Audit logs deleted successfully',
    });
  } catch (error: any) {
    console.error('Audit logs delete error:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to delete audit logs' }, { status: 500 });
  }
}
