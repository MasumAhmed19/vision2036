import type { ILedgerEntryDocument } from '@/models/LedgerEntry';
import { fromPaisa } from '@/lib/money';

export function mapEntry(entry: ILedgerEntryDocument) {
    return {
        id: String(entry._id),
        direction: entry.direction,
        type: entry.type,
        status: entry.status,
        amount: fromPaisa(entry.amount),
        memberId: entry.memberId ? String(entry.memberId) : null,
        period: entry.period,
        valueDate: entry.valueDate,
        title: entry.title,
        note: entry.note,
        channel: entry.channel,
        attachments: entry.attachments,
        reversalOf: entry.reversalOf ? String(entry.reversalOf) : null,
        reversedBy: entry.reversedBy ? String(entry.reversedBy) : null,
        createdBy: String(entry.createdBy),
        requiredApprovals: entry.requiredApprovals,
        approvals: entry.approvals.map((a) => ({ by: String(a.by), at: a.at, note: a.note })),
        postedAt: entry.postedAt,
        rejectedBy: entry.rejectedBy ? String(entry.rejectedBy) : null,
        rejectedAt: entry.rejectedAt,
        rejectionReason: entry.rejectionReason,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
    };
}
