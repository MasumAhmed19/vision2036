import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import * as XLSX from 'xlsx';
import connectDB from '@/lib/mongoose';
import Transfer from '@/models/Transfer';
import Cost from '@/models/Cost';
import User from '@/models/User';
import MonthlySummary from '@/models/MonthlySummary';
import { buildGlobalSummary, rebuildMonthlySummaryForMonth } from '@/lib/summary-engine';
import { formatMonthLabel, getMonthRange } from '@/lib/policies';
import { getAllTimeRange, getMemberContributionsInRange, getPeriodAggregate, getRangeAggregate, type PeriodAggregate } from '@/lib/ledger';
import { fromPaisa } from '@/lib/money';
import { groupTransferRows } from '@/lib/monthly-payments';

export type ExportScope = 'member' | 'monthly' | 'yearly' | 'range';

type ExportTransferRow = {
  date: string;
  memberName: string;
  month: string;
  channel: string;
  monthlyAmount: number;
  flexAmount: number;
  totalAmount: number;
  status: string;
  verifiedBy: string;
  verifiedAt: string;
  note: string;
};

type ExportCostRow = {
  date: string;
  category: string;
  amount: number;
  reason: string;
  submittedBy: string;
  approvedBy: string;
};

// The fund-activity categories that sit alongside member contributions —
// everything getPeriodAggregate/getRangeAggregate tracks that isn't a
// CONTRIBUTION_MONTHLY/FLEX entry. All amounts whole Taka.
export type FundActivity = {
  bankCharges: number;
  operationalCosts: number;
  interest: number;
  investmentReturns: number;
  investedOut: number; // net principal still invested
  investmentPrincipalBack: number;
  activeMemberCount: number;
};

export type MemberShareRow = {
  id: string;
  name: string;
  contribution: number; // Taka, this report's period — monthly + flex
  // contribution + an even split of investmentReturns/costs across active
  // members over this same period, interest excluded from the split — same
  // formula as FundPosition.myShare (see /api/fund), just scoped to the
  // period this report covers instead of all-time.
  fundShare: number;
};

function toFundActivity(aggregate: PeriodAggregate, activeMemberCount: number): FundActivity {
  return {
    bankCharges: fromPaisa(aggregate.bankCharges),
    operationalCosts: fromPaisa(aggregate.operationalCosts),
    interest: fromPaisa(aggregate.interest),
    investmentReturns: fromPaisa(aggregate.investmentReturns),
    // Match Global Summary's Invested value: deployed principal minus
    // principal returned from investments.
    investedOut: fromPaisa(aggregate.investedOut - aggregate.investmentPrincipalBack),
    investmentPrincipalBack: fromPaisa(aggregate.investmentPrincipalBack),
    activeMemberCount,
  };
}

/**
 * Fund-wide activity plus every active member's contribution + fund-share
 * over an arbitrary period range — shared by the yearly and range-statement
 * exports (and the per-member one, for its own row) so all three report the
 * same numbers the same way instead of each scope inventing its own split.
 */
async function computeFundActivityAndShares(startPeriod: string, endPeriod: string) {
  const [aggregate, contributions, members] = await Promise.all([
    getRangeAggregate(startPeriod, endPeriod),
    getMemberContributionsInRange(startPeriod, endPeriod),
    User.find({ isActive: true }).select('_id name').sort({ name: 1 }),
  ]);

  const contributionByMember = new Map(contributions.map((c) => [c.memberId, c.monthlyPaid + c.flexiblePaid]));
  const perMemberSharePaisa = members.length > 0
    ? (aggregate.investmentReturns - aggregate.totalCosts) / members.length
    : 0;

  const memberShares: MemberShareRow[] = members.map((member) => {
    const contributionPaisa = contributionByMember.get(String(member._id)) || 0;
    return {
      id: String(member._id),
      name: member.name,
      contribution: fromPaisa(contributionPaisa),
      fundShare: fromPaisa(contributionPaisa + perMemberSharePaisa),
    };
  });

  return {
    fundActivity: toFundActivity(aggregate, members.length),
    memberShares,
  };
}

export type MemberExportData = {
  scope: 'member';
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  // Whole-history statement, not one calendar year — "since the fund's
  // first activity" through the current month, same window as Global
  // Summary's "All Time" tab (see getAllTimeRange in lib/ledger.ts).
  periodLabel: string;
  transfers: ExportTransferRow[];
  totals: {
    totalTransfers: number;
    verifiedMonthly: number;
    verifiedFlex: number;
    verifiedTotal: number;
  };
  // Fund-wide activity over the same all-time window, and this member's own
  // even split of it — see computeFundActivityAndShares. perMemberShare is
  // broken out on its own (rather than only folded into yourShare) so the
  // PDF can show the step-by-step arithmetic, not just the final number.
  fundActivity: FundActivity;
  perMemberShare: number;
  yourShare: number;
};

export type MonthlyExportData = {
  scope: 'monthly';
  month: string;
  monthLabel: string;
  summary: {
    totalCollected: number;
    totalMonthly: number;
    totalFlex: number;
    totalCosts: number;
    netBalance: number;
    fullyPaidMembers: number;
    partiallyPaidMembers: number;
    unpaidMembers: number;
  };
  // This month's bank/interest/investment activity — a single month is too
  // short a window for a meaningful "share" split, so this scope reports
  // fund activity and per-member contributions, not fundShare (see the
  // yearly/range scopes for that).
  fundActivity: FundActivity;
  memberPayments: Array<{ name: string; monthlyPaid: number; flexiblePaid: number; total: number }>;
  transfers: ExportTransferRow[];
  costs: ExportCostRow[];
};

export type YearlyExportData = {
  scope: 'yearly';
  year: number;
  globalSummary: Awaited<ReturnType<typeof buildGlobalSummary>>;
  monthlySummaries: Array<{
    month: string;
    totalCollected: number;
    totalMonthly: number;
    totalFlex: number;
    totalCosts: number;
    netBalance: number;
    fullyPaidMembers: number;
    partiallyPaidMembers: number;
    unpaidMembers: number;
  }>;
  fundActivity: FundActivity;
  memberShares: MemberShareRow[];
  transfers: ExportTransferRow[];
  costs: ExportCostRow[];
};

/**
 * A deliberately minimal "statement" over an arbitrary month range — total
 * deposits, total expenses (incl. investments, mirroring how members
 * themselves track "All Expenses"), net balance, and one line per member.
 * No per-transaction dump — that's what the monthly/yearly scopes are for.
 */
export type RangeExportData = {
  scope: 'range';
  startPeriod: string; // 'YYYY-MM'
  endPeriod: string; // 'YYYY-MM'
  periodLabel: string; // e.g. "January 2026 – June 2026"
  totalDeposits: number; // Taka
  totalExpenses: number; // Taka — bank charges + operational costs + net investment outflow
  netBalance: number; // Taka
  fundActivity: FundActivity;
  members: MemberShareRow[]; // Taka, sorted by name — contribution + fundShare over this range
};

export type ExportData = MemberExportData | MonthlyExportData | YearlyExportData | RangeExportData;

function formatDate(value?: Date | string | null) {
  if (!value) return '';
  return new Date(value).toISOString();
}

function mapTransferRow(transfer: any): ExportTransferRow {
  return {
    date: formatDate(transfer.transferDate),
    memberName: transfer.initiator?.name || 'Unknown',
    month: transfer.months?.join(', ') || transfer.selectMonth,
    channel: transfer.transferChannel,
    monthlyAmount: transfer.monthlyAmount || 0,
    flexAmount: transfer.flexAmount || 0,
    totalAmount: transfer.totalAmount || 0,
    status: transfer.status,
    verifiedBy: transfer.verifiedById?.name || '',
    verifiedAt: formatDate(transfer.verifiedAt),
    note: transfer.paymentGroupId && !transfer.months
      ? `Allocation from multi-month payment ${String(transfer.paymentGroupId)}${transfer.remarks ? ` · ${transfer.remarks}` : ''}`
      : transfer.remarks || transfer.rejectionReason || '',
  };
}

function mapCostRow(cost: any): ExportCostRow {
  return {
    date: formatDate(cost.date),
    category: cost.category,
    amount: cost.amount || 0,
    reason: cost.reason,
    submittedBy: cost.submittedBy?.name || 'Unknown',
    approvedBy: cost.approvedBy?.name || '',
  };
}

/**
 * A member's whole-history statement — every payment they've ever
 * submitted, not one calendar year — plus their share of the fund over
 * that same whole-history window. Backs the PDF/Excel export from the
 * /summaries page; the on-screen page itself stays year-scoped (it has its
 * own month-by-month tracker that a single year suits), only the export
 * changed to all-time.
 */
export async function getMemberExportData(userId: string): Promise<MemberExportData> {
  await connectDB();

  const user = await User.findById(userId).select('_id name email role');
  if (!user) {
    throw new Error('User not found');
  }

  const { startPeriod, endPeriod } = await getAllTimeRange();

  const [transfers, ownContribution, { fundActivity }] = await Promise.all([
    Transfer.find({ initiator: userId })
      .sort({ transferDate: -1, createdAt: -1 })
      .populate('initiator', 'name email')
      .populate('verifiedById', 'name email'),
    getMemberContributionsInRange(startPeriod, endPeriod, userId).then((rows) => rows[0]),
    computeFundActivityAndShares(startPeriod, endPeriod),
  ]);

  const rows = groupTransferRows(transfers.map((item) => item.toObject())).map(mapTransferRow);

  const verifiedMonthly = fromPaisa(ownContribution?.monthlyPaid || 0);
  const verifiedFlex = fromPaisa(ownContribution?.flexiblePaid || 0);
  const verifiedTotal = verifiedMonthly + verifiedFlex;

  // Same even-split formula as everywhere else (see computeFundActivityAndShares) —
  // kept as its own field, not just folded into yourShare, so the PDF can
  // show the arithmetic step by step instead of only the final number.
  const perMemberShare = fundActivity.activeMemberCount > 0
    ? (fundActivity.investmentReturns - fundActivity.bankCharges - fundActivity.operationalCosts) / fundActivity.activeMemberCount
    : 0;
  const yourShare = verifiedTotal + perMemberShare;

  return {
    scope: 'member',
    user: {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
    },
    periodLabel: startPeriod === endPeriod
      ? formatMonthLabel(startPeriod)
      : `${formatMonthLabel(startPeriod)} – ${formatMonthLabel(endPeriod)}`,
    transfers: rows,
    totals: {
      totalTransfers: rows.length,
      verifiedMonthly,
      verifiedFlex,
      verifiedTotal,
    },
    fundActivity,
    perMemberShare,
    yourShare,
  };
}

export async function getMonthlyExportData(month: string): Promise<MonthlyExportData> {
  await connectDB();

  const summaryDocument = await rebuildMonthlySummaryForMonth(month);
  if (!summaryDocument) {
    throw new Error('Failed to build monthly summary');
  }
  const { start, end } = getMonthRange(month);

  const [transfers, costs, members, aggregate, contributions] = await Promise.all([
    Transfer.find({ selectMonth: month })
      .sort({ transferDate: -1, createdAt: -1 })
      .populate('initiator', 'name email')
      .populate('verifiedById', 'name email'),
    Cost.find({ date: { $gte: start, $lt: end } })
      .sort({ date: -1, createdAt: -1 })
      .populate('submittedBy', 'name email')
      .populate('approvedBy', 'name email'),
    User.find({ isActive: true }).select('_id name').sort({ name: 1 }),
    getPeriodAggregate(month),
    getMemberContributionsInRange(month, month),
  ]);

  const contributionByMember = new Map(contributions.map((c) => [c.memberId, c]));
  const memberPayments = members.map((member) => {
    const contribution = contributionByMember.get(String(member._id));
    const monthlyPaid = fromPaisa(contribution?.monthlyPaid || 0);
    const flexiblePaid = fromPaisa(contribution?.flexiblePaid || 0);
    return { name: member.name, monthlyPaid, flexiblePaid, total: monthlyPaid + flexiblePaid };
  });

  return {
    scope: 'monthly',
    month,
    monthLabel: formatMonthLabel(month),
    summary: {
      totalCollected: summaryDocument.totalCollected,
      totalMonthly: summaryDocument.totalMonthly,
      totalFlex: summaryDocument.totalFlex,
      totalCosts: summaryDocument.totalCosts,
      netBalance: summaryDocument.netBalance,
      fullyPaidMembers: summaryDocument.fullyPaidMembers,
      partiallyPaidMembers: summaryDocument.partiallyPaidMembers,
      unpaidMembers: summaryDocument.unpaidMembers,
    },
    fundActivity: toFundActivity(aggregate, members.length),
    memberPayments,
    transfers: transfers.map(mapTransferRow),
    costs: costs.map(mapCostRow),
  };
}

export async function getYearlyExportData(year: number): Promise<YearlyExportData> {
  await connectDB();

  const [globalSummary, monthlySummaries, transfers, costs, { fundActivity, memberShares }] = await Promise.all([
    buildGlobalSummary(year),
    MonthlySummary.find({ year }).sort({ month: 1 }),
    Transfer.find({ selectMonth: { $regex: `^${year}-` } })
      .sort({ transferDate: -1, createdAt: -1 })
      .populate('initiator', 'name email')
      .populate('verifiedById', 'name email'),
    Cost.find({
      date: {
        $gte: new Date(Date.UTC(year, 0, 1)),
        $lt: new Date(Date.UTC(year + 1, 0, 1)),
      },
    })
      .sort({ date: -1, createdAt: -1 })
      .populate('submittedBy', 'name email')
      .populate('approvedBy', 'name email'),
    computeFundActivityAndShares(`${year}-01`, `${year}-12`),
  ]);

  return {
    scope: 'yearly',
    year,
    globalSummary,
    monthlySummaries: monthlySummaries.map((item) => ({
      month: item.month,
      totalCollected: item.totalCollected,
      totalMonthly: item.totalMonthly,
      totalFlex: item.totalFlex,
      totalCosts: item.totalCosts,
      netBalance: item.netBalance,
      fullyPaidMembers: item.fullyPaidMembers,
      partiallyPaidMembers: item.partiallyPaidMembers,
      unpaidMembers: item.unpaidMembers,
    })),
    fundActivity,
    memberShares,
    transfers: transfers.map(mapTransferRow),
    costs: costs.map(mapCostRow),
  };
}

export async function getRangeExportData(startPeriod: string, endPeriod: string): Promise<RangeExportData> {
  await connectDB();

  const [aggregate, { fundActivity, memberShares }] = await Promise.all([
    getRangeAggregate(startPeriod, endPeriod),
    computeFundActivityAndShares(startPeriod, endPeriod),
  ]);

  const totalDeposits = fromPaisa(aggregate.totalCollected);
  // Mirrors how members track "All Expenses" themselves: bank charges,
  // operational costs, and money invested out all count as money that left
  // the fund's cash — investment principal coming back offsets it.
  const totalExpenses = fromPaisa(
    aggregate.bankCharges + aggregate.operationalCosts + aggregate.investedOut - aggregate.investmentPrincipalBack
  );
  const netBalance = fromPaisa(
    aggregate.totalCollected + aggregate.interest + aggregate.investmentReturns
    - (aggregate.bankCharges + aggregate.operationalCosts + aggregate.investedOut - aggregate.investmentPrincipalBack)
  );

  const startLabel = formatMonthLabel(startPeriod);
  const endLabel = formatMonthLabel(endPeriod);

  return {
    scope: 'range',
    startPeriod,
    endPeriod,
    periodLabel: startPeriod === endPeriod ? startLabel : `${startLabel} – ${endLabel}`,
    totalDeposits,
    totalExpenses,
    netBalance,
    fundActivity,
    members: memberShares,
  };
}

function formatTaka(amount: number) {
  return `Tk. ${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

// ---------------------------------------------------------------------------
// Shared "official document" PDF system — one accent color (the app's own
// brand green, #0F5F4C), everything else black/gray. Used by every report
// scope so a member report, a monthly report, a yearly report, and a range
// statement all look like they came from the same system instead of each
// scope having invented its own ad hoc layout.
// ---------------------------------------------------------------------------

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const ACCENT = rgb(15 / 255, 95 / 255, 76 / 255); // matches --primary in globals.css
const BORDER_GRAY = rgb(0.82, 0.82, 0.82);
const ZEBRA_GRAY = rgb(0.96, 0.96, 0.96);
const TEXT_GRAY = rgb(0.42, 0.42, 0.42);
const BLACK = rgb(0.05, 0.05, 0.05);

interface DocContext {
  pdfDoc: PDFDocument;
  font: PDFFont;
  boldFont: PDFFont;
  page: PDFPage;
  y: number;
}

function newPage(ctx: DocContext) {
  ctx.page = ctx.pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  ctx.y = PAGE_HEIGHT - MARGIN;
}

function ensureSpace(ctx: DocContext, needed: number) {
  if (ctx.y - needed < MARGIN + 20) {
    newPage(ctx);
  }
}

/** Document masthead — a thin accent bar, brand wordmark, title, subtitle. */
function drawHeader(ctx: DocContext, title: string, subtitle: string) {
  ctx.page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 6, width: PAGE_WIDTH, height: 6, color: ACCENT });
  ctx.y = PAGE_HEIGHT - MARGIN;

  ctx.page.drawText('VISION2036', { x: MARGIN, y: ctx.y, size: 11, font: ctx.boldFont, color: ACCENT });
  ctx.y -= 22;
  ctx.page.drawText(title, { x: MARGIN, y: ctx.y, size: 18, font: ctx.boldFont, color: BLACK });
  ctx.y -= 18;
  ctx.page.drawText(subtitle, { x: MARGIN, y: ctx.y, size: 11, font: ctx.font, color: TEXT_GRAY });
  ctx.y -= 14;
  const generated = `Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`;
  ctx.page.drawText(generated, { x: MARGIN, y: ctx.y, size: 8, font: ctx.font, color: TEXT_GRAY });
  ctx.y -= 14;
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: MARGIN + CONTENT_WIDTH, y: ctx.y },
    thickness: 0.75,
    color: BORDER_GRAY,
  });
  ctx.y -= 22;
}

/** A small accent square + bold black label — marks the start of a section. */
function drawSectionTitle(ctx: DocContext, text: string) {
  ensureSpace(ctx, 30);
  ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - 8, width: 8, height: 8, color: ACCENT });
  ctx.page.drawText(text.toUpperCase(), { x: MARGIN + 14, y: ctx.y - 8, size: 10, font: ctx.boldFont, color: BLACK });
  ctx.y -= 24;
}

/** A row of bordered stat tiles — label in gray, value in bold black. */
function drawStatTiles(ctx: DocContext, stats: Array<[string, string]>) {
  const tileHeight = 52;
  ensureSpace(ctx, tileHeight + 16);
  const gap = 10;
  const tileWidth = (CONTENT_WIDTH - gap * (stats.length - 1)) / stats.length;

  stats.forEach(([label, value], index) => {
    const x = MARGIN + index * (tileWidth + gap);
    ctx.page.drawRectangle({
      x,
      y: ctx.y - tileHeight,
      width: tileWidth,
      height: tileHeight,
      borderColor: BORDER_GRAY,
      borderWidth: 1,
    });
    ctx.page.drawRectangle({ x, y: ctx.y - 3, width: tileWidth, height: 3, color: ACCENT });
    ctx.page.drawText(label, { x: x + 10, y: ctx.y - 20, size: 8, font: ctx.font, color: TEXT_GRAY });
    ctx.page.drawText(value, { x: x + 10, y: ctx.y - 38, size: 12, font: ctx.boldFont, color: BLACK });
  });

  ctx.y -= tileHeight + 24;
}

interface TableColumn {
  header: string;
  width: number; // fraction of CONTENT_WIDTH, must sum to 1 across columns
  align?: 'left' | 'right';
}

/** Truncates text with an ellipsis so a single cell never overruns its column. */
function fitText(text: string, maxWidth: number, size: number, font: PDFFont): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 1 && font.widthOfTextAtSize(`${truncated}…`, size) > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}…`;
}

/**
 * A real table: solid accent header row with white text, zebra-striped body
 * rows, thin gray rules, repeats its header on every new page. This is the
 * one thing every scope previously did as a raw "|"-joined text line.
 */
function drawTable(ctx: DocContext, columns: TableColumn[], rows: string[][]) {
  const rowHeight = 20;
  const headerHeight = 22;
  const cellPadding = 6;
  const colWidths = columns.map((c) => c.width * CONTENT_WIDTH);
  const colX: number[] = [];
  for (let i = 0, cursor = MARGIN; i < colWidths.length; i++) {
    colX.push(cursor);
    cursor += colWidths[i];
  }

  const drawHeaderRow = () => {
    ensureSpace(ctx, headerHeight + rowHeight);
    ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - headerHeight, width: CONTENT_WIDTH, height: headerHeight, color: ACCENT });
    columns.forEach((col, i) => {
      const textWidth = ctx.boldFont.widthOfTextAtSize(col.header, 8);
      const x = col.align === 'right' ? colX[i] + colWidths[i] - cellPadding - textWidth : colX[i] + cellPadding;
      ctx.page.drawText(col.header, { x, y: ctx.y - headerHeight + 7, size: 8, font: ctx.boldFont, color: rgb(1, 1, 1) });
    });
    ctx.y -= headerHeight;
  };

  drawHeaderRow();

  if (rows.length === 0) {
    ctx.page.drawText('No records found.', { x: MARGIN + cellPadding, y: ctx.y - 14, size: 9, font: ctx.font, color: TEXT_GRAY });
    ctx.y -= rowHeight;
    return;
  }

  rows.forEach((row, rowIndex) => {
    if (ctx.y - rowHeight < MARGIN + 20) {
      newPage(ctx);
      drawHeaderRow();
    }

    if (rowIndex % 2 === 1) {
      ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - rowHeight, width: CONTENT_WIDTH, height: rowHeight, color: ZEBRA_GRAY });
    }

    row.forEach((cell, i) => {
      const maxWidth = colWidths[i] - cellPadding * 2;
      const fitted = fitText(cell, maxWidth, 8.5, ctx.font);
      const textWidth = ctx.font.widthOfTextAtSize(fitted, 8.5);
      const x = columns[i].align === 'right' ? colX[i] + colWidths[i] - cellPadding - textWidth : colX[i] + cellPadding;
      ctx.page.drawText(fitted, { x, y: ctx.y - rowHeight + 7, size: 8.5, font: ctx.font, color: BLACK });
    });

    ctx.page.drawLine({
      start: { x: MARGIN, y: ctx.y - rowHeight },
      end: { x: MARGIN + CONTENT_WIDTH, y: ctx.y - rowHeight },
      thickness: 0.5,
      color: BORDER_GRAY,
    });

    ctx.y -= rowHeight;
  });

  ctx.y -= 16;
}

/** Second pass over every page — "Page X of N" + a small brand tagline. */
function addFooters(pdfDoc: PDFDocument, font: PDFFont) {
  const pages = pdfDoc.getPages();
  pages.forEach((page, index) => {
    page.drawLine({
      start: { x: MARGIN, y: 34 },
      end: { x: PAGE_WIDTH - MARGIN, y: 34 },
      thickness: 0.5,
      color: BORDER_GRAY,
    });
    page.drawText('Vision2036 — private fund statement', { x: MARGIN, y: 22, size: 7, font, color: TEXT_GRAY });
    const pageLabel = `Page ${index + 1} of ${pages.length}`;
    const labelWidth = font.widthOfTextAtSize(pageLabel, 7);
    page.drawText(pageLabel, { x: PAGE_WIDTH - MARGIN - labelWidth, y: 22, size: 7, font, color: TEXT_GRAY });
  });
}

async function createContext(): Promise<DocContext> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  return { pdfDoc, font, boldFont, page, y: PAGE_HEIGHT - MARGIN };
}

const TRANSFER_COLUMNS: TableColumn[] = [
  { header: 'Date', width: 0.14 },
  { header: 'Member', width: 0.24 },
  { header: 'Month', width: 0.10 },
  { header: 'Channel', width: 0.18 },
  { header: 'Amount', width: 0.16, align: 'right' },
  { header: 'Status', width: 0.18 },
];

const CHANNEL_LABELS: Record<string, string> = {
  BANK_TRANSFER: 'Bank Transfer',
  BKASH: 'bKash',
  NAGAD: 'Nagad',
  ROCKET: 'Rocket',
  CASH: 'Cash',
  OTHER: 'Other',
};

function formatChannel(channel: string) {
  return CHANNEL_LABELS[channel] || channel;
}

function formatStatus(status: string) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function transferRowToCells(t: ExportTransferRow, includeMember: boolean): string[] {
  const months = t.month.split(', ');
  const monthCell = months.length > 1 ? `${months.length} mo.` : t.month;
  const cells = [t.date.slice(0, 10), monthCell, formatChannel(t.channel), formatTaka(t.totalAmount), formatStatus(t.status)];
  return includeMember
    ? [t.date.slice(0, 10), t.memberName, monthCell, formatChannel(t.channel), formatTaka(t.totalAmount), formatStatus(t.status)]
    : cells;
}

function multiMonthAllocations(transfers: ExportTransferRow[]) {
  return transfers.flatMap((transfer) => {
    const months = transfer.month.split(', ');
    if (months.length < 2) return [];
    return months.map((month) => ({
      transferDate: transfer.date.slice(0, 10),
      month,
      monthlyAllocation: transfer.monthlyAmount / months.length,
      status: transfer.status,
    }));
  });
}

const COST_COLUMNS: TableColumn[] = [
  { header: 'Date', width: 0.14 },
  { header: 'Category', width: 0.18 },
  { header: 'Reason', width: 0.42 },
  { header: 'Amount', width: 0.14, align: 'right' },
  { header: 'Approved By', width: 0.12 },
];

const CATEGORY_LABELS: Record<string, string> = {
  bank_charge: 'Bank Charge',
  operational: 'Operational',
  investment: 'Investment',
  other: 'Other',
};

function formatCategory(category: string) {
  return CATEGORY_LABELS[category] || category;
}

// ---------------------------------------------------------------------------
// Fund-activity + member-share section — shared by the monthly, yearly, and
// range scopes so all three break the fund's non-contribution movement into
// the same categories (bank charges, operational cost, bank interest, net
// invested principal, principal returned, investment return) and, where a
// share figure applies, the same "Member / Contribution / Share of Fund" table.
// ---------------------------------------------------------------------------

function drawFundActivitySection(ctx: DocContext, activity: FundActivity, periodLabel: string) {
  drawSectionTitle(ctx, `Fund Activity — ${periodLabel}`);
  drawStatTiles(ctx, [
    ['Bank Charges', formatTaka(activity.bankCharges)],
    ['Operational Cost', formatTaka(activity.operationalCosts)],
    ['Net Invested', formatTaka(activity.investedOut)],
    ['Principal Returned', formatTaka(activity.investmentPrincipalBack)],
    ['Investment Return', formatTaka(activity.investmentReturns)],
  ]);
  drawInterestCallout(ctx, activity.interest);
}

function drawInterestCallout(ctx: DocContext, amount: number) {
  const height = 40;
  const orange = rgb(0.88, 0.48, 0.06);
  const orangeTint = rgb(1, 0.96, 0.88);
  const orangeBorder = rgb(0.96, 0.72, 0.32);
  ensureSpace(ctx, height + 16);

  ctx.page.drawRectangle({
    x: MARGIN,
    y: ctx.y - height,
    width: CONTENT_WIDTH,
    height,
    color: orangeTint,
    borderColor: orangeBorder,
    borderWidth: 1,
  });
  ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - height, width: 5, height, color: orange });
  ctx.page.drawText('Bank Interest Earned', {
    x: MARGIN + 14,
    y: ctx.y - 16,
    size: 8,
    font: ctx.boldFont,
    color: orange,
  });
  ctx.page.drawText(`${formatTaka(amount)} · pooled and excluded from member shares`, {
    x: MARGIN + 14,
    y: ctx.y - 31,
    size: 9,
    font: ctx.font,
    color: BLACK,
  });
  ctx.y -= height + 16;
}

const MEMBER_SHARE_COLUMNS: TableColumn[] = [
  { header: 'Member', width: 0.4 },
  { header: 'Contribution', width: 0.3, align: 'right' },
  { header: 'Share of Fund', width: 0.3, align: 'right' },
];

function memberShareRowToCells(m: MemberShareRow): string[] {
  return [m.name, formatTaka(m.contribution), formatTaka(m.fundShare)];
}

/** A bold sum row directly under a table — e.g. "Total" across every member's contribution/share. */
function drawTotalRow(ctx: DocContext, columns: TableColumn[], cells: string[]) {
  const rowHeight = 22;
  const cellPadding = 6;
  ensureSpace(ctx, rowHeight);

  const colWidths = columns.map((c) => c.width * CONTENT_WIDTH);
  const colX: number[] = [];
  for (let i = 0, cursor = MARGIN; i < colWidths.length; i++) {
    colX.push(cursor);
    cursor += colWidths[i];
  }

  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: MARGIN + CONTENT_WIDTH, y: ctx.y },
    thickness: 1,
    color: ACCENT,
  });

  cells.forEach((cell, i) => {
    const textWidth = ctx.boldFont.widthOfTextAtSize(cell, 9.5);
    const x = columns[i].align === 'right' ? colX[i] + colWidths[i] - cellPadding - textWidth : colX[i] + cellPadding;
    ctx.page.drawText(cell, { x, y: ctx.y - rowHeight + 8, size: 9.5, font: ctx.boldFont, color: BLACK });
  });

  ctx.y -= rowHeight + 12;
}

function sumMemberShares(members: MemberShareRow[]) {
  return {
    totalContribution: members.reduce((sum, m) => sum + m.contribution, 0),
    totalShare: members.reduce((sum, m) => sum + m.fundShare, 0),
  };
}

interface CalcLine {
  text: string;
  bold?: boolean;
  indent?: boolean;
  // A long footnote-style line (e.g. the interest caveat) — drawn smaller,
  // like drawShareFootnote's text, so it doesn't run past the page margin
  // the way it would at the normal 9pt size used for the arithmetic lines.
  small?: boolean;
}

/** A worked-example block — literal step-by-step arithmetic with the real numbers filled in, not just the final figure. */
function drawCalculationSteps(ctx: DocContext, title: string, lines: CalcLine[]) {
  drawSectionTitle(ctx, title);
  for (const line of lines) {
    ensureSpace(ctx, 16);
    const font = line.bold ? ctx.boldFont : ctx.font;
    const size = line.small ? 7 : line.bold ? 9.5 : 9;
    ctx.page.drawText(line.text, {
      x: MARGIN + (line.indent ? 14 : 0),
      y: ctx.y,
      size,
      font,
      color: line.bold ? BLACK : TEXT_GRAY,
    });
    ctx.y -= line.small ? 12 : 15;
  }
  ctx.y -= 10;
}

/** Builds the exact step-by-step lines for MemberExportData.yourShare — every number here traces back to a field already on `data`. */
function buildShareCalculationLines(data: MemberExportData): CalcLine[] {
  const { totals, fundActivity, perMemberShare, yourShare, periodLabel } = data;
  const totalCostPerMember = fundActivity.bankCharges + fundActivity.operationalCosts;

  return [
    { text: `Step 1 — Your contribution (${periodLabel})`, bold: true },
    { text: `Monthly paid: ${formatTaka(totals.verifiedMonthly)}`, indent: true },
    { text: `Flexible paid: ${formatTaka(totals.verifiedFlex)}`, indent: true },
    { text: `Total contribution: ${formatTaka(totals.verifiedTotal)}`, indent: true, bold: true },
    { text: 'Step 2 — Fund-wide activity over the same period', bold: true },
    { text: `Investment return: ${formatTaka(fundActivity.investmentReturns)}`, indent: true },
    { text: `Bank charges: ${formatTaka(fundActivity.bankCharges)}`, indent: true },
    { text: `Operational cost: ${formatTaka(fundActivity.operationalCosts)}`, indent: true },
    { text: `Active members: ${fundActivity.activeMemberCount}`, indent: true },
    { text: "Step 3 — Your even split of the fund's gains/costs", bold: true },
    { text: '(Investment return - Bank charges - Operational cost) / Active members', indent: true },
    {
      text: `= (${formatTaka(fundActivity.investmentReturns)} - ${formatTaka(totalCostPerMember)}) / ${fundActivity.activeMemberCount} = ${formatTaka(perMemberShare)}`,
      indent: true,
    },
    { text: 'Step 4 — Your Share of the Fund', bold: true },
    { text: 'Total contribution + Your split', indent: true },
    { text: `= ${formatTaka(totals.verifiedTotal)} + ${formatTaka(perMemberShare)} = ${formatTaka(yourShare)}`, indent: true, bold: true },
    {
      text: `Note: Bank interest (${formatTaka(fundActivity.interest)}) is not included in the split above - it stays pooled rather than divided among members.`,
      small: true,
    },
  ];
}

/**
 * "Share of Fund" note — explains the formula once per report rather than
 * leaving the number unexplained. Placed directly under the member table it
 * belongs to.
 */
function drawShareFootnote(ctx: DocContext, activeMemberCount: number) {
  ensureSpace(ctx, 24);
  const note = `Share of Fund = own contribution + (investment return / ${activeMemberCount} active members) - (bank charges + operational cost / ${activeMemberCount}). Bank interest is not split per member.`;
  ctx.page.drawText(note, { x: MARGIN, y: ctx.y, size: 7, font: ctx.font, color: TEXT_GRAY });
  ctx.y -= 20;
}

const MEMBER_PAYMENT_COLUMNS: TableColumn[] = [
  { header: 'Member', width: 0.4 },
  { header: 'Monthly', width: 0.2, align: 'right' },
  { header: 'Flexible', width: 0.2, align: 'right' },
  { header: 'Total', width: 0.2, align: 'right' },
];

function memberPaymentRowToCells(m: { name: string; monthlyPaid: number; flexiblePaid: number; total: number }): string[] {
  return [m.name, formatTaka(m.monthlyPaid), formatTaka(m.flexiblePaid), formatTaka(m.total)];
}

function costRowToCells(c: ExportCostRow): string[] {
  return [c.date.slice(0, 10), formatCategory(c.category), c.reason, formatTaka(c.amount), c.approvedBy || '-'];
}

async function createMemberReportPdf(data: MemberExportData) {
  const ctx = await createContext();
  drawHeader(ctx, 'Member Contribution Statement', `${data.user.name} · ${data.periodLabel}`);

  drawStatTiles(ctx, [
    ['Monthly Paid', formatTaka(data.totals.verifiedMonthly)],
    ['Flexible Paid', formatTaka(data.totals.verifiedFlex)],
    ['Total Paid', formatTaka(data.totals.verifiedTotal)],
    ['Share of Fund', formatTaka(data.yourShare)],
  ]);

  drawFundActivitySection(ctx, data.fundActivity, data.periodLabel);

  drawCalculationSteps(ctx, 'How Your Share Is Calculated', buildShareCalculationLines(data));

  drawSectionTitle(ctx, `Transfer History (${data.transfers.length})`);
  drawTable(ctx, TRANSFER_COLUMNS.filter((c) => c.header !== 'Member'), data.transfers.map((t) => transferRowToCells(t, false)));
  const allocations = multiMonthAllocations(data.transfers);
  if (allocations.length) {
    drawSectionTitle(ctx, 'Multi-month Submission Breakdown');
    drawTable(ctx, [
      { header: 'Transfer Date', width: 0.3 },
      { header: 'Month', width: 0.35 },
      { header: 'Allocation', width: 0.35, align: 'right' },
    ], allocations.map((item) => [item.transferDate, item.month, formatTaka(item.monthlyAllocation)]));
  }

  addFooters(ctx.pdfDoc, ctx.font);
  return ctx.pdfDoc.save();
}

async function createMonthlyReportPdf(data: MonthlyExportData) {
  const ctx = await createContext();
  drawHeader(ctx, 'Monthly Financial Report', data.monthLabel);

  drawStatTiles(ctx, [
    ['Collected', formatTaka(data.summary.totalCollected)],
    ['Costs', formatTaka(data.summary.totalCosts)],
    ['Net Balance', formatTaka(data.summary.netBalance)],
    ['Fully Paid', `${data.summary.fullyPaidMembers} members`],
  ]);
  ctx.page.drawText(
    `Partially paid: ${data.summary.partiallyPaidMembers}   ·   Unpaid: ${data.summary.unpaidMembers}`,
    { x: MARGIN, y: ctx.y, size: 9, font: ctx.font, color: TEXT_GRAY }
  );
  ctx.y -= 22;

  drawFundActivitySection(ctx, data.fundActivity, data.monthLabel);

  drawSectionTitle(ctx, 'Member Payments This Month');
  drawTable(ctx, MEMBER_PAYMENT_COLUMNS, data.memberPayments.map(memberPaymentRowToCells));

  drawSectionTitle(ctx, `Transactions (${data.transfers.length})`);
  drawTable(ctx, TRANSFER_COLUMNS, data.transfers.map((t) => transferRowToCells(t, true)));

  drawSectionTitle(ctx, `Costs (${data.costs.length})`);
  drawTable(ctx, COST_COLUMNS, data.costs.map(costRowToCells));

  addFooters(ctx.pdfDoc, ctx.font);
  return ctx.pdfDoc.save();
}

async function createYearlyReportPdf(data: YearlyExportData) {
  const ctx = await createContext();
  drawHeader(ctx, 'Annual Financial Report', String(data.year));

  drawStatTiles(ctx, [
    ['Expected', formatTaka(data.globalSummary.totals.expected)],
    ['Collected', formatTaka(data.globalSummary.totals.collected)],
    ['Costs', formatTaka(data.globalSummary.totals.costs)],
    ['Net Amount', formatTaka(data.globalSummary.totals.netAmount)],
  ]);

  drawSectionTitle(ctx, 'Monthly Breakdown');
  drawTable(
    ctx,
    [
      { header: 'Month', width: 0.25 },
      { header: 'Collected', width: 0.25, align: 'right' },
      { header: 'Costs', width: 0.25, align: 'right' },
      { header: 'Net', width: 0.25, align: 'right' },
    ],
    data.monthlySummaries.map((m) => [m.month, formatTaka(m.totalCollected), formatTaka(m.totalCosts), formatTaka(m.netBalance)])
  );

  drawFundActivitySection(ctx, data.fundActivity, String(data.year));

  drawSectionTitle(ctx, 'Member Shares');
  drawTable(ctx, MEMBER_SHARE_COLUMNS, data.memberShares.map(memberShareRowToCells));
  drawShareFootnote(ctx, data.fundActivity.activeMemberCount);

  drawSectionTitle(ctx, `Transactions (${data.transfers.length})`);
  drawTable(ctx, TRANSFER_COLUMNS, data.transfers.map((t) => transferRowToCells(t, true)));

  drawSectionTitle(ctx, `Costs (${data.costs.length})`);
  drawTable(ctx, COST_COLUMNS, data.costs.map(costRowToCells));

  addFooters(ctx.pdfDoc, ctx.font);
  return ctx.pdfDoc.save();
}

/**
 * The "should not contain so many numbers that can confuse" layout: headline
 * totals, then one row per member (name + amount, nothing else).
 */
async function createRangeStatementPdf(data: RangeExportData) {
  const ctx = await createContext();
  drawHeader(ctx, 'Fund Statement', data.periodLabel);

  drawStatTiles(ctx, [
    ['Total Deposits', formatTaka(data.totalDeposits)],
    ['Total Expenses', formatTaka(data.totalExpenses)],
    ['Net Balance', formatTaka(data.netBalance)],
  ]);

  drawFundActivitySection(ctx, data.fundActivity, data.periodLabel);

  drawSectionTitle(ctx, 'Member Shares');
  drawTable(ctx, MEMBER_SHARE_COLUMNS, data.members.map(memberShareRowToCells));
  const { totalContribution, totalShare } = sumMemberShares(data.members);
  drawTotalRow(ctx, MEMBER_SHARE_COLUMNS, ['Total', formatTaka(totalContribution), formatTaka(totalShare)]);
  drawShareFootnote(ctx, data.fundActivity.activeMemberCount);

  addFooters(ctx.pdfDoc, ctx.font);
  return ctx.pdfDoc.save();
}

export async function createPdfBuffer(data: ExportData) {
  if (data.scope === 'member') return createMemberReportPdf(data);
  if (data.scope === 'monthly') return createMonthlyReportPdf(data);
  if (data.scope === 'yearly') return createYearlyReportPdf(data);
  return createRangeStatementPdf(data);
}

function fundActivitySheetRow(activity: FundActivity) {
  return {
    bankCharges: activity.bankCharges,
    operationalCost: activity.operationalCosts,
    bankInterest: activity.interest,
    bankInterestTreatment: 'Pooled; excluded from member shares',
    netInvested: activity.investedOut,
    investmentPrincipalBack: activity.investmentPrincipalBack,
    investmentReturn: activity.investmentReturns,
    activeMemberCount: activity.activeMemberCount,
  };
}

export function createExcelBuffer(data: ExportData) {
  const workbook = XLSX.utils.book_new();

  if (data.scope === 'member') {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([
        {
          memberName: data.user.name,
          email: data.user.email,
          role: data.user.role,
          period: data.periodLabel,
          verifiedMonthly: data.totals.verifiedMonthly,
          verifiedFlex: data.totals.verifiedFlex,
          verifiedTotal: data.totals.verifiedTotal,
          perMemberShare: data.perMemberShare,
          shareOfFund: data.yourShare,
        },
      ]),
      'Summary'
    );

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([fundActivitySheetRow(data.fundActivity)]), 'Fund Activity');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data.transfers), 'Transfers');
    const allocations = multiMonthAllocations(data.transfers);
    if (allocations.length) XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(allocations), 'Month Allocations');
  }

  if (data.scope === 'monthly') {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([
        {
          month: data.month,
          monthLabel: data.monthLabel,
          totalCollected: data.summary.totalCollected,
          totalMonthly: data.summary.totalMonthly,
          totalFlex: data.summary.totalFlex,
          totalCosts: data.summary.totalCosts,
          netBalance: data.summary.netBalance,
          fullyPaidMembers: data.summary.fullyPaidMembers,
          partiallyPaidMembers: data.summary.partiallyPaidMembers,
          unpaidMembers: data.summary.unpaidMembers,
        },
      ]),
      'Summary'
    );

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([fundActivitySheetRow(data.fundActivity)]), 'Fund Activity');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data.memberPayments), 'Member Payments');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data.transfers), 'Transactions');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data.costs), 'Costs');
  }

  if (data.scope === 'yearly') {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([
        {
          year: data.year,
          expected: data.globalSummary.totals.expected,
          collected: data.globalSummary.totals.collected,
          remaining: data.globalSummary.totals.remaining,
          costs: data.globalSummary.totals.costs,
          netAmount: data.globalSummary.totals.netAmount,
          totalMembers: data.globalSummary.config.totalMembers,
        },
      ]),
      'Global Summary'
    );

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([fundActivitySheetRow(data.fundActivity)]), 'Fund Activity');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data.monthlySummaries), 'Monthly Summaries');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data.transfers), 'Transactions');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data.costs), 'Costs');
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(data.memberShares.map((m) => ({ member: m.name, contribution: m.contribution, shareOfFund: m.fundShare }))),
      'Member Shares'
    );
  }

  if (data.scope === 'range') {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([
        {
          period: data.periodLabel,
          totalDeposits: data.totalDeposits,
          totalExpenses: data.totalExpenses,
          netBalance: data.netBalance,
        },
      ]),
      'Summary'
    );

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([fundActivitySheetRow(data.fundActivity)]), 'Fund Activity');
    const { totalContribution, totalShare } = sumMemberShares(data.members);
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([
        ...data.members.map((member) => ({ member: member.name, contribution: member.contribution, shareOfFund: member.fundShare })),
        { member: 'Total', contribution: totalContribution, shareOfFund: totalShare },
      ]),
      'Member Shares'
    );
  }

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

export function buildExportFileName(
  scope: ExportScope,
  extension: 'pdf' | 'xlsx',
  options: { year?: number; month?: string; memberName?: string; startPeriod?: string; endPeriod?: string }
) {
  if (scope === 'member') {
    const name = (options.memberName || 'member-report').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return `${name}-statement.${extension}`;
  }

  if (scope === 'monthly') {
    return `monthly-report-${options.month || 'report'}.${extension}`;
  }

  if (scope === 'range') {
    return `statement-${options.startPeriod || 'start'}-to-${options.endPeriod || 'end'}.${extension}`;
  }

  return `yearly-report-${options.year || new Date().getFullYear()}.${extension}`;
}
