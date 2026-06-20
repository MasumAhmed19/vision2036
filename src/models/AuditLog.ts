import mongoose, { Document, Model, Schema } from 'mongoose';

export type AuditAction =
    | 'LOGIN'
    | 'LOGOUT'
    | 'USER_UPDATED'
    | 'PASSWORD_CHANGED'
    | 'AVATAR_UPDATED'
    | 'BANK_ACCOUNT_ADDED'
    | 'BANK_ACCOUNT_UPDATED'
    | 'BANK_ACCOUNT_DELETED'
    | 'TRANSFER_CREATED'
    | 'TRANSFER_VERIFIED'
    | 'TRANSFER_REJECTED'
    | 'COST_ADDED'
    | 'COST_UPDATED'
    | 'COST_DELETED'
    | 'SHEET_SYNCED'
    | 'EXPORT_PDF'
    | 'EXPORT_EXCEL'
    | 'MEMBER_ACTIVATED'
    | 'MEMBER_DEACTIVATED'
    | 'PASSWORD_RESET';

export interface IAuditLog {
    actorId: mongoose.Types.ObjectId | string;
    actorName: string;
    action: AuditAction;
    targetCollection?: string;
    targetId?: string;
    previousValue?: Record<string, unknown> | null;
    newValue?: Record<string, unknown> | null;
    ipAddress?: string;
    timestamp: Date;
}

export interface IAuditLogDocument extends IAuditLog, Document { }

export interface IAuditLogModel extends Model<IAuditLogDocument> { }

const AuditLogSchema = new Schema<IAuditLogDocument>(
    {
        actorId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        actorName: {
            type: String,
            required: true,
        },
        action: {
            type: String,
            enum: [
                'LOGIN',
                'LOGOUT',
                'USER_UPDATED',
                'PASSWORD_CHANGED',
                'AVATAR_UPDATED',
                'BANK_ACCOUNT_ADDED',
                'BANK_ACCOUNT_UPDATED',
                'BANK_ACCOUNT_DELETED',
                'TRANSFER_CREATED',
                'TRANSFER_VERIFIED',
                'TRANSFER_REJECTED',
                'COST_ADDED',
                'COST_UPDATED',
                'COST_DELETED',
                'SHEET_SYNCED',
                'EXPORT_PDF',
                'EXPORT_EXCEL',
                'MEMBER_ACTIVATED',
                'MEMBER_DEACTIVATED',
                'PASSWORD_RESET',
            ],
            required: true,
        },
        targetCollection: {
            type: String,
        },
        targetId: {
            type: String,
        },
        previousValue: {
            type: Schema.Types.Mixed,
            default: null,
        },
        newValue: {
            type: Schema.Types.Mixed,
            default: null,
        },
        ipAddress: {
            type: String,
        },
        timestamp: {
            type: Date,
            default: Date.now,
        },
    },
    {
        // No timestamps: we use custom `timestamp` field
        versionKey: false,
    }
);

// Index for efficient queries
AuditLogSchema.index({ actorId: 1, timestamp: -1 });
AuditLogSchema.index({ action: 1, timestamp: -1 });
AuditLogSchema.index({ targetCollection: 1, targetId: 1 });

const AuditLog = (mongoose.models.AuditLog as IAuditLogModel) ||
    mongoose.model<IAuditLogDocument, IAuditLogModel>('AuditLog', AuditLogSchema);

export default AuditLog;
