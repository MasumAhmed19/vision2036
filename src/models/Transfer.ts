import mongoose, { Document, Model, Schema } from 'mongoose';
import type { TransferStatus, TransferChannel } from '@/types';

export interface ITransfer {
    initiator: mongoose.Types.ObjectId | string;
    transferDate: Date;
    accountName?: string;
    accountNumber?: string;
    bankName?: string;
    selectMonth: string; // ISO format e.g: 2026-07
    transferChannel: TransferChannel;
    monthlyAmount: number;
    flexAmount: number;
    // 'monthly' whenever monthlyAmount > 0 (including a combined "pay both"
    // submission), 'flex' only for a flex-only submission with no monthly
    // component — mirrors the two duplicate checks route.ts already applies,
    // now enforced by a real unique index instead of a racy findOne/create.
    // Optional at the schema level so legacy rows (pre-migration) can still
    // be saved; every new transfer always sets it.
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
    createdAt: Date;
    updatedAt: Date;
}

export interface ITransferDocument extends Omit<ITransfer, ''>, Document { }

export interface ITransferModel extends Model<ITransferDocument> { }

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

// Real, DB-enforced duplicate-payment guard (replaces the old findOne/create
// race in route.ts, which could never actually violate a unique index because
// none existed). `paymentType: { $exists: true }` excludes legacy rows from
// before the backfill migration ran, so this index doesn't block saves on
// data that hasn't been migrated yet — see scripts/backfill-transfer-payment-type.ts.
TransferSchema.index(
    { initiator: 1, selectMonth: 1, paymentType: 1 },
    {
        unique: true,
        partialFilterExpression: {
            status: { $ne: 'REJECTED' },
            paymentType: { $exists: true },
        },
    }
);

const Transfer = (mongoose.models.Transfer as ITransferModel) ||
    mongoose.model<ITransferDocument, ITransferModel>('Transfer', TransferSchema);

export default Transfer;
