import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongoose';
import { buildUserYearlySummary } from '@/lib/summary-engine';

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const yearParam = searchParams.get('year');
        const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();

        await connectDB();
        const summary = await buildUserYearlySummary(session.user.id, year);

        return NextResponse.json({
            success: true,
            data: summary,
        });
    } catch (error: any) {
        console.error('Fetch summaries error:', error);
        return NextResponse.json(
            { success: false, message: error.message || 'Failed to fetch summaries' },
            { status: 500 }
        );
    }
}
