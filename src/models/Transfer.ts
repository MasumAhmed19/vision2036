import mongoose, { Document, Model, Schema } from 'mongoose';
import type { TransferStatus, TransferChannel } from '@/types';

export interface ITransfer {
    initiator: mongoose.Types.ObjectId | string;
    transferDate: Date;
    accountName?: string;
    accountNumber?: string;
    bankName?: string;
    selectMonth: string; // ISO format e.g: 2026-07
    // New multi-month submissions share one ID and one proof. Historical and
    // single-month transfers have no group ID.
    paymentGroupId?: mongoose.Types.ObjectId;
    paymentGroupSize?: number;
    transferChannel: TransferChannel;
    monthlyAmount: number;
    flexAmount: number;
    // 'monthly' whenever monthlyAmount > 0 (including a combined "pay both"
    // submission), 'flex' only for a flex-only submission with no monthly
    // component — mirrors the two duplicate checks route.ts already applies,
    // now enforced by a real unique index instead of a racy findOne/create.
    // Optional at the schema level so legacy rows (pre-migration) can still
    // be saved; every new PENDING/VERIFIED transfer sets it. Unset (via the
    // verify route) the moment a transfer is REJECTED, so a rejected
    // transfer never counts toward the unique index — see the index comment
    // below for why status can't be filtered there directly.
    paymentType?: 'monthly' | 'flex';
    totalAmount: number;
    paymentProofUrl?: string;
    paymentProofPublicId?: string; // Cloudinary ID
    status: TransferStatus;
    remarks?: string;
    rejectionReason?: string;
    verifiedById?: mongoose.Types.ObjectId | string;
    verifiedAt?: Date;
    syncedToSheet: boolean;
    syncedAt?: Date;
    sheetSyncLease?: { token: string; expiresAt: Date };
    createdAt: Date;
    updatedAt: Date;
}

export interface ITransferDocument extends Omit<ITransfer, ''>, Document { }

export interface ITransferModel extends Model<ITransferDocument> { }

// Single source of truth for the monthly/flex classification used by the
// duplicate-check queries, the paymentType assignment on creation, and
// (implicitly) the unique index below — call sites must never re-derive
// this rule independently.
export function classifyTransferPaymentType(monthlyAmount: number): 'monthly' | 'flex' {
    return monthlyAmount > 0 ? 'monthly' : 'flex';
}

const TransferSchema = new Schema<ITransferDocument>(
    {
        initiator: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        transferDate: {
            type: Date,
            required: true,
        },
        accountName: { type: String },
        accountNumber: { type: String },
        bankName: { type: String },
        selectMonth: {
            type: String,
            required: true,
        },
        paymentGroupId: { type: Schema.Types.ObjectId },
        paymentGroupSize: { type: Number, min: 2 },
        transferChannel: {
            type: String,
            enum: ['BANK_TRANSFER', 'BKASH', 'NAGAD', 'ROCKET', 'CASH', 'OTHER'],
            required: true,
        },
        monthlyAmount: {
            type: Number,
            default: 0,
            min: 0,
        },
        flexAmount: {
            type: Number,
            default: 0,
            min: 0,
        },
        paymentType: {
            type: String,
            enum: ['monthly', 'flex'],
        },
        totalAmount: {
            type: Number,
            required: true,
            min: 1,
        },
        paymentProofUrl: {
            type: String,
        },
        paymentProofPublicId: {
            type: String,
        },
        status: {
            type: String,
            enum: ['PENDING', 'VERIFIED', 'REJECTED'],
            default: 'PENDING',
        },
        remarks: {
            type: String,
            trim: true,
        },
        rejectionReason: {
            type: String,
            trim: true,
        },
        verifiedById: {
            type: Schema.Types.ObjectId,
            ref: 'User',
        },
        verifiedAt: {
            type: Date,
        },
        syncedToSheet: {
            type: Boolean,
            default: false,
        },
        syncedAt: {
            type: Date,
        },
        sheetSyncLease: {
            type: new Schema({ token: { type: String, required: true }, expiresAt: { type: Date, required: true } }, { _id: false }),
            default: undefined,
        },
    },
    {
        timestamps: true,
    }
);

// Indexes
TransferSchema.index({ initiator: 1, selectMonth: 1 }); // non-unique, for query performance
TransferSchema.index({ status: 1 });
TransferSchema.index({ transferChannel: 1, status: 1 });
TransferSchema.index({ selectMonth: 1, status: 1 });
TransferSchema.index({ paymentGroupId: 1 }, { sparse: true });

// Real, DB-enforced duplicate-payment guard (replaces the old findOne/create
// race in route.ts, which could never actually violate a unique index because
// none existed).
//
// MongoDB's partialFilterExpression only supports equality, $exists: true,
// $gt/$gte/$lt/$lte, $type, and top-level $and — NOT $ne. So "exclude
// REJECTED transfers" can't be expressed as a status filter here directly.
// Instead, paymentType itself is unset the moment a transfer is REJECTED
// (see the verify route), so `paymentType: { $exists: true }` alone already
// excludes both legacy pre-migration rows AND rejected transfers — letting
// a member resubmit after a rejection without violating this index.
TransferSchema.index(
    { initiator: 1, selectMonth: 1, paymentType: 1 },
    {
        unique: true,
        partialFilterExpression: {
            paymentType: { $exists: true },
        },
    }
);

const Transfer = (mongoose.models.Transfer as ITransferModel) ||
    mongoose.model<ITransferDocument, ITransferModel>('Transfer', TransferSchema);

export default Transfer;
