export interface ContributionPolicyConfig {
  monthlyAmount: number;
  yearlyFlexibleAmount: number;
  flexHalfDeadlineMonth: number;
  flexHalfMinimum: number;
  deadlineDay: number;
}

export const DEFAULT_CONTRIBUTION_POLICY: ContributionPolicyConfig = {
  monthlyAmount: 3000,
  yearlyFlexibleAmount: 14000,
  flexHalfDeadlineMonth: 6,
  flexHalfMinimum: 7000,
  deadlineDay: 20,
};

export function getContributionPolicy(_year?: number): ContributionPolicyConfig {
  return DEFAULT_CONTRIBUTION_POLICY;
}

export function getMonthRange(monthIso: string) {
  const [year, month] = monthIso.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

  return { start, end, year, month };
}

export function getYearRange(year: number) {
  return {
    start: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
    end: new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0)),
  };
}

export function getCurrentMonthIso(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function formatMonthLabel(monthIso: string) {
  const date = new Date(`${monthIso}-01T00:00:00.000Z`);
  return date.toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
