import api from '@/lib/api';
import type { ApiResponse, BankAccount } from '@/types';

export interface BankAccountFormData {
  bankName: string;
  accountNumber: string;
  accountHolderName?: string;
  branchName?: string;
  routingNumber?: string;
  isPrimary?: boolean;
  isActive?: boolean;
}

export const bankAccountsService = {
  // Get current user's bank accounts
  getUserBankAccounts: async (): Promise<BankAccount[]> => {
    const response = await api.get<ApiResponse<BankAccount[]>>('/bank-accounts/me');
    return response.data.data;
  },

  // Get admin bank accounts (for payment receivers)
  getAdminBankAccounts: async (): Promise<BankAccount[]> => {
    const response = await api.get<ApiResponse<BankAccount[]>>('/bank-accounts/admin');
    return response.data.data;
  },

  // Get single bank account
  getBankAccount: async (id: string): Promise<BankAccount> => {
    const response = await api.get<ApiResponse<BankAccount>>(`/bank-accounts/${id}`);
    return response.data.data;
  },

  // Create a new bank account
  createBankAccount: async (data: BankAccountFormData): Promise<BankAccount> => {
    const response = await api.post<ApiResponse<BankAccount>>('/bank-accounts', data);
    return response.data.data;
  },

  // Update a bank account
  updateBankAccount: async (id: string, data: Partial<BankAccountFormData>): Promise<BankAccount> => {
    const response = await api.patch<ApiResponse<BankAccount>>(`/bank-accounts/${id}`, data);
    return response.data.data;
  },

  // Delete a bank account
  deleteBankAccount: async (id: string): Promise<void> => {
    await api.delete(`/bank-accounts/${id}`);
  },
};
