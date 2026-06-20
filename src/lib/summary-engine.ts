import Transfer from '@/models/Transfer';
import User from '@/models/User';
import Cost from '@/models/Cost';
import MonthlySummary from '@/models/MonthlySummary';
import { getContributionPolicy, getMonthRange, getYearRange } from '@/lib/policies';

export async function buildUserYearlySummary(userId: string, year: number) {
  const policy = getContributionPolicy(year);
  const { start, end } = getYearRange(year);

  const transfers = await Transfer.find({
    initiator: userId,
    status: 'VERIFIED',
    transferDate: { $gte: start, $lt: end },
  });

  const monthlyPaid = transfers.reduce((sum, transfer) => sum + (transfer.monthlyAmount || 0), 0);
  const flexiblePaid = transfers.reduce((sum, transfer) => sum + (transfer.flexAmount || 0), 0);

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
  const { start, end } = getYearRange(year);

  const members = await User.find({ isActive: true }).select('_id name email');
  const transfers = await Transfer.find({
    status: 'VERIFIED',
    transferDate: { $gte: start, $lt: end },
  }).populate('initiator', 'name email');
  const costs = await Cost.find({
    date: { $gte: start, $lt: end },
  });

  const memberMap = new Map<string, { monthlyPaid: number; flexiblePaid: number }>();
  for (const member of members) {
    memberMap.set(String(member._id), { monthlyPaid: 0, flexiblePaid: 0 });
  }

  let totalMonthlyCollected = 0;
  let totalFlexibleCollected = 0;

  for (const transfer of transfers) {
    const memberId = transfer.initiator !== null && typeof transfer.initiator === 'object'
      ? String((transfer.initiator as any)._id)
      : String(transfer.initiator);
    if (!memberId) continue;
    const current = memberMap.get(memberId) || { monthlyPaid: 0, flexiblePaid: 0 };
    current.monthlyPaid += transfer.monthlyAmount || 0;
    current.flexiblePaid += transfer.flexAmount || 0;
    memberMap.set(memberId, current);

    totalMonthlyCollected += transfer.monthlyAmount || 0;
    totalFlexibleCollected += transfer.flexAmount || 0;
  }

  const investmentCosts = costs.filter((c) => c.category === 'investment');
  const operationalCosts = costs.filter((c) => c.category !== 'investment');
  const totalInvestmentAmount = investmentCosts.reduce((sum, c) => sum + c.amount, 0);
  const totalOperationalCosts = operationalCosts.reduce((sum, c) => sum + c.amount, 0);
  const totalCosts = totalOperationalCosts + totalInvestmentAmount; // kept for reference
  const totalCollected = totalMonthlyCollected + totalFlexibleCollected;
  const memberCount = members.length;
  const totalExpected = memberCount * ((policy.monthlyAmount * 12) + policy.yearlyFlexibleAmount);

  const userSummaries = members.map((member) => {
    const totals = memberMap.get(String(member._id)) || { monthlyPaid: 0, flexiblePaid: 0 };
    const monthlyRemaining = Math.max(policy.monthlyAmount * 12 - totals.monthlyPaid, 0);
    const flexibleRemaining = Math.max(policy.yearlyFlexibleAmount - totals.flexiblePaid, 0);
    const totalPaid = totals.monthlyPaid + totals.flexiblePaid;
    const totalRemaining = monthlyRemaining + flexibleRemaining;
    const completionPercentage = totalExpected > 0
      ? Math.min(Math.round((totalPaid / ((policy.monthlyAmount * 12) + policy.yearlyFlexibleAmount)) * 100), 100)
      : 0;

    return {
      userId: String(member._id),
      userName: member.name,
      userEmail: member.email,
      monthlyPaid: totals.monthlyPaid,
      monthlyRemaining,
      flexiblePaid: totals.flexiblePaid,
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
      // netAmount = collected minus operational costs only; investment is NOT deducted
      netAmount: totalCollected - totalOperationalCosts,
    },
    breakdown: {
      monthlyExpected: memberCount * policy.monthlyAmount * 12,
      monthlyCollected: totalMonthlyCollected,
      flexibleExpected: memberCount * policy.yearlyFlexibleAmount,
      flexibleCollected: totalFlexibleCollected,
    },
    costItems: costs.map((c) => ({
      id: String(c._id),
      date: c.date,
      category: c.category,
      amount: c.amount,
      reason: c.reason,
    })),
    userSummaries,
  };
}

export async function rebuildMonthlySummaryForMonth(monthIso: string) {
  const { start, end, year } = getMonthRange(monthIso);
  const policy = getContributionPolicy(year);
  const activeMemberCount = await User.countDocuments({ isActive: true });

  const transfers = await Transfer.find({
    status: 'VERIFIED',
    selectMonth: monthIso,
  });
  const costs = await Cost.find({
    date: { $gte: start, $lt: end },
  });

  const memberMonthlyTotals = new Map<string, number>();
  let totalMonthly = 0;
  let totalFlex = 0;

  for (const transfer of transfers) {
    const memberId = String(transfer.initiator);
    memberMonthlyTotals.set(memberId, (memberMonthlyTotals.get(memberId) || 0) + (transfer.monthlyAmount || 0));
    totalMonthly += transfer.monthlyAmount || 0;
    totalFlex += transfer.flexAmount || 0;
  }

  let fullyPaidMembers = 0;
  let partiallyPaidMembers = 0;

  for (const paid of memberMonthlyTotals.values()) {
    if (paid >= policy.monthlyAmount) {
      fullyPaidMembers += 1;
    } else if (paid > 0) {
      partiallyPaidMembers += 1;
    }
  }

  const unpaidMembers = Math.max(activeMemberCount - fullyPaidMembers - partiallyPaidMembers, 0);
  const totalCosts = costs.reduce((sum, cost) => sum + cost.amount, 0);
  const totalCollected = totalMonthly + totalFlex;

  return MonthlySummary.findOneAndUpdate(
    { month: monthIso },
    {
      month: monthIso,
      year,
      totalCollected,
      totalMonthly,
      totalFlex,
      totalCosts,
      netBalance: totalCollected - totalCosts,
      fullyPaidMembers,
      partiallyPaidMembers,
      unpaidMembers,
      generatedAt: new Date(),
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
}
