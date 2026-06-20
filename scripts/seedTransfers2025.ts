/**
 * Seed Script — Historical Transfers July–December 2025
 *
 * Seeds 6 months of VERIFIED transfers for every active member:
 *   - Monthly amount : 3000 BDT
 *   - Flex amount    : 0
 *   - Months         : 2025-07 → 2025-12  (total 18 000 per member)
 *
 * Also syncs each transfer to Google Sheets (if env vars are present).
 * Also rebuilds MonthlySummary for each affected month.
 *
 * Usage:
 *   npx ts-node --project tsconfig.json scripts/seedTransfers2025.ts
 *   or: npm run seed:2025
 *
 * Requires env vars in .env.local (loaded automatically via dotenv below):
 *   MONGODB_URI
 *   GOOGLE_SHEETS_PROJECT_ID     (optional – skip sheets sync if absent)
 *   GOOGLE_SHEETS_CLIENT_EMAIL   (optional)
 *   GOOGLE_SHEETS_PRIVATE_KEY    (optional)
 *   GOOGLE_SHEETS_SPREADSHEET_ID (optional)
 */

// ─── Load .env.local ──────────────────────────────────────────────────────────
import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
loadEnv({ path: resolve(__dirname, '../.env.local') });

import mongoose from 'mongoose';
import { google } from 'googleapis';

// ─── Config ───────────────────────────────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is required. Set it in .env.local before running this script.');
}

const MONTHS = ['2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12'];
const MONTHLY_AMOUNT = 3000;
const FLEX_AMOUNT = 0;
const TRANSFER_CHANNEL = 'CASH'; // historical — no bank slip
const SEEDER_REMARK = 'Seeded historical data (Jul–Dec 2025)';

// ─── Google Sheets config (optional) ─────────────────────────────────────────
const SHEETS_CONFIG = (() => {
    const projectId = process.env.GOOGLE_SHEETS_PROJECT_ID;
    const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    if (!projectId || !clientEmail || !privateKey || !spreadsheetId) return null;
    return { projectId, clientEmail, privateKey, spreadsheetId };
})();

// ─── Inline Schemas (avoid Next.js module issues in standalone ts-node) ───────
const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['member', 'moderator', 'admin'], default: 'member' },
    isActive: { type: Boolean, default: true },
    joinedAt: { type: Date, default: Date.now },
}, { timestamps: true });

const TransferSchema = new mongoose.Schema({
    initiator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    transferDate: { type: Date, required: true },
    accountName: { type: String },
    accountNumber: { type: String },
    bankName: { type: String },
    selectMonth: { type: String, required: true },
    transferChannel: {
        type: String,
        enum: ['BANK_TRANSFER', 'BKASH', 'NAGAD', 'ROCKET', 'CASH', 'OTHER'],
        required: true,
    },
    monthlyAmount: { type: Number, default: 0 },
    flexAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    paymentProofUrl: { type: String },
    status: { type: String, enum: ['PENDING', 'VERIFIED', 'REJECTED'], default: 'PENDING' },
    remarks: { type: String },
    rejectionReason: { type: String },
    verifiedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verifiedAt: { type: Date },
    syncedToSheet: { type: Boolean, default: false },
    syncedAt: { type: Date },
}, { timestamps: true });

const MonthlySummarySchema = new mongoose.Schema({
    month: { type: String, required: true, unique: true },
    year: { type: Number, required: true },
    totalCollected: { type: Number, required: true, default: 0 },
    totalMonthly: { type: Number, required: true, default: 0 },
    totalFlex: { type: Number, required: true, default: 0 },
    totalCosts: { type: Number, required: true, default: 0 },
    netBalance: { type: Number, required: true, default: 0 },
    fullyPaidMembers: { type: Number, required: true, default: 0 },
    partiallyPaidMembers: { type: Number, required: true, default: 0 },
    unpaidMembers: { type: Number, required: true, default: 0 },
    generatedAt: { type: Date, required: true, default: Date.now },
    syncedToSheet: { type: Boolean, default: false },
    syncedAt: { type: Date },
}, { timestamps: true });

// ─── Google Sheets helpers ────────────────────────────────────────────────────
function getSheetsClient() {
    if (!SHEETS_CONFIG) throw new Error('Google Sheets not configured');
    const auth = new google.auth.JWT({
        email: SHEETS_CONFIG.clientEmail,
        key: SHEETS_CONFIG.privateKey,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    return { sheets: google.sheets({ version: 'v4', auth }), spreadsheetId: SHEETS_CONFIG.spreadsheetId };
}

async function ensureSheetTab(sheetName: string, headers: string[]) {
    const { sheets, spreadsheetId } = getSheetsClient();
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const exists = meta.data.sheets?.some((s) => s.properties?.title === sheetName);
    if (!exists) {
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] },
        });
        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `${sheetName}!A1`,
            valueInputOption: 'RAW',
            requestBody: { values: [headers] },
        });
    }
}

async function appendSheetRows(sheetName: string, rows: (string | number)[][]) {
    const { sheets, spreadsheetId } = getSheetsClient();
    await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetName}!A:Z`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: rows },
    });
}

async function syncTransferToSheets(
    transfer: any,
    memberName: string,
    adminName: string,
) {
    const transferDate = new Date(transfer.transferDate);
    const sheetName = `All Deposits - ${transferDate.getUTCFullYear()}`;
    const headers = [
        'Date', 'Member Name', 'Month', 'Channel',
        'Monthly Amount', 'Flex Amount', 'Total',
        'Payment Proof', 'Verified By', 'Verified At',
    ];

    await ensureSheetTab(sheetName, headers);

    const row = [
        transferDate.toISOString(),
        memberName,
        transfer.selectMonth,
        transfer.transferChannel,
        transfer.monthlyAmount,
        transfer.flexAmount,
        transfer.totalAmount,
        '',               // no proof for historical data
        adminName,
        new Date(transfer.verifiedAt).toISOString(),
    ];

    await appendSheetRows(sheetName, [row]);
}

// ─── Monthly Summary rebuild (inline version of rebuildMonthlySummaryForMonth) ─
async function rebuildMonthlySummary(
    monthIso: string,
    TransferModel: mongoose.Model<any>,
    MonthlySummaryModel: mongoose.Model<any>,
    totalMembers: number,
    monthlyAmountPerMember: number,
) {
    const [year, month] = monthIso.split('-').map(Number);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);

    const transfers = await TransferModel.find({
        status: 'VERIFIED',
        selectMonth: monthIso,
    });

    const memberTotals = new Map<string, number>();
    let totalMonthly = 0;
    let totalFlex = 0;

    for (const t of transfers) {
        const key = String(t.initiator);
        memberTotals.set(key, (memberTotals.get(key) || 0) + (t.monthlyAmount || 0));
        totalMonthly += t.monthlyAmount || 0;
        totalFlex += t.flexAmount || 0;
    }

    let fullyPaid = 0;
    let partiallyPaid = 0;
    for (const paid of memberTotals.values()) {
        if (paid >= monthlyAmountPerMember) fullyPaid++;
        else if (paid > 0) partiallyPaid++;
    }
    const unpaid = Math.max(totalMembers - fullyPaid - partiallyPaid, 0);
    const totalCollected = totalMonthly + totalFlex;

    await MonthlySummaryModel.findOneAndUpdate(
        { month: monthIso },
        {
            month: monthIso,
            year,
            totalCollected,
            totalMonthly,
            totalFlex,
            totalCosts: 0,
            netBalance: totalCollected,
            fullyPaidMembers: fullyPaid,
            partiallyPaidMembers: partiallyPaid,
            unpaidMembers: unpaid,
            generatedAt: new Date(),
        },
        { upsert: true, new: true },
    );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function seed() {
    console.log('\n════════════════════════════════════════════');
    console.log('  Vision2036 — Historical Transfer Seeder');
    console.log('  Months: Jul 2025 → Dec 2025 (6 months)');
    console.log('  Per participant: 3 000 BDT/month × 6 = 18 000');
    console.log('  Participants: all active users (members + admins)');
    console.log('════════════════════════════════════════════\n');

    try {
        await mongoose.connect(MONGODB_URI!, { dbName: 'vision2036' });
        console.log('✓ Connected to MongoDB\n');

        const UserModel = mongoose.models.User || mongoose.model('User', UserSchema);
        const TransferModel = mongoose.models.Transfer || mongoose.model('Transfer', TransferSchema);
        const MonthlySummaryModel = mongoose.models.MonthlySummary || mongoose.model('MonthlySummary', MonthlySummarySchema);

        // Find admin for verifiedById
        const admin = await UserModel.findOne({ role: 'admin', isActive: true }).select('_id name');
        if (!admin) {
            throw new Error('No active admin found. Run npm run seed first.');
        }
        const adminName: string = admin.name || 'Admin';
        console.log(`  Using admin for verification: ${adminName}\n`);

        // Find all active participants — members AND admins are all in the savings plan
        const members = await UserModel.find({ isActive: true }).select('_id name email role');
        if (members.length === 0) {
            throw new Error('No active users found. Run npm run seed first.');
        }
        console.log(`  Found ${members.length} active participants (members + admins)\n`);

        const syncEnabled = !!SHEETS_CONFIG;
        if (syncEnabled) {
            console.log('  Google Sheets: ENABLED ✓');
        } else {
            console.log('  Google Sheets: DISABLED (env vars not set — transfers saved to DB only)');
        }
        console.log();

        let created = 0;
        let skipped = 0;
        let sheetsSynced = 0;

        for (const month of MONTHS) {
            const [yr, mo] = month.split('-').map(Number);
            // Use the 1st of each month as the canonical transfer date
            const transferDate = new Date(Date.UTC(yr, mo - 1, 1));

            console.log(`── ${month} ──`);

            for (const member of members) {
                const memberId = String(member._id);

                // Skip if this exact (member, month) transfer already exists as VERIFIED
                const existing = await TransferModel.findOne({
                    initiator: member._id,
                    selectMonth: month,
                    status: 'VERIFIED',
                });
                if (existing) {
                    console.log(`   ⚠  Skipped (already verified): ${member.name} — ${month}`);
                    skipped++;
                    continue;
                }

                const transfer = await TransferModel.create({
                    initiator: member._id,
                    transferDate,
                    selectMonth: month,
                    transferChannel: TRANSFER_CHANNEL,
                    monthlyAmount: MONTHLY_AMOUNT,
                    flexAmount: FLEX_AMOUNT,
                    totalAmount: MONTHLY_AMOUNT + FLEX_AMOUNT,
                    status: 'VERIFIED',
                    remarks: SEEDER_REMARK,
                    verifiedById: admin._id,
                    verifiedAt: transferDate,
                    syncedToSheet: false,
                });
                created++;

                // Sheets sync
                if (syncEnabled) {
                    try {
                        await syncTransferToSheets(transfer, member.name, adminName);
                        transfer.syncedToSheet = true;
                        transfer.syncedAt = new Date();
                        await transfer.save();
                        sheetsSynced++;
                        console.log(`   ✓  Created + synced : ${member.name}`);
                    } catch (sheetErr: any) {
                        console.log(`   ✓  Created (sheet ✗): ${member.name}  [${sheetErr.message}]`);
                    }
                } else {
                    console.log(`   ✓  Created           : ${member.name}`);
                }
            }

            // Rebuild monthly summary for this month
            await rebuildMonthlySummary(month, TransferModel, MonthlySummaryModel, members.length, MONTHLY_AMOUNT);
            console.log(`   ↻  Monthly summary rebuilt for ${month}\n`);
        }

        console.log('════════════════════════════════════════════');
        console.log(`  Transfers created : ${created}`);
        console.log(`  Transfers skipped : ${skipped}`);
        if (syncEnabled) {
            console.log(`  Sheet rows synced : ${sheetsSynced}`);
        }
        console.log(`  Total per member  : Tk. ${MONTHLY_AMOUNT * MONTHS.length} (${MONTHS.length} × ${MONTHLY_AMOUNT})`);
        console.log('════════════════════════════════════════════\n');

    } catch (error) {
        console.error('\n✗ Seed failed:', error);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('✓ Disconnected from MongoDB\n');
    }
}

seed();
