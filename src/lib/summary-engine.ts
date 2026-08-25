import User from '@/models/User';
import MonthlySummary from '@/models/MonthlySummary';
import { getContributionPolicy } from '@/lib/policies';
import { fromPaisa } from '@/lib/money';
import { getMemberContributionsInRange, getPeriodAggregate } from '@/lib/ledger';

// These three functions are the public read API other routes call — their
// return shapes are unchanged from before the ledger migration (the
// frontend depends on the exact fields below), only the underlying
// computation source changed: everything now derives from LedgerEntry via
// src/lib/ledger.ts, which is the single place allowed to sum money. This
// settles the transferDate-vs-selectMonth basis split and the
// investment-cost-netting inconsistency that existed across the old
// Transfer/Cost-querying versions of these functions (period, everywhere,
// is now the one accounting-month basis).

export async function buildUserYearlySummary(userId: string, year: number) {
  const policy = getContributionPolicy(year);
  const startPeriod = `${year}-01`;
  const endPeriod = `${year}-12`;

  const [contribution] = await getMemberContributionsInRange(startPeriod, endPeriod, userId);
  const monthlyPaid = fromPaisa(contribution?.monthlyPaid ?? 0);
  const flexiblePaid = fromPaisa(contribution?.flexiblePaid ?? 0);

  const now = new Date();
  const currentMonth =
    year < now.getFullYear()
      ? 12
      : year > now.getFullYear()
        ? 0
        : now.getMonth() + 1;

  const totalMonthlyExpected = policy.monthlyAmount * 12;
  const totalFlexibleExpected = policy.yearlyFlexibleAmount;
  const totalExpected = totalMonthlyExpected + totalFlexibleExpected;
  const totalPaid = monthlyPaid + flexiblePaid;

  const remainingMonthly = Math.max(totalMonthlyExpected - monthlyPaid, 0);
  const remainingFlexible = Math.max(totalFlexibleExpected - flexiblePaid, 0);
  const completionPercentage = totalExpected > 0 ? Math.min(Math.round((totalPaid / totalExpected) * 100), 100) : 0;

  return {
    year,
    monthly: {
      expected: currentMonth * policy.monthlyAmount,
      paid: monthlyPaid,
      remaining: remainingMonthly,
      monthsPaid: Math.floor(monthlyPaid / policy.monthlyAmount),
      monthsRemaining: Math.max(12 - Math.floor(monthlyPaid / policy.monthlyAmount), 0),
      perMonth: policy.monthlyAmount,
      latePayments: 0,
    },
    flexible: {
      expected: totalFlexibleExpected,
      paid: flexiblePaid,
      remaining: remainingFlexible,
      hasWarning: currentMonth >= policy.flexHalfDeadlineMonth && flexiblePaid < policy.flexHalfMinimum,
    },
    total: {
      expected: totalExpected,
      paid: totalPaid,
      remaining: remainingMonthly + remainingFlexible,
      completionPercentage,
    },
  };
}

export async function buildGlobalSummary(year: number) {
  const policy = getContributionPolicy(year);
  const startPeriod = `${year}-01`;
  const endPeriod = `${year}-12`;

  const members = await User.find({ isActive: true }).select('_id name email avatar');
  const contributions = await getMemberContributionsInRange(startPeriod, endPeriod);
  const contributionByMember = new Map(contributions.map((c) => [c.memberId, c]));

  // Per-period costs across the year, for costItems + the operational/
  // investment split (costItems still needs individual line items, which
  // getPeriodAggregate doesn't return — see the dedicated ledger query below).
  const periods = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  const periodAggregates = await Promise.all(periods.map((p) => getPeriodAggregate(p)));

  let totalMonthlyCollected = 0;
  let totalFlexibleCollected = 0;
  let totalOperationalCosts = 0;
  let totalInvestmentAmount = 0;
  let totalInterest = 0;
  let totalInvestmentReturns = 0;

  for (const agg of periodAggregates) {
    totalMonthlyCollected += fromPaisa(agg.contributionsMonthly);
    totalFlexibleCollected += fromPaisa(agg.contributionsFlex);
    totalOperationalCosts += fromPaisa(agg.bankCharges + agg.operationalCosts);
    totalInvestmentAmount += fromPaisa(agg.investedOut);
    totalInterest += fromPaisa(agg.interest);
    totalInvestmentReturns += fromPaisa(agg.investmentReturns);
  }

  const totalCosts = totalOperationalCosts + totalInvestmentAmount;
  const totalCollected = totalMonthlyCollected + totalFlexibleCollected;
  const memberCount = members.length;
  const totalExpected = memberCount * ((policy.monthlyAmount * 12) + policy.yearlyFlexibleAmount);

  const userSummaries = members.map((member) => {
    const contribution = contributionByMember.get(String(member._id));
    const monthlyPaid = fromPaisa(contribution?.monthlyPaid ?? 0);
    const flexiblePaid = fromPaisa(contribution?.flexiblePaid ?? 0);
    const monthlyRemaining = Math.max(policy.monthlyAmount * 12 - monthlyPaid, 0);
    const flexibleRemaining = Math.max(policy.yearlyFlexibleAmount - flexiblePaid, 0);
    const totalPaid = monthlyPaid + flexiblePaid;
    const totalRemaining = monthlyRemaining + flexibleRemaining;
    const completionPercentage = totalExpected > 0
      ? Math.min(Math.round((totalPaid / ((policy.monthlyAmount * 12) + policy.yearlyFlexibleAmount)) * 100), 100)
      : 0;

    return {
      userId: String(member._id),
      userName: member.name,
      userEmail: member.email,
      userAvatar: member.avatar ?? null,
      monthlyPaid,
      monthlyRemaining,
      flexiblePaid,
      flexibleRemaining,
      totalPaid,
      totalRemaining,
      completionPercentage,
    };
  }).sort((a, b) => a.userName.localeCompare(b.userName));

  return {
    year,
    config: {
      monthlyAmount: policy.monthlyAmount,
      yearlyFlexibleAmount: policy.yearlyFlexibleAmount,
      deadlineDay: policy.deadlineDay,
      totalMembers: memberCount,
    },
    totals: {
      expected: totalExpected,
      collected: totalCollected,
      remaining: Math.max(totalExpected - totalCollected, 0),
      costs: totalCosts,
      operationalCosts: totalOperationalCosts,
      investmentAmount: totalInvestmentAmount,
      // netAmount = collected + interest + investment returns, minus
      // operational costs only — investment (an asset transfer, not an
      // expense) is never deducted. See newDesign.md §1/§3.
      netAmount: totalCollected + totalInterest + totalInvestmentReturns - totalOperationalCosts,
    },
    breakdown: {
      monthlyExpected: memberCount * policy.monthlyAmount * 12,
      monthlyCollected: totalMonthlyCollected,
      flexibleExpected: memberCount * policy.yearlyFlexibleAmount,
      flexibleCollected: totalFlexibleCollected,
    },
    costItems: await getCostItemsInRange(startPeriod, endPeriod),
    userSummaries,
  };
}

// costItems needs individual line items (id/date/category/amount/reason),
// which the period-aggregate helpers deliberately don't return — a small
// dedicated query against LedgerEntry for just the DEBIT-type entries.
async function getCostItemsInRange(startPeriod: string, endPeriod: string) {
  const LedgerEntry = (await import('@/models/LedgerEntry')).default;
  const connectDB = (await import('@/lib/mongoose')).default;
  await connectDB();

  const entries = await LedgerEntry.find({
    status: 'POSTED',
    period: { $gte: startPeriod, $lte: endPeriod },
    type: { $in: ['BANK_CHARGE', 'OPERATIONAL_COST', 'INVESTMENT_OUT'] },
  }).sort({ valueDate: 1 });

  const TYPE_TO_CATEGORY: Record<string, string> = {
    BANK_CHARGE: 'bank_charge',
    OPERATIONAL_COST: 'operational',
    INVESTMENT_OUT: 'investment',
  };

  return entries.map((entry) => ({
    id: String(entry._id),
    date: entry.valueDate,
    category: TYPE_TO_CATEGORY[entry.type] || 'other',
    amount: fromPaisa(entry.amount),
    reason: entry.title,
  }));
}

export async function rebuildMonthlySummaryForMonth(monthIso: string) {
  const [year] = monthIso.split('-').map(Number);
  const policy = getContributionPolicy(year);
  const activeMemberCount = await User.countDocuments({ isActive: true });

  const aggregate = await getPeriodAggregate(monthIso);
  const perMemberContributions = await getMemberContributionsInRange(monthIso, monthIso);

  let fullyPaidMembers = 0;
  let partiallyPaidMembers = 0;

  for (const contribution of perMemberContributions) {
    const paid = fromPaisa(contribution.monthlyPaid);
    if (paid >= policy.monthlyAmount) {
      fullyPaidMembers += 1;
    } else if (paid > 0) {
      partiallyPaidMembers += 1;
    }
  }

  const unpaidMembers = Math.max(activeMemberCount - fullyPaidMembers - partiallyPaidMembers, 0);
  const totalMonthly = fromPaisa(aggregate.contributionsMonthly);
  const totalFlex = fromPaisa(aggregate.contributionsFlex);

  return MonthlySummary.findOneAndUpdate(
    { month: monthIso },
    {
      month: monthIso,
      year,
      // totalCosts/netBalance below already exclude investment from "costs"
      // (see getPeriodAggregate in src/lib/ledger.ts) — matches
      // buildGlobalSummary's netting rule. The old version of this function
      // summed ALL costs including investment, contradicting
      // buildGlobalSummary; both now agree, derived from the same helper.
      totalCollected: fromPaisa(aggregate.totalCollected),
      totalMonthly,
      totalFlex,
      totalCosts: fromPaisa(aggregate.totalCosts),
      netBalance: fromPaisa(aggregate.netBalance),
      fullyPaidMembers,
      partiallyPaidMembers,
      unpaidMembers,
      generatedAt: new Date(),
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
}
