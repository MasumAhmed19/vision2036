/**
 * All ledger money is stored as integer paisa (1 Taka = 100 paisa) — the
 * existing Transfer/Cost collections store floats and are left exactly as
 * they are; these helpers exist only for the new LedgerEntry-based code.
 */

export const toPaisa = (taka: number): number => Math.round(taka * 100);

export const fromPaisa = (paisa: number): number => paisa / 100;

// Bangladeshi lakh/crore grouping — 5,50,000 not 550,000
const TAKA_FORMATTER = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
});

export const formatTk = (paisa: number): string => `৳ ${TAKA_FORMATTER.format(fromPaisa(paisa))}`;
