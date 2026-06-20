import { google } from 'googleapis';
import type { ITransferDocument } from '@/models/Transfer';
import type { ICostDocument } from '@/models/Cost';
import { formatMonthLabel } from '@/lib/policies';

class GoogleSheetsConfigError extends Error {}

function isGoogleSheetsDebugEnabled() {
  return process.env.GOOGLE_SHEETS_DEBUG === 'true' || process.env.NODE_ENV !== 'production';
}

function maskSpreadsheetId(spreadsheetId: string) {
  if (spreadsheetId.length <= 8) return spreadsheetId;
  return `${spreadsheetId.slice(0, 4)}...${spreadsheetId.slice(-4)}`;
}

function logGoogleSheetsDebug(message: string, details?: Record<string, unknown>) {
  if (!isGoogleSheetsDebugEnabled()) return;

  if (details) {
    console.log('[GoogleSheets]', message, details);
    return;
  }

  console.log('[GoogleSheets]', message);
}

function mapGoogleSheetsError(error: any): Error {
  const status = error?.status || error?.code || error?.response?.status;
  const rawMessage =
    error?.response?.data?.error?.message ||
    error?.message ||
    'Unknown Google Sheets error';

  if (status === 403) {
    return new Error(
      'Google Sheets permission denied. Share the target spreadsheet with the service account email as Editor, make sure the Google Sheets API is enabled for the service account project, and confirm GOOGLE_SHEETS_SPREADSHEET_ID points to that shared sheet.'
    );
  }

  if (status === 404) {
    return new Error(
      'Google Sheets spreadsheet not found. Check GOOGLE_SHEETS_SPREADSHEET_ID and make sure the spreadsheet still exists.'
    );
  }

  if (status === 401) {
    return new Error(
      'Google Sheets authentication failed. Verify GOOGLE_SHEETS_CLIENT_EMAIL and GOOGLE_SHEETS_PRIVATE_KEY for the service account.'
    );
  }

  return new Error(`Google Sheets sync failed: ${rawMessage}`);
}

async function runSheetsOperation<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    throw mapGoogleSheetsError(error);
  }
}

function getGoogleSheetsConfig() {
  const projectId = process.env.GOOGLE_SHEETS_PROJECT_ID;
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

  logGoogleSheetsDebug('Loading Google Sheets config', {
    hasProjectId: !!projectId,
    hasClientEmail: !!clientEmail,
    hasPrivateKey: !!privateKey,
    hasSpreadsheetId: !!spreadsheetId,
    projectId,
    clientEmail,
    spreadsheetId: spreadsheetId ? maskSpreadsheetId(spreadsheetId) : undefined,
  });

  if (!projectId || !clientEmail || !privateKey || !spreadsheetId) {
    throw new GoogleSheetsConfigError(
      'Google Sheets is not configured. Set GOOGLE_SHEETS_PROJECT_ID, GOOGLE_SHEETS_CLIENT_EMAIL, GOOGLE_SHEETS_PRIVATE_KEY, and GOOGLE_SHEETS_SPREADSHEET_ID.'
    );
  }

  return { projectId, clientEmail, privateKey, spreadsheetId };
}

function getSheetsClient() {
  const config = getGoogleSheetsConfig();

  logGoogleSheetsDebug('Creating Google Sheets JWT client', {
    clientEmail: config.clientEmail,
    spreadsheetId: maskSpreadsheetId(config.spreadsheetId),
  });

  const auth = new google.auth.JWT({
    email: config.clientEmail,
    key: config.privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return {
    config,
    sheets: google.sheets({ version: 'v4', auth }),
  };
}

async function ensureSheetExists(sheetName: string, headers: string[]) {
  const { sheets, config } = getSheetsClient();
  logGoogleSheetsDebug('Checking sheet existence', {
    sheetName,
    spreadsheetId: maskSpreadsheetId(config.spreadsheetId),
    headerCount: headers.length,
  });

  const metadata = await runSheetsOperation(() =>
    sheets.spreadsheets.get({ spreadsheetId: config.spreadsheetId })
  );
  const existingSheet = metadata.data.sheets?.find((sheet) => sheet.properties?.title === sheetName);

  logGoogleSheetsDebug('Sheet metadata loaded', {
    sheetName,
    exists: !!existingSheet,
    availableSheets: metadata.data.sheets?.map((sheet) => sheet.properties?.title).filter(Boolean),
  });

  if (!existingSheet) {
    logGoogleSheetsDebug('Creating missing sheet', { sheetName });

    await runSheetsOperation(() =>
      sheets.spreadsheets.batchUpdate({
        spreadsheetId: config.spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: sheetName } } }],
        },
      })
    );

    await runSheetsOperation(() =>
      sheets.spreadsheets.values.update({
        spreadsheetId: config.spreadsheetId,
        range: `${sheetName}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [headers] },
      })
    );

    logGoogleSheetsDebug('Sheet created and header row written', { sheetName });
  }
}

async function appendRows(sheetName: string, rows: (string | number)[][]) {
  const { sheets, config } = getSheetsClient();
  logGoogleSheetsDebug('Appending rows', {
    sheetName,
    rowCount: rows.length,
    firstRowPreview: rows[0]?.slice(0, 4),
    spreadsheetId: maskSpreadsheetId(config.spreadsheetId),
  });

  await runSheetsOperation(() =>
    sheets.spreadsheets.values.append({
      spreadsheetId: config.spreadsheetId,
      range: `${sheetName}!A:Z`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: rows },
    })
  );

  logGoogleSheetsDebug('Rows appended successfully', { sheetName, rowCount: rows.length });
}

function getDepositSheetName(date: Date) {
  return `All Deposits - ${date.getUTCFullYear()}`;
}

function getExpenseSheetName(date: Date) {
  return `All Expenses - ${date.getUTCFullYear()}`;
}

export async function syncTransferToGoogleSheets(
  transfer: ITransferDocument & { initiator?: any; verifiedById?: any },
  verifiedByName?: string
) {
  const transferDate = new Date(transfer.transferDate);
  const sheetName = getDepositSheetName(transferDate);
  const headers = [
    'Date',
    'Member Name',
    'Month',
    'Channel',
    'Monthly Amount',
    'Flex Amount',
    'Total',
    'Payment Proof',
    'Verified By',
    'Verified At',
  ];

  logGoogleSheetsDebug('Starting transfer sync', {
    transferId: String(transfer._id),
    month: transfer.selectMonth,
    memberName: transfer.initiator?.name || 'Unknown Member',
    totalAmount: transfer.totalAmount,
    sheetName,
  });

  await ensureSheetExists(sheetName, headers);

  const row = [
    transferDate.toISOString(),
    transfer.initiator?.name || 'Unknown Member',
    transfer.selectMonth,
    transfer.transferChannel,
    transfer.monthlyAmount,
    transfer.flexAmount,
    transfer.totalAmount,
    transfer.paymentProofUrl || '',
    verifiedByName || transfer.verifiedById?.name || 'Unknown',
    transfer.verifiedAt ? new Date(transfer.verifiedAt).toISOString() : '',
  ];

  await appendRows(sheetName, [row]);

  logGoogleSheetsDebug('Transfer sync completed', {
    transferId: String(transfer._id),
    targetSheets: [sheetName],
  });
}

export async function syncCostToGoogleSheets(cost: ICostDocument & { submittedBy?: any; approvedBy?: any }) {
  const costDate = new Date(cost.date);
  const monthIso = costDate.toISOString().slice(0, 7);
  const sheetName = getExpenseSheetName(costDate);
  const headers = ['Date', 'Month', 'Category', 'Amount', 'Reason', 'Submitted By', 'Approved By'];

  logGoogleSheetsDebug('Starting cost sync', {
    costId: String(cost._id),
    date: costDate.toISOString(),
    category: cost.category,
    amount: cost.amount,
    sheetName,
  });

  await ensureSheetExists(sheetName, headers);

  const row = [
    costDate.toISOString(),
    formatMonthLabel(monthIso),
    cost.category,
    cost.amount,
    cost.reason,
    cost.submittedBy?.name || 'Unknown',
    cost.approvedBy?.name || '',
  ];

  await appendRows(sheetName, [row]);

  logGoogleSheetsDebug('Cost sync completed', {
    costId: String(cost._id),
    targetSheets: [sheetName],
  });
}

export function isGoogleSheetsConfigured() {
  try {
    getGoogleSheetsConfig();
    return true;
  } catch {
    return false;
  }
}

export function isGoogleSheetsConfigError(error: unknown) {
  return error instanceof GoogleSheetsConfigError;
}
