import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import * as XLSX from 'xlsx';
import connectDB from '@/lib/mongoose';
import Transfer from '@/models/Transfer';
import Cost from '@/models/Cost';
import User from '@/models/User';
import MonthlySummary from '@/models/MonthlySummary';
import { buildGlobalSummary, buildUserYearlySummary, rebuildMonthlySummaryForMonth } from '@/lib/summary-engine';
import { formatMonthLabel, getMonthRange } from '@/lib/policies';
import { getMemberContributionsInRange, getRangeAggregate } from '@/lib/ledger';
import { fromPaisa } from '@/lib/money';

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

export type MemberExportData = {
  scope: 'member';
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  year: number;
  summary: Awaited<ReturnType<typeof buildUserYearlySummary>>;
  transfers: ExportTransferRow[];
  totals: {
    totalTransfers: number;
    verifiedMonthly: number;
    verifiedFlex: number;
    verifiedTotal: number;
  };
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
  members: Array<{ name: string; totalPaid: number }>; // Taka, sorted by name
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
    month: transfer.selectMonth,
    channel: transfer.transferChannel,
    monthlyAmount: transfer.monthlyAmount || 0,
    flexAmount: transfer.flexAmount || 0,
    totalAmount: transfer.totalAmount || 0,
    status: transfer.status,
    verifiedBy: transfer.verifiedById?.name || '',
    verifiedAt: formatDate(transfer.verifiedAt),
    note: transfer.remarks || transfer.rejectionReason || '',
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

export async function getMemberExportData(userId: string, year: number): Promise<MemberExportData> {
  await connectDB();

  const user = await User.findById(userId).select('_id name email role');
  if (!user) {
    throw new Error('User not found');
  }

  const transfers = await Transfer.find({
    initiator: userId,
    transferDate: {
      $gte: new Date(Date.UTC(year, 0, 1)),
      $lt: new Date(Date.UTC(year + 1, 0, 1)),
    },
  })
    .sort({ transferDate: -1, createdAt: -1 })
    .populate('initiator', 'name email')
    .populate('verifiedById', 'name email');

  const summary = await buildUserYearlySummary(userId, year);

  const rows = transfers.map(mapTransferRow);

  return {
    scope: 'member',
    user: {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
    },
    year,
    summary,
    transfers: rows,
    totals: {
      totalTransfers: rows.length,
      verifiedMonthly: summary.monthly.paid,
      verifiedFlex: summary.flexible.paid,
      verifiedTotal: summary.total.paid,
    },
  };
}

export async function getMonthlyExportData(month: string): Promise<MonthlyExportData> {
  await connectDB();

  const summaryDocument = await rebuildMonthlySummaryForMonth(month);
  if (!summaryDocument) {
    throw new Error('Failed to build monthly summary');
  }
  const { start, end } = getMonthRange(month);

  const [transfers, costs] = await Promise.all([
    Transfer.find({ selectMonth: month })
      .sort({ transferDate: -1, createdAt: -1 })
      .populate('initiator', 'name email')
      .populate('verifiedById', 'name email'),
    Cost.find({ date: { $gte: start, $lt: end } })
      .sort({ date: -1, createdAt: -1 })
      .populate('submittedBy', 'name email')
      .populate('approvedBy', 'name email'),
  ]);

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
    transfers: transfers.map(mapTransferRow),
    costs: costs.map(mapCostRow),
  };
}

export async function getYearlyExportData(year: number): Promise<YearlyExportData> {
  await connectDB();

  const [globalSummary, monthlySummaries, transfers, costs] = await Promise.all([
    buildGlobalSummary(year),
    MonthlySummary.find({ year }).sort({ month: 1 }),
    Transfer.find({
      transferDate: {
        $gte: new Date(Date.UTC(year, 0, 1)),
        $lt: new Date(Date.UTC(year + 1, 0, 1)),
      },
    })
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
    transfers: transfers.map(mapTransferRow),
    costs: costs.map(mapCostRow),
  };
}

export async function getRangeExportData(startPeriod: string, endPeriod: string): Promise<RangeExportData> {
  await connectDB();

  const [aggregate, contributions, members] = await Promise.all([
    getRangeAggregate(startPeriod, endPeriod),
    getMemberContributionsInRange(startPeriod, endPeriod),
    User.find({ isActive: true }).select('_id name').sort({ name: 1 }),
  ]);

  const paidByMember = new Map(contributions.map((c) => [c.memberId, c.monthlyPaid + c.flexiblePaid]));

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
    members: members.map((member) => ({
      name: member.name,
      totalPaid: fromPaisa(paidByMember.get(String(member._id)) || 0),
    })),
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
  const cells = [t.date.slice(0, 10), t.month, formatChannel(t.channel), formatTaka(t.totalAmount), formatStatus(t.status)];
  return includeMember
    ? [t.date.slice(0, 10), t.memberName, t.month, formatChannel(t.channel), formatTaka(t.totalAmount), formatStatus(t.status)]
    : cells;
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

function costRowToCells(c: ExportCostRow): string[] {
  return [c.date.slice(0, 10), formatCategory(c.category), c.reason, formatTaka(c.amount), c.approvedBy || '-'];
}

async function createMemberReportPdf(data: MemberExportData) {
  const ctx = await createContext();
  drawHeader(ctx, 'Member Contribution Statement', `${data.user.name} · ${data.year}`);

  drawStatTiles(ctx, [
    ['Monthly Paid', formatTaka(data.totals.verifiedMonthly)],
    ['Flexible Paid', formatTaka(data.totals.verifiedFlex)],
    ['Total Paid', formatTaka(data.totals.verifiedTotal)],
    ['Completion', `${data.summary.total.completionPercentage}%`],
  ]);

  drawSectionTitle(ctx, 'Transfer History');
  drawTable(ctx, TRANSFER_COLUMNS.filter((c) => c.header !== 'Member'), data.transfers.map((t) => transferRowToCells(t, false)));

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

  drawSectionTitle(ctx, 'Member Summaries');
  drawTable(
    ctx,
    [
      { header: 'Member', width: 0.34 },
      { header: 'Monthly Paid', width: 0.22, align: 'right' },
      { header: 'Flexible Paid', width: 0.22, align: 'right' },
      { header: 'Completion', width: 0.22, align: 'right' },
    ],
    data.globalSummary.userSummaries.map((u) => [
      u.userName,
      formatTaka(u.monthlyPaid),
      formatTaka(u.flexiblePaid),
      `${u.completionPercentage}%`,
    ])
  );

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

  drawSectionTitle(ctx, 'Member Contributions');
  drawTable(
    ctx,
    [
      { header: 'Member', width: 0.7 },
      { header: 'Total Paid', width: 0.3, align: 'right' },
    ],
    data.members.map((m) => [m.name, formatTaka(m.totalPaid)])
  );

  addFooters(ctx.pdfDoc, ctx.font);
  return ctx.pdfDoc.save();
}

export async function createPdfBuffer(data: ExportData) {
  if (data.scope === 'member') return createMemberReportPdf(data);
  if (data.scope === 'monthly') return createMonthlyReportPdf(data);
  if (data.scope === 'yearly') return createYearlyReportPdf(data);
  return createRangeStatementPdf(data);
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
          year: data.year,
          verifiedMonthly: data.totals.verifiedMonthly,
          verifiedFlex: data.totals.verifiedFlex,
          verifiedTotal: data.totals.verifiedTotal,
          remaining: data.summary.total.remaining,
          completionPercentage: data.summary.total.completionPercentage,
        },
      ]),
      'Summary'
    );

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data.transfers), 'Transfers');
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

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data.monthlySummaries), 'Monthly Summaries');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data.transfers), 'Transactions');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data.costs), 'Costs');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data.globalSummary.userSummaries), 'Members');
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

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(data.members.map((member) => ({ member: member.name, totalPaid: member.totalPaid }))),
      'Members'
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
    return `${name}-${options.year || new Date().getFullYear()}.${extension}`;
  }

  if (scope === 'monthly') {
    return `monthly-report-${options.month || 'report'}.${extension}`;
  }

  if (scope === 'range') {
    return `statement-${options.startPeriod || 'start'}-to-${options.endPeriod || 'end'}.${extension}`;
  }

  return `yearly-report-${options.year || new Date().getFullYear()}.${extension}`;
}
