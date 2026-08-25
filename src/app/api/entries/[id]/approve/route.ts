import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongoose';
import LedgerEntry from '@/models/LedgerEntry';
import Policy from '@/models/Policy';
import User from '@/models/User';
import AuditLog from '@/models/AuditLog';
import { withAuth } from '@/lib/with-auth';
import { mapEntry } from '@/lib/entry-mapper';

export const POST = withAuth<{ params: Promise<{ id: string }> }>(
    { capability: 'entry.approve' },
    async ({ member, context }) => {
        const { id } = await context.params;
        await connectDB();

        const entry = await LedgerEntry.findById(id);
        if (!entry) {
            return NextResponse.json({ success: false, message: 'Entry not found' }, { status: 404 });
        }

        if (entry.status !== 'PENDING') {
            return NextResponse.json(
                { success: false, message: `Entry is already ${entry.status.toLowerCase()}` },
                { status: 400 }
            );
        }

        // No self-approval, regardless of role — enforced in code, not etiquette.
        if (String(entry.createdBy) === member.id) {
            return NextResponse.json(
                { success: false, message: 'You cannot approve your own entry' },
                { status: 403 }
            );
        }

        if (entry.approvals.some((approval) => String(approval.by) === member.id)) {
            return NextResponse.json({ success: false, message: 'You already approved this entry' }, { status: 400 });
        }

        entry.approvals.push({ by: member.id, at: new Date() });

        let message = `Approval recorded (${entry.approvals.length} of ${entry.requiredApprovals})`;

        if (entry.approvals.length >= entry.requiredApprovals) {
            // Investment out needs at least one ADMIN among its approvers
            // (newDesign.md §7.1) — the largest movement the fund makes.
            let readyToPost = true;
            if (entry.type === 'INVESTMENT_OUT') {
                const policy = await Policy.getCurrent();
                if (policy?.investmentRequiresAdmin !== false) {
                    const approverIds = entry.approvals.map((a) => String(a.by));
                    const approvers = await User.find({ _id: { $in: approverIds } }).select('role');
                    readyToPost = approvers.some((u) => u.role === 'admin');
                    if (!readyToPost) {
                        message = `Approval recorded (${entry.approvals.length} of ${entry.requiredApprovals}) — still needs an admin approver for this investment`;
                    }
                }
            }

            if (readyToPost) {
                entry.status = 'POSTED';
                entry.postedAt = new Date();
                message = 'Entry approved and posted';
            }
        }

        await entry.save();

        await AuditLog.create({
            actorId: member.id,
            actorName: member.name,
            action: 'LEDGER_ENTRY_APPROVED',
            targetCollection: 'LedgerEntry',
            targetId: String(entry._id),
            newValue: { status: entry.status },
        });

        return NextResponse.json({ success: true, data: mapEntry(entry), message });
    }
);
