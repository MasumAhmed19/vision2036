import { NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongoose';
import Investment from '@/models/Investment';
import AuditLog from '@/models/AuditLog';
import { withAuth } from '@/lib/with-auth';
import { mapInvestment } from '@/lib/investment-mapper';
import { toPaisa } from '@/lib/money';

const valueSchema = z.object({
    currentValue: z.coerce.number().min(0), // Taka — a manual mark-to-market, conservative until set
});

// Mark-to-market valuation — a manual, occasional mark by co_admin/admin
// (newDesign.md §4.4). Does not change principal/realisedReturn, which stay
// derived from posted ledger entries (see the entries/[id]/approve route).
export const POST = withAuth<{ params: Promise<{ id: string }> }>(
    { capability: 'investment.value' },
    async ({ member, request, context }) => {
        const { id } = await context.params;
        const body = await request.json().catch(() => null);
        const parsed = valueSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { success: false, message: parsed.error.issues[0]?.message || 'Invalid valuation payload' },
                { status: 400 }
            );
        }

        await connectDB();

        const investment = await Investment.findById(id);
        if (!investment) {
            return NextResponse.json({ success: false, message: 'Investment not found' }, { status: 404 });
        }

        investment.currentValue = toPaisa(parsed.data.currentValue);
        investment.valuedAt = new Date();
        investment.valuedBy = member.id;
        await investment.save();

        await AuditLog.create({
            actorId: member.id,
            actorName: member.name,
            action: 'INVESTMENT_VALUED',
            targetCollection: 'Investment',
            targetId: String(investment._id),
            newValue: { currentValue: investment.currentValue },
        });

        return NextResponse.json({ success: true, data: mapInvestment(investment), message: 'Investment valued' });
    }
);
