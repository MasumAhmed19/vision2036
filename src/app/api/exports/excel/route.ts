import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { buildExportFileName, createExcelBuffer, getMemberExportData, getMonthlyExportData, getRangeExportData, getYearlyExportData } from '@/lib/export-utils';

const querySchema = z.object({
  scope: z.enum(['member', 'monthly', 'yearly', 'range']),
  year: z.coerce.number().int().min(2024).max(2100).optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  startMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  endMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  userId: z.string().trim().optional(),
});

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      scope: url.searchParams.get('scope'),
      year: url.searchParams.get('year') || undefined,
      month: url.searchParams.get('month') || undefined,
      startMonth: url.searchParams.get('startMonth') || undefined,
      endMonth: url.searchParams.get('endMonth') || undefined,
      userId: url.searchParams.get('userId') || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json({ success: false, message: 'Invalid export parameters' }, { status: 400 });
    }

    const { scope, year, month, startMonth, endMonth, userId } = parsed.data;
    const isAdmin = ['admin', 'moderator', 'co_admin'].includes(session.user.role);

    let fileName = 'report.xlsx';
    let data;

    if (scope === 'member') {
      const targetUserId = userId || session.user.id;
      if (!isAdmin && targetUserId !== session.user.id) {
        return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
      }

      data = await getMemberExportData(targetUserId, year || new Date().getFullYear());
      fileName = buildExportFileName('member', 'xlsx', {
        year: data.year,
        memberName: data.user.name,
      });
    } else if (scope === 'monthly') {
      if (!isAdmin) {
        return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
      }
      if (!month) {
        return NextResponse.json({ success: false, message: 'Month is required for monthly export' }, { status: 400 });
      }
      data = await getMonthlyExportData(month);
      fileName = buildExportFileName('monthly', 'xlsx', { month });
    } else if (scope === 'yearly') {
      if (!isAdmin) {
        return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
      }
      data = await getYearlyExportData(year || new Date().getFullYear());
      fileName = buildExportFileName('yearly', 'xlsx', { year: data.year });
    } else {
      if (!isAdmin) {
        return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
      }
      if (!startMonth || !endMonth) {
        return NextResponse.json({ success: false, message: 'Start and end month are required for a range statement' }, { status: 400 });
      }
      if (startMonth > endMonth) {
        return NextResponse.json({ success: false, message: 'Start month must be before end month' }, { status: 400 });
      }
      data = await getRangeExportData(startMonth, endMonth);
      fileName = buildExportFileName('range', 'xlsx', { startPeriod: startMonth, endPeriod: endMonth });
    }

    const buffer = createExcelBuffer(data);

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (error: any) {
    console.error('Excel export error:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to export Excel report' }, { status: 500 });
  }
}
