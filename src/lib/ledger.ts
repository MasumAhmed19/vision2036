import mongoose from 'mongoose';
import connectDB from '@/lib/mongoose';
import LedgerEntry, { CREDIT_TYPES } from '@/models/LedgerEntry';
import User from '@/models/User';
import { getContributionPolicy, getCurrentMonthIso } from '@/lib/policies';
import { toPaisa } from '@/lib/money';
import type { IPeriodSnapshot } from '@/models/Period';

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

    // A REVERSED entry's original movement genuinely happened (real money
    // moved) and is only offset by a separate reversal entry, not erased —
    // both must be included here or the pair fails to net to zero (see the
    // REVERSED_STATUS_NOTE below).
    const match: Record<string, unknown> = { status: { $in: ['POSTED', 'REVERSED'] } };
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
                investedOutDebit: {
                    $sum: {
                        $cond: [{ $and: [{ $eq: ['$type', 'INVESTMENT_OUT'] }, { $eq: ['$direction', 'DEBIT'] }] }, '$amount', 0],
                    },
                },
                investedOutCredit: {
                    $sum: {
                        $cond: [{ $and: [{ $eq: ['$type', 'INVESTMENT_OUT'] }, { $eq: ['$direction', 'CREDIT'] }] }, '$amount', 0],
                    },
                },
                investedBackCredit: {
                    $sum: {
                        $cond: [
                            { $and: [{ $eq: ['$type', 'INVESTMENT_PRINCIPAL_BACK'] }, { $eq: ['$direction', 'CREDIT'] }] },
                            '$amount',
                            0,
                        ],
                    },
                },
                investedBackDebit: {
                    $sum: {
                        $cond: [
                            { $and: [{ $eq: ['$type', 'INVESTMENT_PRINCIPAL_BACK'] }, { $eq: ['$direction', 'DEBIT'] }] },
                            '$amount',
                            0,
                        ],
                    },
                },
            },
        },
    ]);

    const creditTotal = row?.creditTotal ?? 0;
    const debitTotal = row?.debitTotal ?? 0;
    // Net of direction, not a raw sum-by-type — a reversed INVESTMENT_OUT is
    // booked as a CREDIT of the same type (see entries/[id]/reverse/route.ts),
    // so summing by type alone would double it instead of cancelling it out.
    const investedOut = (row?.investedOutDebit ?? 0) - (row?.investedOutCredit ?? 0);
    const investedBack = (row?.investedBackCredit ?? 0) - (row?.investedBackDebit ?? 0);
    const investedAtCost = investedOut - investedBack;
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

/** Sums for entries whose `period` is exactly this one 'YYYY-MM' month (not cumulative). */
export async function getPeriodAggregate(period: string): Promise<PeriodAggregate> {
    await connectDB();
    return aggregateByType({ status: { $in: ['POSTED', 'REVERSED'] }, period });
}

/**
 * Same as getPeriodAggregate, but summed over an inclusive 'YYYY-MM' range
 * instead of a single month — e.g. for a "January–June 2026" statement.
 */
export async function getRangeAggregate(startPeriod: string, endPeriod: string): Promise<PeriodAggregate> {
    await connectDB();
    return aggregateByType({
        status: { $in: ['POSTED', 'REVERSED'] },
        period: { $gte: startPeriod, $lte: endPeriod },
    });
}

/**
 * Groups by (type, direction), not type alone — a reversal is the opposite
 * direction of the same type (see the entries/[id]/reverse route), and this
 * nets it out rather than double-counting it. This is exactly what
 * getFundPosition already does for the overall cash figure; this just
 * applies the same rule per category.
 *
 * `match` must constrain status to POSTED and REVERSED — a reversed entry's
 * status changes to REVERSED (not POSTED), so excluding it would mean only
 * the reversal's opposite-direction amount gets counted, inverting the net
 * instead of cancelling it to zero.
 */
async function aggregateByType(match: Record<string, unknown>): Promise<PeriodAggregate> {
    const rows = await LedgerEntry.aggregate([
        { $match: match },
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
        // See getPeriodAggregate above — REVERSED must stay included so a
        // reversed contribution and its reversal net to zero rather than
        // inverting.
        status: { $in: ['POSTED', 'REVERSED'] },
        period: { $gte: startPeriod, $lte: endPeriod },
        type: { $in: ['CONTRIBUTION_MONTHLY', 'CONTRIBUTION_FLEX'] },
        memberId: { $ne: null },
    };
    // Model.aggregate() bypasses Mongoose's schema-based query casting (unlike
    // .find()), so a raw string here would never match the ObjectId values
    // actually stored on memberId — every per-member call (e.g. "My Summary")
    // would silently return zero rows while the all-members call keeps working,
    // since that one never filters by memberId at all.
    if (memberId) match.memberId = new mongoose.Types.ObjectId(memberId);

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

/** Same as getPeriodAggregate/getRangeAggregate, but with no period bound at all — the all-time totals. */
export async function getAllTimeAggregate(): Promise<PeriodAggregate> {
    await connectDB();
    return aggregateByType({ status: { $in: ['POSTED', 'REVERSED'] } });
}

/** One member's all-time CONTRIBUTION_MONTHLY/CONTRIBUTION_FLEX totals — no period bound, unlike getMemberContributionsInRange. */
export async function getMemberAllTimeContribution(memberId: string): Promise<MemberContribution> {
    await connectDB();

    const rows = await LedgerEntry.aggregate([
        {
            $match: {
                status: { $in: ['POSTED', 'REVERSED'] },
                type: { $in: ['CONTRIBUTION_MONTHLY', 'CONTRIBUTION_FLEX'] },
                memberId: new mongoose.Types.ObjectId(memberId),
            },
        },
        {
            $group: {
                _id: '$type',
                creditSum: { $sum: { $cond: [{ $eq: ['$direction', 'CREDIT'] }, '$amount', 0] } },
                debitSum: { $sum: { $cond: [{ $eq: ['$direction', 'DEBIT'] }, '$amount', 0] } },
            },
        },
    ]);

    const result: MemberContribution = { memberId, monthlyPaid: 0, flexiblePaid: 0 };
    for (const row of rows) {
        const net = row.creditSum - row.debitSum;
        if (row._id === 'CONTRIBUTION_MONTHLY') result.monthlyPaid = net;
        else result.flexiblePaid = net;
    }
    return result;
}

/**
 * Everything a Period.snapshot freezes at close time, in paisa — the one
 * function allowed to compute it, called both by the close route (which
 * saves the result) and the period GET route (which uses it for a live
 * preview of an OPEN month without saving anything).
 */
export async function computePeriodSnapshot(month: string): Promise<IPeriodSnapshot> {
    await connectDB();

    const [aggregate, position, members, contributions] = await Promise.all([
        getPeriodAggregate(month),
        getFundPosition({ throughPeriod: month }),
        User.find({ isActive: true }).select('_id'),
        getMemberContributionsInRange(month, month),
    ]);

    const policy = getContributionPolicy(Number(month.split('-')[0]));
    const monthlyAmountPaisa = toPaisa(policy.monthlyAmount);
    const paidByMember = new Map(contributions.map((c) => [c.memberId, c.monthlyPaid]));

    let membersPaid = 0;
    let membersPending = 0;
    let membersUnpaid = 0;
    for (const member of members) {
        const paid = paidByMember.get(String(member._id)) || 0;
        if (paid >= monthlyAmountPaisa) membersPaid += 1;
        else if (paid > 0) membersPending += 1;
        else membersUnpaid += 1;
    }

    return {
        contributionsMonthly: aggregate.contributionsMonthly,
        contributionsFlex: aggregate.contributionsFlex,
        interest: aggregate.interest,
        investmentReturns: aggregate.investmentReturns,
        bankCharges: aggregate.bankCharges,
        operationalCosts: aggregate.operationalCosts,
        investedOut: aggregate.investedOut,
        investmentPrincipalBack: aggregate.investmentPrincipalBack,
        cash: position.cash,
        investedAtCost: position.investedAtCost,
        fundValue: position.fundValue,
        membersPaid,
        membersPending,
        membersUnpaid,
    };
}

/** Distinct 'YYYY-MM' periods with at least one POSTED/REVERSED entry in range — replaces the old transferDate/selectMonth-mixing month enumeration. */
export async function listPeriodsWithActivity(startPeriod: string, endPeriod: string): Promise<string[]> {
    await connectDB();
    const periods = await LedgerEntry.distinct('period', {
        status: { $in: ['POSTED', 'REVERSED'] },
        period: { $gte: startPeriod, $lte: endPeriod },
    });
    return (periods as string[]).sort();
}

/**
 * The fund's "all time" window — its first-ever posted activity through the
 * current month — used by every all-time view (Global Summary's "All Time"
 * tab, the member export's whole-history statement) so they all agree on
 * exactly what period "all time" covers instead of each computing it
 * separately. Falls back to the current month alone if there's no activity
 * yet (a brand-new install).
 */
export async function getAllTimeRange(): Promise<{ startPeriod: string; endPeriod: string }> {
    const endPeriod = getCurrentMonthIso();
    const activePeriods = await listPeriodsWithActivity('2000-01', endPeriod);
    return { startPeriod: activePeriods[0] || endPeriod, endPeriod };
}
