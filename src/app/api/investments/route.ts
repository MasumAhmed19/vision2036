import { NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongoose';
import Investment from '@/models/Investment';
import AuditLog from '@/models/AuditLog';
import { withAuth } from '@/lib/with-auth';
import { mapInvestment } from '@/lib/investment-mapper';

const KINDS = ['FDR', 'DPS', 'SHARE', 'BOND', 'PROPERTY', 'BUSINESS', 'OTHER'] as const;

const proposeSchema = z.object({
    name: z.string().trim().min(1).max(200),
    kind: z.enum(KINDS),
    expectedRatePct: z.coerce.number().min(0).optional(),
    startDate: z.coerce.date().optional(),
    maturityDate: z.coerce.date().optional(),
    notes: z.string().trim().max(2000).optional(),
});

// Open to any authenticated member — the fund's investments are not
// sensitive within the group (newDesign.md §6.1).
export const GET = withAuth({}, async () => {
    await connectDB();
    const investments = await Investment.find({}).sort({ createdAt: -1 });
    return NextResponse.json({
        success: true,
        data: investments.map(mapInvestment),
        message: 'Investments fetched successfully',
    });
});

// Any member may propose (newDesign.md §6.3) — only co_admin/admin can
// actually fund it, by posting an INVESTMENT_OUT entry linked to this record.
export const POST = withAuth({ capability: 'investment.propose' }, async ({ member, request }) => {
    const body = await request.json().catch(() => null);
    const parsed = proposeSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { success: false, message: parsed.error.issues[0]?.message || 'Invalid investment payload' },
            { status: 400 }
        );
    }

    await connectDB();

    const investment = await Investment.create({
        ...parsed.data,
        status: 'PROPOSED',
        principal: 0,
        realisedReturn: 0,
        proposedBy: member.id,
    });

    await AuditLog.create({
        actorId: member.id,
        actorName: member.name,
        action: 'INVESTMENT_PROPOSED',
        targetCollection: 'Investment',
        targetId: String(investment._id),
        newValue: { name: investment.name, kind: investment.kind },
    });

    return NextResponse.json(
        { success: true, data: mapInvestment(investment), message: 'Investment proposed' },
        { status: 201 }
    );
});
