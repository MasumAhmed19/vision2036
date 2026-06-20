import api from '@/lib/api';
import type { ApiResponse, Cost } from '@/types';

export interface CostFormData {
  amount: number;
  date: string;
  reason: string;
  category: 'bank_charge' | 'operational' | 'investment' | 'other';
  receiptImage?: string;
  receiptImagePublicId?: string;
}

export const costsService = {
  getCosts: async (queryString?: string): Promise<Cost[]> => {
    const url = queryString ? `/costs?${queryString}` : '/costs';
    const response = await api.get<ApiResponse<Cost[]>>(url);
    return response.data.data;
  },

  getCost: async (id: string): Promise<Cost> => {
    const response = await api.get<ApiResponse<Cost>>(`/costs/${id}`);
    return response.data.data;
  },

  createCost: async (data: CostFormData): Promise<Cost> => {
    const response = await api.post<ApiResponse<Cost>>('/costs', data);
    return response.data.data;
  },

  updateCost: async (id: string, data: CostFormData): Promise<Cost> => {
    const response = await api.patch<ApiResponse<Cost>>(`/costs/${id}`, data);
    return response.data.data;
  },

  deleteCost: async (id: string): Promise<void> => {
    await api.delete(`/costs/${id}`);
  },

  retrySync: async (id: string) => {
    const response = await api.post<ApiResponse<{ id: string; syncedToSheet: boolean; syncedAt?: string }>>(`/costs/${id}/sync`);
    return response.data.data;
  },

  uploadReceipt: async (formData: FormData): Promise<{ url: string; publicId: string }> => {
    const response = await api.post<ApiResponse<{ url: string; publicId: string }>>('/costs/upload-receipt', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data.data;
  },
};
