import { NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongoose';
import LedgerEntry, { CREDIT_TYPES } from '@/models/LedgerEntry';
import Policy from '@/models/Policy';
import AuditLog from '@/models/AuditLog';
import { withAuth } from '@/lib/with-auth';
import { can, type Capability } from '@/lib/permissions';
import { toPaisa } from '@/lib/money';
import { mapEntry } from '@/lib/entry-mapper';

// Entry types postable through this route — CONTRIBUTION_MONTHLY/FLEX are
// deliberately excluded: those still flow through the existing
// /api/transfers submit+verify flow for this phase (see the Phase 1 plan
// notes on why dual-write wasn't added there yet).
const POSTABLE_TYPES = [
    'BANK_CHARGE',
    'OPERATIONAL_COST',
    'INTEREST_BANK',
    'INVESTMENT_RETURN',
    'INVESTMENT_PRINCIPAL_BACK',
    'INVESTMENT_OUT',
    'WITHDRAWAL',
    'ADJUSTMENT',
] as const;

const TYPE_CAPABILITY: Record<(typeof POSTABLE_TYPES)[number], Capability> = {
    BANK_CHARGE: 'entry.post.expense',
    OPERATIONAL_COST: 'entry.post.expense',
    WITHDRAWAL: 'entry.post.expense',
    ADJUSTMENT: 'entry.post.expense',
    INTEREST_BANK: 'entry.post.income',
    INVESTMENT_RETURN: 'entry.post.income',
    INVESTMENT_PRINCIPAL_BACK: 'entry.post.income',
    INVESTMENT_OUT: 'entry.post.investment',
};

const DEFAULT_DUAL_APPROVAL_ABOVE_PAISA = toPaisa(1000); // Tk 1,000 — newDesign.md §19 Q3 recommendation, used until a Policy row is seeded

const postEntrySchema = z
    .object({
        type: z.enum(POSTABLE_TYPES),
        amount: z.coerce.number().positive(), // Taka — converted to paisa server-side
        period: z.string().regex(/^\d{4}-\d{2}$/, 'Invalid period'),
        valueDate: z.coerce.date(),
        title: z.string().trim().min(1).max(200),
        note: z.string().trim().max(1000).optional(),
        channel: z.enum(['BANK', 'BKASH', 'NAGAD', 'ROCKET', 'CASH', 'INTERNAL', 'OTHER']).optional(),
        direction: z.enum(['CREDIT', 'DEBIT']).optional(), // required only for ADJUSTMENT
        memberId: z.string().optional(), // for WITHDRAWAL
        attachments: z
            .array(
                z.object({
                    url: z.string().url(),
                    publicId: z.string().optional(),
                    kind: z.enum(['SCREENSHOT', 'RECEIPT', 'STATEMENT']),
                })
            )
            .optional(),
    })
    .superRefine((data, ctx) => {
        if (data.type === 'ADJUSTMENT' && !data.direction) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['direction'],
                message: 'direction (CREDIT or DEBIT) is required for an adjustment',
            });
        }
    });

export const POST = withAuth({}, async ({ member, request }) => {
    const body = await request.json().catch(() => null);
    const parsed = postEntrySchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { success: false, message: parsed.error.issues[0]?.message || 'Invalid entry payload' },
            { status: 400 }
        );
    }

    const data = parsed.data;
    const capability = TYPE_CAPABILITY[data.type];
    if (!can(member.role, capability)) {
        return NextResponse.json({ success: false, message: 'You cannot post this entry type' }, { status: 403 });
    }

    await connectDB();

    const direction = data.type === 'ADJUSTMENT'
        ? data.direction!
        : (CREDIT_TYPES as string[]).includes(data.type)
            ? 'CREDIT'
            : 'DEBIT';

    const policy = await Policy.getCurrent();
    const dualApprovalAbove = policy?.dualApprovalAbove ?? DEFAULT_DUAL_APPROVAL_ABOVE_PAISA;
    const amountPaisa = toPaisa(data.amount);

    // Investment out is the largest movement the fund makes — always dual
    // approval, any amount (newDesign.md §7.1), regardless of the general threshold.
    const requiredApprovals = data.type === 'INVESTMENT_OUT' || amountPaisa >= dualApprovalAbove ? 2 : 1;

    const entry = await LedgerEntry.create({
        direction,
        type: data.type,
        status: 'PENDING',
        amount: amountPaisa,
        currency: 'BDT',
        memberId: data.memberId,
        period: data.period,
        valueDate: data.valueDate,
        title: data.title,
        note: data.note,
        channel: data.channel,
        attachments: (data.attachments || []).map((a) => ({
            ...a,
            uploadedAt: new Date(),
            uploadedBy: member.id,
        })),
        createdBy: member.id,
        requiredApprovals,
    });

    await AuditLog.create({
        actorId: member.id,
        actorName: member.name,
        action: 'LEDGER_ENTRY_CREATED',
        targetCollection: 'LedgerEntry',
        targetId: String(entry._id),
        newValue: { type: entry.type, amount: entry.amount, period: entry.period },
    });

    return NextResponse.json(
        { success: true, data: mapEntry(entry), message: `Submitted — needs ${requiredApprovals} approval${requiredApprovals > 1 ? 's' : ''}` },
        { status: 201 }
    );
});

const listQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(['DRAFT', 'PENDING', 'POSTED', 'REJECTED', 'REVERSED']).optional(),
    type: z.string().optional(),
    period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    memberId: z.string().optional(),
});

// Read access is open to any authenticated member — "everyone can see
// everything, only actions are restricted" (newDesign.md §6.1). No
// capability check here, only that a session exists (withAuth already
// enforces that).
export const GET = withAuth({}, async ({ request }) => {
    const { searchParams } = new URL(request.url);
    const parsed = listQuerySchema.safeParse({
        page: searchParams.get('page') || undefined,
        limit: searchParams.get('limit') || undefined,
        status: searchParams.get('status') || undefined,
        type: searchParams.get('type') || undefined,
        period: searchParams.get('period') || undefined,
        memberId: searchParams.get('memberId') || undefined,
    });

    if (!parsed.success) {
        return NextResponse.json({ success: false, message: 'Invalid query parameters' }, { status: 400 });
    }

    const { page, limit, status, type, period, memberId } = parsed.data;

    await connectDB();

    const query: Record<string, unknown> = {};
    if (status) query.status = status;
    if (type) query.type = type;
    if (period) query.period = period;
    if (memberId) query.memberId = memberId;

    const [entries, total] = await Promise.all([
        LedgerEntry.find(query)
            // period first so the Ledger screen can group rows by month
            // without re-sorting client-side; valueDate breaks ties within
            // a month.
            .sort({ period: -1, valueDate: -1, createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit),
        LedgerEntry.countDocuments(query),
    ]);

    return NextResponse.json({
        success: true,
        data: entries.map(mapEntry),
        meta: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
        message: 'Entries fetched successfully',
    });
});
