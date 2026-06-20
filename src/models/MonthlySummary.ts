import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IMonthlySummary {
  month: string;
  year: number;
  totalCollected: number;
  totalMonthly: number;
  totalFlex: number;
  totalCosts: number;
  netBalance: number;
  fullyPaidMembers: number;
  partiallyPaidMembers: number;
  unpaidMembers: number;
  generatedAt: Date;
  syncedToSheet: boolean;
  syncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMonthlySummaryDocument extends Omit<IMonthlySummary, ''>, Document {}
export interface IMonthlySummaryModel extends Model<IMonthlySummaryDocument> {}

const MonthlySummarySchema = new Schema<IMonthlySummaryDocument>(
  {
    month: {
      type: String,
      required: true,
      unique: true,
    },
    year: {
      type: Number,
      required: true,
      index: true,
    },
    totalCollected: {
      type: Number,
      required: true,
      default: 0,
    },
    totalMonthly: {
      type: Number,
      required: true,
      default: 0,
    },
    totalFlex: {
      type: Number,
      required: true,
      default: 0,
    },
    totalCosts: {
      type: Number,
      required: true,
      default: 0,
    },
    netBalance: {
      type: Number,
      required: true,
      default: 0,
    },
    fullyPaidMembers: {
      type: Number,
      required: true,
      default: 0,
    },
    partiallyPaidMembers: {
      type: Number,
      required: true,
      default: 0,
    },
    unpaidMembers: {
      type: Number,
      required: true,
      default: 0,
    },
    generatedAt: {
      type: Date,
      required: true,
      default: Date.now,
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

MonthlySummarySchema.index({ year: 1, month: 1 });

const MonthlySummary =
  (mongoose.models.MonthlySummary as IMonthlySummaryModel) ||
  mongoose.model<IMonthlySummaryDocument, IMonthlySummaryModel>('MonthlySummary', MonthlySummarySchema);

export default MonthlySummary;
