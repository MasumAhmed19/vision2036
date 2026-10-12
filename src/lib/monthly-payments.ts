import mongoose from 'mongoose';
import Transfer, { type ITransfer } from '@/models/Transfer';
import { getContributionPolicy, getCurrentMonthIso } from '@/lib/policies';

export function parseMonth(value: string): number | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  const [year, month] = value.split('-').map(Number);
  return year * 12 + month - 1;
}

export function monthFromOrdinal(ordinal: number): string {
  const year = Math.floor(ordinal / 12);
  const month = ordinal % 12 + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

function positiveInteger(name: string, fallback: number): number {
  if (process.env[name] === undefined || process.env[name] === '') return fallback;
  const value = Number(process.env[name]);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Invalid ${name}`);
  return value;
}

export function getMonthlyPaymentLimits(now = new Date()) {
  const currentMonth = getCurrentMonthIso(now);
  const earliestMonth = process.env.PAYMENT_EARLIEST_MONTH || '2025-01';
  const current = parseMonth(currentMonth)!;
  const earliest = parseMonth(earliestMonth);
  if (earliest === null || earliest > current) throw new Error('Invalid PAYMENT_EARLIEST_MONTH');
  const maxFutureMonths = positiveInteger('PAYMENT_MAX_FUTURE_MONTHS', 12);
  const maxMonthsPerSubmission = positiveInteger('PAYMENT_MAX_MONTHS_PER_SUBMISSION', 12);
  return {
    currentMonth,
    earliestMonth,
    maxFutureMonths,
    maxMonthsPerSubmission,
    monthlyAmount: getContributionPolicy().monthlyAmount,
    lastMonth: monthFromOrdinal(current + maxFutureMonths),
  };
}

export function validateMonthlyMonths(months: unknown, now = new Date()): string[] {
  const limits = getMonthlyPaymentLimits(now);
  if (!Array.isArray(months) || months.length < 1 || months.length > limits.maxMonthsPerSubmission) {
    throw new Error(`Choose 1 to ${limits.maxMonthsPerSubmission} months.`);
  }
  if (months.some((month) => typeof month !== 'string' || parseMonth(month) === null)) {
    throw new Error('Invalid contribution month.');
  }
  if (new Set(months).size !== months.length) throw new Error('A month may be selected only once.');
  const first = parseMonth(limits.earliestMonth)!;
  const last = parseMonth(limits.lastMonth)!;
  if (months.some((month) => parseMonth(month)! < first || parseMonth(month)! > last)) {
    throw new Error(`Choose months from ${limits.earliestMonth} through ${limits.lastMonth}.`);
  }
  return [...months].sort();
}

export class MonthlyPaymentConflictError extends Error {}

export async function assertMonthlyMonthsAvailable(userId: string, months: string[], session?: mongoose.ClientSession) {
  const existing = await Transfer.findOne({
    initiator: userId,
    selectMonth: { $in: months },
    monthlyAmount: { $gt: 0 },
    status: { $ne: 'REJECTED' },
  }).session(session || null).select('selectMonth');
  if (existing) throw new MonthlyPaymentConflictError(`A monthly payment for ${existing.selectMonth} has already been submitted.`);
}

export async function assertTransactionSupport() {
  const hello = await mongoose.connection.db!.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid') {
    throw new Error('Multi-month payments require a MongoDB replica set or sharded cluster.');
  }
}

export function groupTransferRows<T extends { _id: unknown; paymentGroupId?: unknown; selectMonth: string; monthlyAmount: number; flexAmount: number; totalAmount: number }>(rows: T[]): (T & { months?: string[] })[] {
  const groups = new Map<string, T[]>();
  const order: string[] = [];
  for (const row of rows) {
    const key = row.paymentGroupId ? String(row.paymentGroupId) : String(row._id);
    if (!groups.has(key)) { groups.set(key, []); order.push(key); }
    groups.get(key)!.push(row);
  }
  return order.map((key) => {
    const group = groups.get(key)!;
    if (group.length === 1 && !group[0].paymentGroupId) return group[0];
    const months = group.map((row) => row.selectMonth).sort();
    return {
      ...group[0],
      selectMonth: months[0],
      months,
      monthlyAmount: group.reduce((sum, row) => sum + row.monthlyAmount, 0),
      flexAmount: group.reduce((sum, row) => sum + row.flexAmount, 0),
      totalAmount: group.reduce((sum, row) => sum + row.totalAmount, 0),
    };
  });
}

type TransferRow = ITransfer & { _id: mongoose.Types.ObjectId; months?: string[] };

export async function findGroupedTransfers(query: Record<string, unknown>, page: number, limit: number, populateInitiator = false) {
  const matchedQuery = Transfer.find(query).sort({ transferDate: -1, createdAt: -1 }).populate('verifiedById', 'name email');
  if (populateInitiator) matchedQuery.populate('initiator', 'name email avatar role phoneNumber isActive');
  const matched = await matchedQuery.lean() as unknown as TransferRow[];
  const groupIds = [...new Set(matched.filter((row) => row.paymentGroupId).map((row) => String(row.paymentGroupId)))];
  const siblingsQuery = Transfer.find({ paymentGroupId: { $in: groupIds } }).populate('verifiedById', 'name email');
  if (populateInitiator) siblingsQuery.populate('initiator', 'name email avatar role phoneNumber isActive');
  const siblings = groupIds.length ? await siblingsQuery.lean() as unknown as TransferRow[] : [];
  const byId = new Map([...matched, ...siblings].map((row) => [String(row._id), row]));
  const grouped = groupTransferRows([...byId.values()]);
  const matchingKeys = new Set(matched.map((row) => row.paymentGroupId ? String(row.paymentGroupId) : String(row._id)));
  const visible = grouped.filter((row) => matchingKeys.has(row.paymentGroupId ? String(row.paymentGroupId) : String(row._id)));
  visible.sort((a, b) => new Date(b.transferDate).getTime() - new Date(a.transferDate).getTime());
  const safePage = Math.max(1, page || 1);
  const safeLimit = limit === 0 ? Math.max(visible.length, 1) : Math.min(100, Math.max(1, limit || 10));
  return { rows: visible.slice((safePage - 1) * safeLimit, safePage * safeLimit), total: visible.length, page: safePage, limit: safeLimit };
}
