import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { buildExportFileName, createPdfBuffer, getMemberExportData, getMonthlyExportData, getYearlyExportData } from '@/lib/export-utils';

const querySchema = z.object({
  scope: z.enum(['member', 'monthly', 'yearly']),
  year: z.coerce.number().int().min(2024).max(2100).optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
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
      userId: url.searchParams.get('userId') || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json({ success: false, message: 'Invalid export parameters' }, { status: 400 });
    }

    const { scope, year, month, userId } = parsed.data;
    const isAdmin = ['admin', 'moderator'].includes(session.user.role);

    let fileName = 'report.pdf';
    let data;

    if (scope === 'member') {
      const targetUserId = userId || session.user.id;
      if (!isAdmin && targetUserId !== session.user.id) {
        return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
      }

      data = await getMemberExportData(targetUserId, year || new Date().getFullYear());
      fileName = buildExportFileName('member', 'pdf', {
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
      fileName = buildExportFileName('monthly', 'pdf', { month });
    } else {
      if (!isAdmin) {
        return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
      }
      data = await getYearlyExportData(year || new Date().getFullYear());
      fileName = buildExportFileName('yearly', 'pdf', { year: data.year });
    }

    const buffer = await createPdfBuffer(data);

    return new NextResponse(Buffer.from(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (error: any) {
    console.error('PDF export error:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to export PDF report' }, { status: 500 });
  }
}
