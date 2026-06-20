import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

export const updateProfileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phoneNumber: z.string().optional().nullable(),
  avatarUrl: z.string().url().optional().nullable(),
});

export const paymentSchema = z.object({
  bankAccountId: z.string().optional(),
  transferDate: z.string().min(1, 'Transfer date is required'),
  month: z.number().min(1).max(12),
  year: z.number().min(2025).max(2036),
  transferChannel: z.enum(['BANK_TRANSFER', 'BKASH', 'NAGAD', 'ROCKET', 'CASH', 'OTHER']),
  amount: z.number().positive('Amount must be positive'),
  isFlexible: z.boolean(),
  remarks: z.string().optional(),
});

export const bankAccountSchema = z.object({
  bankName: z.string().min(2, 'Bank name is required'),
  accountNumber: z.string().min(5, 'Invalid account number'),
  accountHolderName: z.string().min(2, 'Account holder name is required'),
  isPrimary: z.boolean().optional(),
});

export const registerUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['MEMBER', 'ADMIN', 'SUPER_ADMIN']),
  phoneNumber: z.string().optional(),
});

export const policySchema = z.object({
  year: z.number().min(2025).max(2036),
  monthlyAmount: z.number().positive('Monthly amount must be positive'),
  yearlyFlexibleAmount: z.number().positive('Yearly flexible amount must be positive'),
  paymentDeadlineDay: z.number().min(1).max(28),
  flexibleHalfDeadlineMonth: z.number().min(1).max(12),
  isActive: z.boolean().optional(),
});

export type LoginFormData = z.infer<typeof loginSchema>;
export type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;
export type UpdateProfileFormData = z.infer<typeof updateProfileSchema>;
export type PaymentFormData = z.infer<typeof paymentSchema>;
export type BankAccountFormData = z.infer<typeof bankAccountSchema>;
export type RegisterUserFormData = z.infer<typeof registerUserSchema>;
export type PolicyFormData = z.infer<typeof policySchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;
