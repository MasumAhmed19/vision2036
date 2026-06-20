import mongoose, { Document, Model, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

export type UserRole = 'member' | 'moderator' | 'admin';

export interface IUser {
    name: string;
    email: string;
    password: string;
    role: UserRole;
    phoneNumber?: string;
    avatar?: string; // Cloudinary URL
    isActive: boolean;
    joinedAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export interface IUserDocument extends Omit<IUser, ''>, Document {
    comparePassword(candidatePassword: string): Promise<boolean>;
}

export interface IUserModel extends Model<IUserDocument> {
    findByEmail(email: string): Promise<IUserDocument | null>;
}

const UserSchema = new Schema<IUserDocument>(
    {
        name: {
            type: String,
            required: [true, 'Name is required'],
            trim: true,
            maxlength: [100, 'Name cannot exceed 100 characters'],
        },
        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true,
            lowercase: true,
            trim: true,
            match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
        },
        password: {
            type: String,
            required: [true, 'Password is required'],
            minlength: [6, 'Password must be at least 6 characters'],
            select: false, // Don't return password by default
        },
        role: {
            type: String,
            enum: ['member', 'moderator', 'admin'],
            default: 'member',
        },
        phoneNumber: {
            type: String,
            trim: true,
        },
        avatar: {
            type: String, // Cloudinary URL
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        joinedAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
    }
);

// Hash password before saving
UserSchema.pre('save', async function () {
    if (!this.isModified('password')) {
        return;
    }

    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
});

// Instance method: compare password
UserSchema.methods.comparePassword = async function (
    candidatePassword: string
): Promise<boolean> {
    return bcrypt.compare(candidatePassword, this.password);
};

// Static method: find by email (includes password)
UserSchema.statics.findByEmail = function (email: string) {
    return this.findOne({ email: email.toLowerCase() }).select('+password');
};

// Prevent model re-compilation in hot reload
const User: IUserModel =
    (mongoose.models.User as IUserModel) ||
    mongoose.model<IUserDocument, IUserModel>('User', UserSchema);

export default User;
