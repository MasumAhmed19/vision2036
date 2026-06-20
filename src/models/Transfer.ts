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
// Note: Uniqueness per (initiator, selectMonth, paymentType) is enforced at the application level
// in route.ts to allow both a monthly AND a flex-only payment to coexist for the same month.
TransferSchema.index({ initiator: 1, selectMonth: 1 }); // non-unique, for query performance
TransferSchema.index({ status: 1 });
TransferSchema.index({ transferChannel: 1, status: 1 });
TransferSchema.index({ selectMonth: 1, status: 1 });

const Transfer = (mongoose.models.Transfer as ITransferModel) ||
    mongoose.model<ITransferDocument, ITransferModel>('Transfer', TransferSchema);

export default Transfer;
