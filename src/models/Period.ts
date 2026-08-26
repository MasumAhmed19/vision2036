import mongoose, { Document, Model, Schema } from 'mongoose';

export type PeriodStatus = 'OPEN' | 'CLOSED' | 'REOPENED';

export interface IPeriodSnapshot {
    contributionsMonthly: number; // paisa
    contributionsFlex: number;
    interest: number;
    investmentReturns: number;
    bankCharges: number;
    operationalCosts: number;
    investedOut: number;
    investmentPrincipalBack: number;
    cash: number;
    investedAtCost: number;
    fundValue: number;
    membersPaid: number;
    membersPending: number;
    membersUnpaid: number;
}

export interface IPeriod {
    month: string; // 'YYYY-MM', unique
    status: PeriodStatus;

    closedBy?: mongoose.Types.ObjectId | string;
    closedAt?: Date;
    reopenedBy?: mongoose.Types.ObjectId | string;
    reopenedAt?: Date;
    reopenReason?: string;

    // Frozen at close time — never recomputed. This is what makes a closed
    // month's reported numbers a permanent fact rather than a query re-run
    // against data that keeps changing (newDesign.md §4.5).
    snapshot?: IPeriodSnapshot;

    createdAt: Date;
    updatedAt: Date;
}

export type IPeriodDocument = IPeriod & Document;
export interface IPeriodModel extends Model<IPeriodDocument> {
    getStatus(month: string): Promise<PeriodStatus>;
}

const PeriodSnapshotSchema = new Schema<IPeriodSnapshot>(
    {
        contributionsMonthly: { type: Number, default: 0 },
        contributionsFlex: { type: Number, default: 0 },
        interest: { type: Number, default: 0 },
        investmentReturns: { type: Number, default: 0 },
        bankCharges: { type: Number, default: 0 },
        operationalCosts: { type: Number, default: 0 },
        investedOut: { type: Number, default: 0 },
        investmentPrincipalBack: { type: Number, default: 0 },
        cash: { type: Number, default: 0 },
        investedAtCost: { type: Number, default: 0 },
        fundValue: { type: Number, default: 0 },
        membersPaid: { type: Number, default: 0 },
        membersPending: { type: Number, default: 0 },
        membersUnpaid: { type: Number, default: 0 },
    },
    { _id: false }
);

const PeriodSchema = new Schema<IPeriodDocument>(
    {
        month: { type: String, required: true, unique: true },
        status: { type: String, enum: ['OPEN', 'CLOSED', 'REOPENED'], default: 'OPEN' },

        closedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        closedAt: { type: Date },
        reopenedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        reopenedAt: { type: Date },
        reopenReason: { type: String, trim: true },

        snapshot: { type: PeriodSnapshotSchema },
    },
    { timestamps: true }
);

PeriodSchema.statics.getStatus = async function (month: string): Promise<PeriodStatus> {
    const period = await this.findOne({ month }).select('status').lean();
    return (period?.status as PeriodStatus) ?? 'OPEN';
};

const Period: IPeriodModel =
    (mongoose.models.Period as IPeriodModel) ||
    mongoose.model<IPeriodDocument, IPeriodModel>('Period', PeriodSchema);

export default Period;
