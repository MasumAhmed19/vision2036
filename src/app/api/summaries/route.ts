import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongoose';
import { buildGlobalSummary } from '@/lib/summary-engine';

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id || !['admin', 'moderator'].includes(session.user.role)) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const year = Number(searchParams.get('year') || new Date().getFullYear());

    await connectDB();
    const summary = await buildGlobalSummary(year);

    return NextResponse.json({
      success: true,
      data: summary.userSummaries.map((item) => ({
        userId: item.userId,
        userName: item.userName,
        userEmail: item.userEmail || '',
        expected: item.totalPaid + item.totalRemaining,
        paid: item.totalPaid,
        remaining: item.totalRemaining,
        completionPercentage: item.completionPercentage,
      })),
      message: 'User summaries fetched successfully',
    });
  } catch (error: any) {
    console.error('Fetch summaries error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch summaries' },
      { status: 500 }
    );
  }
}
