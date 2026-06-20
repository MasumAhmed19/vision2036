/**
 * Seed Script — Real Transfers January–February 2026
 *
 * Seeds actual deposits based on manual records.
 *
 * Rules:
 *  - Monthly required: 3000 BDT
 *  - If deposit > 3000 → flexAmount = deposit - 3000
 *  - Channel: BANK_TRANSFER
 *  - Payment proof: empty
 *  - Status: VERIFIED
 *
 * Usage:
 *   npx ts-node --project tsconfig.json scripts/seedTransfers2026.ts
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
loadEnv({ path: resolve(__dirname, "../.env.local") });

import mongoose from "mongoose";
import { google } from "googleapis";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI missing");
}

/* ─────────────────────────────────────────────── */
/* Real deposit data                              */
/* ─────────────────────────────────────────────── */

const TRANSFERS_2026: Record<string, Record<string, number>> = {
  "2026-01": {
    "fearless.alamin@gmail.com": 4000,
    "amdad.shanto003217@gmail.com": 3000,
    "ai2925751@gmail.com": 4000,
    "siam.khan02000@gmail.com": 3000,
    "mehedi201002255@gmail.com": 3000,
    "rakibalimran2@gmail.com": 3000,
    "sakibrayhan001.sr@gmail.com": 4000,
    "smahmud2866@gmail.com": 3000,
  },

  "2026-02": {
    "fearless.alamin@gmail.com": 4000,
    "mehedi201002255@gmail.com": 3000,
    "amdad.shanto003217@gmail.com": 3000,
    "siam.khan02000@gmail.com": 3000,
    "ai2925751@gmail.com": 4000,
    "rakibalimran2@gmail.com": 3000,
    "sakibrayhan001.sr@gmail.com": 4000,
    "smahmud2866@gmail.com": 3000,
  },
};

/* ─────────────────────────────────────────────── */
/* Schemas                                        */
/* ─────────────────────────────────────────────── */

const UserSchema = new mongoose.Schema({
  name: String,
  email: String,
  role: String,
  isActive: Boolean,
});

const TransferSchema = new mongoose.Schema({
  initiator: mongoose.Schema.Types.ObjectId,
  transferDate: Date,
  selectMonth: String,
  transferChannel: String,
  monthlyAmount: Number,
  flexAmount: Number,
  totalAmount: Number,
  paymentProofUrl: { type: String, default: null },
  status: String,
  verifiedById: mongoose.Schema.Types.ObjectId,
  verifiedAt: Date,
  remarks: String,
  syncedToSheet: { type: Boolean, default: false },
  syncedAt: { type: Date, default: null },
});

const MonthlySummarySchema = new mongoose.Schema({
  month: String,
  year: Number,
  totalCollected: Number,
  totalMonthly: Number,
  totalFlex: Number,
  fullyPaidMembers: Number,
  partiallyPaidMembers: Number,
  unpaidMembers: Number,
});

/* ─────────────────────────────────────────────── */
/* Monthly summary rebuild                        */
/* ─────────────────────────────────────────────── */

async function rebuildMonthlySummary(
  monthIso: string,
  TransferModel: mongoose.Model<any>,
  MonthlySummaryModel: mongoose.Model<any>,
  totalMembers: number
) {
  const transfers = await TransferModel.find({
    status: "VERIFIED",
    selectMonth: monthIso,
  });

  let totalMonthly = 0;
  let totalFlex = 0;

  const memberTotals = new Map<string, number>();

  for (const t of transfers) {
    totalMonthly += t.monthlyAmount || 0;
    totalFlex += t.flexAmount || 0;

    const key = String(t.initiator);
    memberTotals.set(key, (memberTotals.get(key) || 0) + t.monthlyAmount);
  }

  let fullyPaid = 0;
  let partial = 0;

  for (const amount of memberTotals.values()) {
    if (amount >= 3000) fullyPaid++;
    else if (amount > 0) partial++;
  }

  const unpaid = Math.max(totalMembers - fullyPaid - partial, 0);

  await MonthlySummaryModel.findOneAndUpdate(
    { month: monthIso },
    {
      month: monthIso,
      year: Number(monthIso.split("-")[0]),
      totalCollected: totalMonthly + totalFlex,
      totalMonthly,
      totalFlex,
      fullyPaidMembers: fullyPaid,
      partiallyPaidMembers: partial,
      unpaidMembers: unpaid,
    },
    { upsert: true }
  );
}

/* ─────────────────────────────────────────────── */
/* Main Seed                                      */
/* ─────────────────────────────────────────────── */

async function seed() {
  console.log("\nVision2036 — Seeding Jan–Feb 2026\n");

  try {
    await mongoose.connect(MONGODB_URI!, { dbName: "vision2036" });

    const UserModel =
      mongoose.models.User || mongoose.model("User", UserSchema);

    const TransferModel =
      mongoose.models.Transfer || mongoose.model("Transfer", TransferSchema);

    const MonthlySummaryModel =
      mongoose.models.MonthlySummary ||
      mongoose.model("MonthlySummary", MonthlySummarySchema);

    const admin = await UserModel.findOne({ role: "admin", isActive: true });

    if (!admin) throw new Error("Admin not found");

    const members = await UserModel.find({ isActive: true });

    let created = 0;
    let skipped = 0;

    for (const month of Object.keys(TRANSFERS_2026)) {
      console.log(`\n── ${month} ──`);

      const payments = TRANSFERS_2026[month];

      const [yr, mo] = month.split("-").map(Number);

      const transferDate = new Date(Date.UTC(yr, mo - 1, 1));

      for (const email of Object.keys(payments)) {
        const member = await UserModel.findOne({ email });

        if (!member) {
          console.log(`⚠ user missing ${email}`);
          continue;
        }

        const deposited = payments[email];

        const existing = await TransferModel.findOne({
          initiator: member._id,
          selectMonth: month,
          status: "VERIFIED",
        });

        if (existing) {
          console.log(`⚠ skipped ${member.name}`);
          skipped++;
          continue;
        }

        const monthlyAmount = Math.min(deposited, 3000);
        const flexAmount = Math.max(deposited - 3000, 0);

        await TransferModel.create({
          initiator: member._id,
          transferDate,
          selectMonth: month,
          transferChannel: "BANK_TRANSFER",
          monthlyAmount,
          flexAmount,
          totalAmount: deposited,
          status: "VERIFIED",
          verifiedById: admin._id,
          verifiedAt: transferDate,
          remarks: "Seeded real deposit (2026)",
        });

        console.log(
          `✓ ${member.name} → monthly ${monthlyAmount} flex ${flexAmount}`
        );

        created++;
      }

      await rebuildMonthlySummary(
        month,
        TransferModel,
        MonthlySummaryModel,
        members.length
      );
    }

    console.log("\nCompleted");
    console.log("Created:", created);
    console.log("Skipped:", skipped);
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

seed();