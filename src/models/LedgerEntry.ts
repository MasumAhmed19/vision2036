import mongoose, { Document, Model, Schema } from 'mongoose';

export type LedgerDirection = 'CREDIT' | 'DEBIT';

export type LedgerEntryType =
    | 'CONTRIBUTION_MONTHLY'
    | 'CONTRIBUTION_FLEX'
    | 'INTEREST_BANK'
    | 'INVESTMENT_RETURN'
    | 'INVESTMENT_PRINCIPAL_BACK'
    | 'BANK_CHARGE'
    | 'OPERATIONAL_COST'
    | 'INVESTMENT_OUT'
    | 'WITHDRAWAL'
    | 'ADJUSTMENT';

export type LedgerEntryStatus = 'DRAFT' | 'PENDING' | 'POSTED' | 'REJECTED' | 'REVERSED';

// Which types affect fund value (cash + invested) vs. only move cash between
// "cash" and "invested at cost" with no net change — see getFundPosition()
// in src/lib/ledger.ts, which is the only place allowed to interpret this.
export const CREDIT_TYPES: LedgerEntryType[] = [
    'CONTRIBUTION_MONTHLY',
    'CONTRIBUTION_FLEX',
    'INTEREST_BANK',
    'INVESTMENT_RETURN',
    'INVESTMENT_PRINCIPAL_BACK',
];
export const DEBIT_TYPES: LedgerEntryType[] = [
    'BANK_CHARGE',
    'OPERATIONAL_COST',
    'INVESTMENT_OUT',
    'WITHDRAWAL',
    'ADJUSTMENT',
];

export interface ILedgerAttachment {
    url: string;
    publicId?: string;
    kind: 'SCREENSHOT' | 'RECEIPT' | 'STATEMENT';
    uploadedAt: Date;
    uploadedBy: mongoose.Types.ObjectId | string;
}

export interface ILedgerApproval {
    by: mongoose.Types.ObjectId | string;
    at: Date;
    note?: string;
}

export interface ILedgerEntry {
    direction: LedgerDirection;
    type: LedgerEntryType;
    status: LedgerEntryStatus;

    // Integer paisa, always positive — direction carries the sign. See src/lib/money.ts.
    amount: number;
    currency: 'BDT';

    memberId?: mongoose.Types.ObjectId | string;
    period: string; // 'YYYY-MM' — the single accounting-month basis (see src/lib/ledger.ts)
    valueDate: Date;

    title: string;
    note?: string;
    channel?: 'BANK' | 'BKASH' | 'NAGAD' | 'ROCKET' | 'CASH' | 'INTERNAL' | 'OTHER';

    attachments: ILedgerAttachment[];

    // Set for INVESTMENT_OUT/INVESTMENT_RETURN/INVESTMENT_PRINCIPAL_BACK
    // entries linked to a specific Investment (Phase 4) — optional so
    // existing/backfilled entries and non-investment types are unaffected.
    investmentId?: mongoose.Types.ObjectId | string;

    reversalOf?: mongoose.Types.ObjectId | string;
    reversedBy?: mongoose.Types.ObjectId | string;

    createdBy: mongoose.Types.ObjectId | string;
    // No two-person approval anymore (see /api/entries POST) — every entry
    // created going forward is `requiredApprovals: 0` with a single
    // self-recorded approval, and posts as POSTED immediately. These fields
    // are kept (not removed) because older entries — backfilled ones, and
    // ones created back when this route did have a PENDING+approve
    // workflow — carry real historical requiredApprovals/approvals data.
    requiredApprovals: number;
    approvals: ILedgerApproval[];
    postedAt?: Date;
    // rejectedBy/At/Reason are likewise historical-only now — nothing
    // created going forward ever reaches REJECTED, since there's no
    // approval step left to reject at.
    rejectedBy?: mongoose.Types.ObjectId | string;
    rejectedAt?: Date;
    rejectionReason?: string;

    // Set only on entries produced by the one-time backfill script (see
    // scripts/backfill-ledger.ts) — never on entries created going forward
    // through /api/entries. Lets the backfill be safely re-run: it skips
    // any Transfer/Cost document it already created an entry for.
    // Field is `sourceType`, not `collection` — `collection` is a reserved
    // Mongoose Document property name and using it as a schema path throws
    // a runtime warning ("may break some functionality").
    source?: {
        sourceType: 'Transfer' | 'Cost';
        id: mongoose.Types.ObjectId | string;
    };

    createdAt: Date;
    updatedAt: Date;
}

export type ILedgerEntryDocument = ILedgerEntry & Document;
export type ILedgerEntryModel = Model<ILedgerEntryDocument>;

const LedgerAttachmentSchema = new Schema<ILedgerAttachment>(
    {
        url: { type: String, required: true },
        publicId: { type: String },
        kind: { type: String, enum: ['SCREENSHOT', 'RECEIPT', 'STATEMENT'], required: true },
        uploadedAt: { type: Date, default: Date.now },
        uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    },
    { _id: false }
);

const LedgerApprovalSchema = new Schema<ILedgerApproval>(
    {
        by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        at: { type: Date, default: Date.now },
        note: { type: String, trim: true },
    },
    { _id: false }
);

const LedgerEntrySchema = new Schema<ILedgerEntryDocument>(
    {
        direction: { type: String, enum: ['CREDIT', 'DEBIT'], required: true },
        type: {
            type: String,
            enum: [...CREDIT_TYPES, ...DEBIT_TYPES],
            required: true,
        },
        status: {
            type: String,
            enum: ['DRAFT', 'PENDING', 'POSTED', 'REJECTED', 'REVERSED'],
            default: 'PENDING',
        },

        amount: { type: Number, required: true, min: 1 },
        currency: { type: String, enum: ['BDT'], default: 'BDT' },

        memberId: { type: Schema.Types.ObjectId, ref: 'User' },
        period: { type: String, required: true }, // 'YYYY-MM'
        valueDate: { type: Date, required: true },

        title: { type: String, required: true, trim: true, maxlength: 200 },
        note: { type: String, trim: true, maxlength: 1000 },
        channel: {
            type: String,
            enum: ['BANK', 'BKASH', 'NAGAD', 'ROCKET', 'CASH', 'INTERNAL', 'OTHER'],
        },

        attachments: { type: [LedgerAttachmentSchema], default: [] },

        investmentId: { type: Schema.Types.ObjectId, ref: 'Investment' },

        reversalOf: { type: Schema.Types.ObjectId, ref: 'LedgerEntry' },
        reversedBy: { type: Schema.Types.ObjectId, ref: 'LedgerEntry' },

        createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        // 0 for entries created already-POSTED (the backfill script) — they
        // never go through the approval workflow at all.
        requiredApprovals: { type: Number, default: 0, min: 0 },
        approvals: { type: [LedgerApprovalSchema], default: [] },
        postedAt: { type: Date },
        rejectedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        rejectedAt: { type: Date },
        rejectionReason: { type: String, trim: true },

        source: {
            type: new Schema(
                {
                    sourceType: { type: String, enum: ['Transfer', 'Cost'], required: true },
                    id: { type: Schema.Types.ObjectId, required: true },
                },
                { _id: false }
            ),
            required: false,
        },
    },
    { timestamps: true }
);

LedgerEntrySchema.index({ period: 1, status: 1 });
LedgerEntrySchema.index({ memberId: 1, period: 1 });
LedgerEntrySchema.index({ status: 1, createdAt: -1 }); // the approvals queue
LedgerEntrySchema.index({ type: 1, valueDate: -1 });
LedgerEntrySchema.index({ investmentId: 1 }, { sparse: true });
// Backfill idempotency: at most one ledger entry per (source document, type)
// — a single Transfer can produce both a CONTRIBUTION_MONTHLY and a
// CONTRIBUTION_FLEX entry (the "pay both together" case), so `type` has to
// be part of the key, not just the source id.
//
// MUST be a partial index keyed on `source.id` existence, not `sparse: true`
// — `type` is always present, and MongoDB's compound-sparse rule only skips
// a document when EVERY indexed field is missing. With `sparse: true` here,
// every non-backfill entry (no `source` at all) still gets an index entry
// keyed on (undefined, undefined, type), so a second ordinary entry of the
// same type — e.g. a second month's BANK_CHARGE — would collide on a
// completely unrelated document. A partial index scoped to `source.id`
// existing correctly excludes all non-backfill entries instead.
LedgerEntrySchema.index(
    { 'source.sourceType': 1, 'source.id': 1, type: 1 },
    { unique: true, partialFilterExpression: { 'source.id': { $exists: true } } }
);

const LedgerEntry: ILedgerEntryModel =
    (mongoose.models.LedgerEntry as ILedgerEntryModel) ||
    mongoose.model<ILedgerEntryDocument, ILedgerEntryModel>('LedgerEntry', LedgerEntrySchema);

export default LedgerEntry;
