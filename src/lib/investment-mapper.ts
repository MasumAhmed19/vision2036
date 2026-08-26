import type { IInvestmentDocument } from '@/models/Investment';
import { fromPaisa } from '@/lib/money';

export function mapInvestment(inv: IInvestmentDocument) {
    return {
        id: String(inv._id),
        name: inv.name,
        kind: inv.kind,
        status: inv.status,
        principal: fromPaisa(inv.principal),
        realisedReturn: fromPaisa(inv.realisedReturn),
        expectedRatePct: inv.expectedRatePct,
        startDate: inv.startDate,
        maturityDate: inv.maturityDate,
        currentValue: inv.currentValue != null ? fromPaisa(inv.currentValue) : null,
        valuedAt: inv.valuedAt,
        proposedBy: String(inv.proposedBy),
        notes: inv.notes,
        createdAt: inv.createdAt,
        updatedAt: inv.updatedAt,
    };
}
