import mongoose, { Document, Model, Schema } from 'mongoose';

/**
 * Versioned, time-ranged policy — replaces the hardcoded constant in
 * src/lib/policies.ts for anything Phase 2's approval flow needs (the
 * legacy contribution-policy constants stay in policies.ts, untouched, and
 * are not migrated here yet — this model exists for the new approval
 * thresholds only, to avoid a bigger, riskier migration of code that
 * already works and isn't part of this phase's scope).
 */
export interface IPolicy {
    effectiveFrom: string; // 'YYYY-MM' — applies from this month onward
    effectiveTo?: string; // undefined = still current

    // Approval thresholds, in paisa
    dualApprovalAbove: number;
    investmentRequiresAdmin: boolean;

    createdBy: mongoose.Types.ObjectId | string;
    createdAt: Date;
}

export interface IPolicyDocument extends IPolicy, Document { }
export interface IPolicyModel extends Model<IPolicyDocument> {
    getCurrent(): Promise<IPolicyDocument | null>;
}

const PolicySchema = new Schema<IPolicyDocument>(
    {
        effectiveFrom: { type: String, required: true },
        effectiveTo: { type: String },

        dualApprovalAbove: { type: Number, required: true, min: 0 },
        investmentRequiresAdmin: { type: Boolean, default: true },

        createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);

PolicySchema.index({ effectiveFrom: -1 });

// The current policy is whichever has no effectiveTo (or the most recent by
// effectiveFrom if more than one is somehow open — shouldn't happen in
// practice since policy changes should close the prior one out).
PolicySchema.statics.getCurrent = function () {
    return this.findOne({ effectiveTo: { $exists: false } }).sort({ effectiveFrom: -1 });
};

const Policy: IPolicyModel =
    (mongoose.models.Policy as IPolicyModel) ||
    mongoose.model<IPolicyDocument, IPolicyModel>('Policy', PolicySchema);

export default Policy;
