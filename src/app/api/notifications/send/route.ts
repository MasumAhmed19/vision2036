import { NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongoose';
import User from '@/models/User';
import AuditLog from '@/models/AuditLog';
import { withAuth } from '@/lib/with-auth';
import { getMemberContributionsInRange } from '@/lib/ledger';
import { getContributionPolicy, formatMonthLabel } from '@/lib/policies';
import { fromPaisa } from '@/lib/money';
import { sendMissedPaymentEmail, sendCustomEmail } from '@/lib/email';

const sendNotificationSchema = z
    .object({
        template: z.enum(['missed_payment', 'custom']),
        recipientIds: z.array(z.string()).min(1, 'Select at least one recipient').max(50),
        period: z.string().regex(/^\d{4}-\d{2}$/, 'Invalid period').optional(),
        subject: z.string().trim().min(1).max(200).optional(),
        message: z.string().trim().min(1).max(5000).optional(),
    })
    .superRefine((data, ctx) => {
        if (data.template === 'missed_payment' && !data.period) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['period'], message: 'A month is required for this template' });
        }
        if (data.template === 'custom' && !data.subject) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['subject'], message: 'A subject is required' });
        }
        if (data.template === 'custom' && !data.message) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['message'], message: 'A message is required' });
        }
    });

// Admin/Co-Admin picks recipients (any member, including themselves) and a
// predefined template, and this sends a real email to each — see
// src/lib/email.ts for the actual templates. Every send is logged to the
// audit trail as one summary entry, not one row per recipient.
export const POST = withAuth({ capability: 'notification.send' }, async ({ member, request }) => {
    const body = await request.json().catch(() => null);
    const parsed = sendNotificationSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { success: false, message: parsed.error.issues[0]?.message || 'Invalid request' },
            { status: 400 }
        );
    }

    const data = parsed.data;
    await connectDB();

    const recipients = await User.find({ _id: { $in: data.recipientIds } }).select('name email isActive');
    const foundIds = new Set(recipients.map((r) => String(r._id)));
    const missingIds = data.recipientIds.filter((id) => !foundIds.has(id));

    const sent: { id: string; name: string }[] = [];
    const failed: { id: string; name?: string; reason: string }[] = [];

    for (const id of missingIds) {
        failed.push({ id, reason: 'User not found' });
    }

    let monthLabel: string | undefined;
    let policy: ReturnType<typeof getContributionPolicy> | undefined;

    if (data.template === 'missed_payment' && data.period) {
        monthLabel = formatMonthLabel(data.period);
        policy = getContributionPolicy(Number(data.period.split('-')[0]));
    }

    for (const recipient of recipients) {
        try {
            if (data.template === 'missed_payment' && data.period && monthLabel && policy) {
                const [contribution] = await getMemberContributionsInRange(data.period, data.period, String(recipient._id));
                const paidTaka = fromPaisa(contribution?.monthlyPaid ?? 0);
                await sendMissedPaymentEmail(recipient.email, recipient.name, monthLabel, policy.monthlyAmount, paidTaka, policy.deadlineDay);
            } else if (data.template === 'custom' && data.subject && data.message) {
                await sendCustomEmail(recipient.email, recipient.name, data.subject, data.message);
            }
            sent.push({ id: String(recipient._id), name: recipient.name });
        } catch (error) {
            failed.push({ id: String(recipient._id), name: recipient.name, reason: error instanceof Error ? error.message : 'Send failed' });
        }
    }

    // Audit logging must never be able to fail the actual send — the emails
    // are already out by this point, so a logging hiccup here shouldn't turn
    // a successful send into a 500.
    try {
        await AuditLog.create({
            actorId: member.id,
            actorName: member.name,
            action: 'NOTIFICATION_SENT',
            targetCollection: 'User',
            newValue: {
                template: data.template,
                period: data.period,
                subject: data.subject,
                sentTo: sent.map((s) => s.name),
                failedCount: failed.length,
            },
        });
    } catch (error) {
        console.error('Failed to write NOTIFICATION_SENT audit log:', error);
    }

    return NextResponse.json({
        success: failed.length === 0,
        data: { sent, failed },
        message: failed.length === 0
            ? `Sent to ${sent.length} recipient${sent.length === 1 ? '' : 's'}`
            : `Sent to ${sent.length}, failed for ${failed.length}`,
    });
});
