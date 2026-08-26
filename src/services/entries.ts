import api from '@/lib/api';
import type { ApiResponse, LedgerEntry, LedgerEntryListResponse, FundPosition, GroupStatus } from '@/types';

export interface CreateEntryPayload {
  type: string;
  amount: number; // whole Taka
  period: string; // 'YYYY-MM'
  valueDate: string;
  title: string;
  note?: string;
  channel?: string;
  direction?: 'CREDIT' | 'DEBIT'; // required only for ADJUSTMENT
  memberId?: string;
  investmentId?: string; // required for INVESTMENT_OUT/RETURN/PRINCIPAL_BACK
  attachments?: Array<{ url: string; publicId?: string; kind: 'SCREENSHOT' | 'RECEIPT' | 'STATEMENT' }>;
}

export const entriesService = {
  getEntries: async (queryString?: string): Promise<LedgerEntryListResponse> => {
    const url = queryString ? `/entries?${queryString}` : '/entries';
    const response = await api.get<LedgerEntryListResponse>(url);
    return response.data;
  },

  getEntry: async (id: string): Promise<LedgerEntry> => {
    const response = await api.get<ApiResponse<LedgerEntry>>(`/entries/${id}`);
    return response.data.data;
  },

  createEntry: async (payload: CreateEntryPayload): Promise<LedgerEntry> => {
    const response = await api.post<ApiResponse<LedgerEntry>>('/entries', payload);
    return response.data.data;
  },

  uploadProof: async (formData: FormData): Promise<{ url: string; publicId: string }> => {
    const response = await api.post<ApiResponse<{ url: string; publicId: string }>>('/entries/upload-proof', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data.data;
  },

  reverseEntry: async (id: string, reason: string): Promise<{ original: LedgerEntry; reversal: LedgerEntry }> => {
    const response = await api.post<ApiResponse<{ original: LedgerEntry; reversal: LedgerEntry }>>(
      `/entries/${id}/reverse`,
      { reason }
    );
    return response.data.data;
  },

  getFundPosition: async (throughPeriod?: string): Promise<FundPosition> => {
    const url = throughPeriod ? `/fund?throughPeriod=${throughPeriod}` : '/fund';
    const response = await api.get<ApiResponse<FundPosition>>(url);
    return response.data.data;
  },

  getGroupStatus: async (period?: string): Promise<GroupStatus> => {
    const url = period ? `/dashboard/group-status?period=${period}` : '/dashboard/group-status';
    const response = await api.get<ApiResponse<GroupStatus>>(url);
    return response.data.data;
  },
};
