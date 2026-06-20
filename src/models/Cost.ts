import mongoose, { Document, Model, Schema } from 'mongoose';

export type CostCategory = 'bank_charge' | 'operational' | 'investment' |'other';

export interface ICost {
  amount: number;
  date: Date;
  reason: string;
  category: CostCategory;
  submittedBy: mongoose.Types.ObjectId | string;
  approvedBy?: mongoose.Types.ObjectId | string;
  receiptImage?: string;
  receiptImagePublicId?: string;
  syncedToSheet: boolean;
  syncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICostDocument extends Omit<ICost, ''>, Document {}
export interface ICostModel extends Model<ICostDocument> {}

const CostSchema = new Schema<ICostDocument>(
  {
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    date: {
      type: Date,
      required: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    category: {
      type: String,
      enum: ['bank_charge', 'investment' ,'operational', 'other'],
      required: true,
      default: 'other',
    },
    submittedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    receiptImage: {
      type: String,
    },
    receiptImagePublicId: {
      type: String,
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

CostSchema.index({ date: -1, category: 1 });
CostSchema.index({ syncedToSheet: 1, date: -1 });

const Cost = (mongoose.models.Cost as ICostModel) || mongoose.model<ICostDocument, ICostModel>('Cost', CostSchema);

export default Cost;
