import connectDB from '@/lib/mongoose';
import LedgerEntry, { CREDIT_TYPES } from '@/models/LedgerEntry';

export interface FundPosition {
    cash: number; // paisa
    investedAtCost: number; // paisa
    fundValue: number; // paisa — cash + investedAtCost (+ unrealisedGain, once an
    // Investment register with valuations exists — deferred, so 0 for now)
}

/**
 * The one function allowed to answer "how much money does the fund have."
 * Every screen, export, and notification must call this (or the other
 * helpers below) rather than summing LedgerEntry itself — see
 * newDesign.md §3.3.
 *
 *   cash          = Σ CREDIT.amount − Σ DEBIT.amount        (over POSTED entries)
 *   investedAtCost= Σ INVESTMENT_OUT − Σ INVESTMENT_PRINCIPAL_BACK
 *   fundValue     = cash + investedAtCost + unrealisedGain
 *
 * Pass `throughPeriod` ('YYYY-MM') to get the position as of the end of
 * that accounting month (inclusive) instead of the live, all-time position.
 */
export async function getFundPosition(options: { throughPeriod?: string } = {}): Promise<FundPosition> {
    await connectDB();

    const match: Record<string, unknown> = { status: 'POSTED' };
    if (options.throughPeriod) {
        match.period = { $lte: options.throughPeriod };
    }

    const [row] = await LedgerEntry.aggregate([
        { $match: match },
        {
            $group: {
                _id: null,
                creditTotal: { $sum: { $cond: [{ $eq: ['$direction', 'CREDIT'] }, '$amount', 0] } },
                debitTotal: { $sum: { $cond: [{ $eq: ['$direction', 'DEBIT'] }, '$amount', 0] } },
                investedOut: { $sum: { $cond: [{ $eq: ['$type', 'INVESTMENT_OUT'] }, '$amount', 0] } },
                investedBack: { $sum: { $cond: [{ $eq: ['$type', 'INVESTMENT_PRINCIPAL_BACK'] }, '$amount', 0] } },
            },
        },
    ]);

    const creditTotal = row?.creditTotal ?? 0;
    const debitTotal = row?.debitTotal ?? 0;
    const investedAtCost = (row?.investedOut ?? 0) - (row?.investedBack ?? 0);
    const cash = creditTotal - debitTotal;

    return {
        cash,
        investedAtCost,
        fundValue: cash + investedAtCost,
    };
}

export interface PeriodAggregate {
    contributionsMonthly: number;
    contributionsFlex: number;
    interest: number;
    investmentReturns: number;
    bankCharges: number;
    operationalCosts: number;
    investedOut: number;
    investmentPrincipalBack: number;
    // Convenience sums matching the old MonthlySummary shape
    totalCollected: number; // contributionsMonthly + contributionsFlex
    totalCosts: number; // bankCharges + operationalCosts (investment excluded — see newDesign.md §1's "proof you already wanted this")
    netBalance: number; // totalCollected + interest + investmentReturns - totalCosts
}

const TYPE_TO_AGGREGATE_KEY: Record<string, keyof PeriodAggregate> = {
    CONTRIBUTION_MONTHLY: 'contributionsMonthly',
    CONTRIBUTION_FLEX: 'contributionsFlex',
    INTEREST_BANK: 'interest',
    INVESTMENT_RETURN: 'investmentReturns',
    BANK_CHARGE: 'bankCharges',
    OPERATIONAL_COST: 'operationalCosts',
    INVESTMENT_OUT: 'investedOut',
    INVESTMENT_PRINCIPAL_BACK: 'investmentPrincipalBack',
};

/**
 * Sums for entries whose `period` is exactly this one 'YYYY-MM' month (not
 * cumulative). Groups by (type, direction), not type alone — a reversal is
 * the opposite direction of the same type (see the entries/[id]/reverse
 * route), and this nets it out rather than double-counting it. This is
 * exactly what getFundPosition already does for the overall cash figure;
 * this just applies the same rule per category.
 */
export async function getPeriodAggregate(period: string): Promise<PeriodAggregate> {
    await connectDB();

    const rows = await LedgerEntry.aggregate([
        { $match: { status: 'POSTED', period } },
        {
            $group: {
                _id: '$type',
                creditSum: { $sum: { $cond: [{ $eq: ['$direction', 'CREDIT'] }, '$amount', 0] } },
                debitSum: { $sum: { $cond: [{ $eq: ['$direction', 'DEBIT'] }, '$amount', 0] } },
            },
        },
    ]);

    const base: PeriodAggregate = {
        contributionsMonthly: 0,
        contributionsFlex: 0,
        interest: 0,
        investmentReturns: 0,
        bankCharges: 0,
        operationalCosts: 0,
        investedOut: 0,
        investmentPrincipalBack: 0,
        totalCollected: 0,
        totalCosts: 0,
        netBalance: 0,
    };

    for (const row of rows) {
        const type = row._id as string;
        const key = TYPE_TO_AGGREGATE_KEY[type];
        if (!key) continue;

        const isCreditType = (CREDIT_TYPES as string[]).includes(type);
        // A normal entry of a CREDIT-type moves money the "credit" way; a
        // reversal of it is booked as a DEBIT of the same type, so net =
        // credit - debit correctly subtracts it out (and symmetrically for
        // DEBIT-type entries and their reversals).
        base[key] = isCreditType ? row.creditSum - row.debitSum : row.debitSum - row.creditSum;
    }

    base.totalCollected = base.contributionsMonthly + base.contributionsFlex;
    base.totalCosts = base.bankCharges + base.operationalCosts;
    base.netBalance = base.totalCollected + base.interest + base.investmentReturns - base.totalCosts;

    return base;
}

export interface MemberContribution {
    memberId: string;
    monthlyPaid: number; // paisa
    flexiblePaid: number; // paisa
}

/**
 * Per-member CONTRIBUTION_MONTHLY/CONTRIBUTION_FLEX totals across an
 * inclusive period range (e.g. '2026-01' through '2026-12' for a calendar
 * year) — string comparison on 'YYYY-MM' sorts correctly since it's
 * zero-padded.
 */
export async function getMemberContributionsInRange(
    startPeriod: string,
    endPeriod: string,
    memberId?: string
): Promise<MemberContribution[]> {
    await connectDB();

    const match: Record<string, unknown> = {
        status: 'POSTED',
        period: { $gte: startPeriod, $lte: endPeriod },
        type: { $in: ['CONTRIBUTION_MONTHLY', 'CONTRIBUTION_FLEX'] },
        memberId: { $ne: null },
    };
    if (memberId) match.memberId = memberId;

    // Net credit-minus-debit per (member, type) — a reversal of a
    // contribution is booked as a DEBIT of the same type (see the
    // entries/[id]/reverse route), so this correctly nets it out rather
    // than double-counting it, same as getPeriodAggregate.
    const rows = await LedgerEntry.aggregate([
        { $match: match },
        {
            $group: {
                _id: { memberId: '$memberId', type: '$type' },
                creditSum: { $sum: { $cond: [{ $eq: ['$direction', 'CREDIT'] }, '$amount', 0] } },
                debitSum: { $sum: { $cond: [{ $eq: ['$direction', 'DEBIT'] }, '$amount', 0] } },
            },
        },
    ]);

    const byMember = new Map<string, MemberContribution>();
    for (const row of rows) {
        const memberId = String(row._id.memberId);
        const entry = byMember.get(memberId) ?? { memberId, monthlyPaid: 0, flexiblePaid: 0 };
        const net = row.creditSum - row.debitSum;
        if (row._id.type === 'CONTRIBUTION_MONTHLY') entry.monthlyPaid = net;
        else entry.flexiblePaid = net;
        byMember.set(memberId, entry);
    }

    return Array.from(byMember.values());
}

/** Distinct 'YYYY-MM' periods with at least one POSTED entry in range — replaces the old transferDate/selectMonth-mixing month enumeration. */
export async function listPeriodsWithActivity(startPeriod: string, endPeriod: string): Promise<string[]> {
    await connectDB();
    const periods = await LedgerEntry.distinct('period', {
        status: 'POSTED',
        period: { $gte: startPeriod, $lte: endPeriod },
    });
    return (periods as string[]).sort();
}
