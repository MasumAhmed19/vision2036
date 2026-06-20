import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IBankAccount {
    userId: mongoose.Types.ObjectId | string;
    bankName: string;
    accountNumber: string;
    accountHolderName?: string;
    branchName?: string;
    routingNumber?: string;
    isPrimary: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface IBankAccountDocument extends Omit<IBankAccount, ''>, Document { }

export interface IBankAccountModel extends Model<IBankAccountDocument> {
    findUserPrimary(userId: string): Promise<IBankAccountDocument | null>;
}

const BankAccountSchema = new Schema<IBankAccountDocument>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        bankName: {
            type: String,
            required: [true, 'Bank name is required'],
            trim: true,
        },
        accountNumber: {
            type: String,
            required: [true, 'Account number is required'],
            trim: true,
        },
        accountHolderName: {
            type: String,
            trim: true,
        },
        branchName: {
            type: String,
            trim: true,
        },
        routingNumber: {
            type: String,
            trim: true,
        },
        isPrimary: {
            type: Boolean,
            default: false,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: true,
    }
);

// Ensure only one primary bank account per user
BankAccountSchema.pre('save', async function () {
    if (this.isModified('isPrimary') && this.isPrimary) {
        // Find if this user already has a primary account
        const BankAccountModel = this.constructor as IBankAccountModel;

        // If this is a new document or we're updating to primary,
        // we need to set all other accounts for this user to isPrimary = false
        await BankAccountModel.updateMany(
            {
                userId: this.userId,
                _id: { $ne: this._id }
            },
            { $set: { isPrimary: false } }
        );
    }
});

// Static method: find primary by user ID
BankAccountSchema.statics.findUserPrimary = function (userId: string) {
    return this.findOne({ userId, isPrimary: true, isActive: true });
};

// Prevent model re-compilation in hot reload
const BankAccount: IBankAccountModel =
    (mongoose.models.BankAccount as IBankAccountModel) ||
    mongoose.model<IBankAccountDocument, IBankAccountModel>('BankAccount', BankAccountSchema);

export default BankAccount;
