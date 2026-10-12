import type { Transfer } from '@/types';
import { formatMonthLabel } from '@/lib/policies';

export function paymentMonthsLabel(transfer: Pick<Transfer, 'selectMonth' | 'months'>): string {
  const months = transfer.months?.length ? transfer.months : [transfer.selectMonth];
  return months.map(formatMonthLabel).join(', ');
}
