import mongoose, { Document, Model, Schema } from 'mongoose';

export type InvestmentKind = 'FDR' | 'DPS' | 'SHARE' | 'BOND' | 'PROPERTY' | 'BUSINESS' | 'OTHER';
export type InvestmentStatus = 'PROPOSED' | 'ACTIVE' | 'MATURED' | 'EXITED' | 'WRITTEN_OFF';

export interface IInvestment {
    name: string;
    kind: InvestmentKind;
    status: InvestmentStatus;

    // paisa — kept as running totals here for quick display, but the ledger
    // (LedgerEntry rows with this investment's id) remains the source of
    // truth; these are denormalized, not authoritative.
    principal: number;
    realisedReturn: number;

    expectedRatePct?: number;
    startDate?: Date;
    maturityDate?: Date;

    currentValue?: number; // paisa — a manual mark, conservative: counts at cost until someone values it
    valuedAt?: Date;
    valuedBy?: mongoose.Types.ObjectId | string;

    proposedBy: mongoose.Types.ObjectId | string;
    notes?: string;

    createdAt: Date;
    updatedAt: Date;
}

export type IInvestmentDocument = IInvestment & Document;
export type IInvestmentModel = Model<IInvestmentDocument>;

const InvestmentSchema = new Schema<IInvestmentDocument>(
    {
        name: { type: String, required: true, trim: true, maxlength: 200 },
        kind: {
            type: String,
            enum: ['FDR', 'DPS', 'SHARE', 'BOND', 'PROPERTY', 'BUSINESS', 'OTHER'],
            required: true,
        },
        status: {
            type: String,
            enum: ['PROPOSED', 'ACTIVE', 'MATURED', 'EXITED', 'WRITTEN_OFF'],
            default: 'PROPOSED',
        },

        principal: { type: Number, default: 0, min: 0 },
        realisedReturn: { type: Number, default: 0, min: 0 },

        expectedRatePct: { type: Number, min: 0 },
        startDate: { type: Date },
        maturityDate: { type: Date },

        currentValue: { type: Number, min: 0 },
        valuedAt: { type: Date },
        valuedBy: { type: Schema.Types.ObjectId, ref: 'User' },

        proposedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        notes: { type: String, trim: true, maxlength: 2000 },
    },
    { timestamps: true }
);

InvestmentSchema.index({ status: 1 });

const Investment: IInvestmentModel =
    (mongoose.models.Investment as IInvestmentModel) ||
    mongoose.model<IInvestmentDocument, IInvestmentModel>('Investment', InvestmentSchema);

export default Investment;
