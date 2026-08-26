import type { IPeriodSnapshot } from '@/models/Period';
import { fromPaisa } from '@/lib/money';

const MONEY_KEYS = [
    'contributionsMonthly',
    'contributionsFlex',
    'interest',
    'investmentReturns',
    'bankCharges',
    'operationalCosts',
    'investedOut',
    'investmentPrincipalBack',
    'cash',
    'investedAtCost',
    'fundValue',
] as const;

export function mapSnapshot(snapshot: IPeriodSnapshot) {
    const mapped: Record<string, number> = {};
    for (const key of MONEY_KEYS) {
        mapped[key] = fromPaisa(snapshot[key]);
    }
    return {
        ...mapped,
        membersPaid: snapshot.membersPaid,
        membersPending: snapshot.membersPending,
        membersUnpaid: snapshot.membersUnpaid,
    };
}
