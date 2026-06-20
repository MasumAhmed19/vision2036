import { PDFDocument, StandardFonts } from 'pdf-lib';
import * as XLSX from 'xlsx';
import connectDB from '@/lib/mongoose';
import Transfer from '@/models/Transfer';
import Cost from '@/models/Cost';
import User from '@/models/User';
import MonthlySummary from '@/models/MonthlySummary';
import { buildGlobalSummary, buildUserYearlySummary, rebuildMonthlySummaryForMonth } from '@/lib/summary-engine';
import { formatMonthLabel, getMonthRange } from '@/lib/policies';

export type ExportScope = 'member' | 'monthly' | 'yearly';

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

export type ExportData = MemberExportData | MonthlyExportData | YearlyExportData;

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

function buildPdfLines(data: ExportData) {
  if (data.scope === 'member') {
    return {
      title: `Member Report - ${data.user.name} (${data.year})`,
      lines: [
        `Member: ${data.user.name} <${data.user.email}>`,
        `Role: ${data.user.role}`,
        `Year: ${data.year}`,
        `Verified Monthly Paid: Tk. ${data.totals.verifiedMonthly.toLocaleString()}`,
        `Verified Flex Paid: Tk. ${data.totals.verifiedFlex.toLocaleString()}`,
        `Verified Total Paid: Tk. ${data.totals.verifiedTotal.toLocaleString()}`,
        `Remaining: Tk. ${data.summary.total.remaining.toLocaleString()}`,
        `Completion: ${data.summary.total.completionPercentage}%`,
        '',
        'Transfers:',
        ...(data.transfers.length
          ? data.transfers.flatMap((transfer) => [
              `${transfer.date} | ${transfer.month} | ${transfer.channel} | Tk. ${transfer.totalAmount.toLocaleString()} | ${transfer.status}`,
              `  Monthly: ${transfer.monthlyAmount} | Flex: ${transfer.flexAmount} | Verified by: ${transfer.verifiedBy || '-'} | Note: ${transfer.note || '-'}`,
            ])
          : ['No transfers found.']),
      ],
    };
  }

  if (data.scope === 'monthly') {
    return {
      title: `Monthly Report - ${data.monthLabel}`,
      lines: [
        `Month: ${data.monthLabel}`,
        `Total Collected: Tk. ${data.summary.totalCollected.toLocaleString()}`,
        `Total Monthly: Tk. ${data.summary.totalMonthly.toLocaleString()}`,
        `Total Flex: Tk. ${data.summary.totalFlex.toLocaleString()}`,
        `Total Costs: Tk. ${data.summary.totalCosts.toLocaleString()}`,
        `Net Balance: Tk. ${data.summary.netBalance.toLocaleString()}`,
        `Members - Full: ${data.summary.fullyPaidMembers}, Partial: ${data.summary.partiallyPaidMembers}, Unpaid: ${data.summary.unpaidMembers}`,
        '',
        'Transactions:',
        ...(data.transfers.length
          ? data.transfers.flatMap((transfer) => [
              `${transfer.date} | ${transfer.memberName} | ${transfer.channel} | Tk. ${transfer.totalAmount.toLocaleString()} | ${transfer.status}`,
              `  Month: ${transfer.month} | Monthly: ${transfer.monthlyAmount} | Flex: ${transfer.flexAmount} | Verified By: ${transfer.verifiedBy || '-'}`,
            ])
          : ['No transactions found.']),
        '',
        'Costs:',
        ...(data.costs.length
          ? data.costs.map((cost) => `${cost.date} | ${cost.category} | Tk. ${cost.amount.toLocaleString()} | ${cost.reason} | Approved By: ${cost.approvedBy || '-'}`)
          : ['No costs found.']),
      ],
    };
  }

  return {
    title: `Yearly Report - ${data.year}`,
    lines: [
      `Year: ${data.year}`,
      `Expected: Tk. ${data.globalSummary.totals.expected.toLocaleString()}`,
      `Collected: Tk. ${data.globalSummary.totals.collected.toLocaleString()}`,
      `Remaining: Tk. ${data.globalSummary.totals.remaining.toLocaleString()}`,
      `Costs: Tk. ${data.globalSummary.totals.costs.toLocaleString()}`,
      `Net Amount: Tk. ${data.globalSummary.totals.netAmount.toLocaleString()}`,
      '',
      'Monthly Summaries:',
      ...(data.monthlySummaries.length
        ? data.monthlySummaries.map((item) => `${item.month} | Collected Tk. ${item.totalCollected.toLocaleString()} | Costs Tk. ${item.totalCosts.toLocaleString()} | Net Tk. ${item.netBalance.toLocaleString()}`)
        : ['No monthly summaries found.']),
      '',
      `Transactions (${data.transfers.length}):`,
      ...(data.transfers.length
        ? data.transfers.flatMap((transfer) => [
            `${transfer.date} | ${transfer.memberName} | ${transfer.month} | ${transfer.channel} | Tk. ${transfer.totalAmount.toLocaleString()} | ${transfer.status}`,
            `  Monthly: ${transfer.monthlyAmount} | Flex: ${transfer.flexAmount} | Verified By: ${transfer.verifiedBy || '-'}`,
          ])
        : ['No transactions found.']),
      '',
      `Costs (${data.costs.length}):`,
      ...(data.costs.length
        ? data.costs.map((cost) => `${cost.date} | ${cost.category} | Tk. ${cost.amount.toLocaleString()} | ${cost.reason} | Submitted By: ${cost.submittedBy}`)
        : ['No costs found.']),
    ],
  };
}

export async function createPdfBuffer(data: ExportData) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const { title, lines } = buildPdfLines(data);

  let page = pdfDoc.addPage([595.28, 841.89]);
  let y = 800;
  const margin = 40;
  const fontSize = 10;
  const lineHeight = 14;
  const maxCharsPerLine = 95;

  const addNewPage = () => {
    page = pdfDoc.addPage([595.28, 841.89]);
    y = 800;
  };

  page.drawText(title, {
    x: margin,
    y,
    size: 16,
    font: boldFont,
  });
  y -= 24;

  page.drawText(`Generated at: ${new Date().toISOString()}`, {
    x: margin,
    y,
    size: fontSize,
    font,
  });
  y -= 22;

  for (const rawLine of lines) {
    const chunks = rawLine.length > maxCharsPerLine
      ? rawLine.match(new RegExp(`.{1,${maxCharsPerLine}}`, 'g')) || ['']
      : [rawLine];

    for (const chunk of chunks) {
      if (y <= 50) {
        addNewPage();
      }

      page.drawText(chunk, {
        x: margin,
        y,
        size: fontSize,
        font,
      });
      y -= lineHeight;
    }
  }

  return pdfDoc.save();
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

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

export function buildExportFileName(scope: ExportScope, extension: 'pdf' | 'xlsx', options: { year?: number; month?: string; memberName?: string }) {
  if (scope === 'member') {
    const name = (options.memberName || 'member-report').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return `${name}-${options.year || new Date().getFullYear()}.${extension}`;
  }

  if (scope === 'monthly') {
    return `monthly-report-${options.month || 'report'}.${extension}`;
  }

  return `yearly-report-${options.year || new Date().getFullYear()}.${extension}`;
}
