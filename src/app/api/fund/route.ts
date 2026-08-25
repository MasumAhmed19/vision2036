import { NextResponse } from 'next/server';
import { getFundPosition } from '@/lib/ledger';
import { fromPaisa } from '@/lib/money';
import { withAuth } from '@/lib/with-auth';

// Open to any authenticated member — the fund's position is not sensitive
// within the group (newDesign.md §6.1: "everyone can see everything").
export const GET = withAuth({}, async ({ request }) => {
    const { searchParams } = new URL(request.url);
    const throughPeriod = searchParams.get('throughPeriod') || undefined;

    if (throughPeriod && !/^\d{4}-\d{2}$/.test(throughPeriod)) {
        return NextResponse.json({ success: false, message: 'Invalid throughPeriod' }, { status: 400 });
    }

    const position = await getFundPosition({ throughPeriod });

    return NextResponse.json({
        success: true,
        data: {
            cash: fromPaisa(position.cash),
            investedAtCost: fromPaisa(position.investedAtCost),
            fundValue: fromPaisa(position.fundValue),
        },
        message: 'Fund position fetched successfully',
    });
});
