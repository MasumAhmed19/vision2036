import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IRateLimitEntry {
    key: string;
    count: number;
    resetAt: Date;
}

export interface IRateLimitEntryDocument extends IRateLimitEntry, Document { }

export interface IRateLimitEntryModel extends Model<IRateLimitEntryDocument> { }

const RateLimitEntrySchema = new Schema<IRateLimitEntryDocument>(
    {
        key: {
            type: String,
            required: true,
            unique: true,
        },
        count: {
            type: Number,
            required: true,
            default: 0,
        },
        resetAt: {
            type: Date,
            required: true,
        },
    },
    {
        timestamps: false,
        versionKey: false,
    }
);

// Documents are cleaned up shortly after their window ends — a fresh
// window is started on next use regardless of whether the old doc has been
// swept yet (see consumeRateLimit's upsert logic).
RateLimitEntrySchema.index({ resetAt: 1 }, { expireAfterSeconds: 0 });

const RateLimitEntry: IRateLimitEntryModel =
    (mongoose.models.RateLimitEntry as IRateLimitEntryModel) ||
    mongoose.model<IRateLimitEntryDocument, IRateLimitEntryModel>('RateLimitEntry', RateLimitEntrySchema);

export default RateLimitEntry;
