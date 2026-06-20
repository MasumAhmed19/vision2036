import api from '@/lib/api';
import type { ApiResponse, Transfer, PaginatedTransfersResponse } from '@/types';

interface TransferProofUploadResponse {
  url: string;
  publicId: string;
}

export const transfersService = {
  // Upload payment proof through the backend so file naming is controlled server-side
  uploadProof: async (formData: FormData): Promise<TransferProofUploadResponse> => {
    const response = await api.post<ApiResponse<TransferProofUploadResponse>>('/transfers/upload-proof', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data.data;
  },

  // Submit a payment
  submitPayment: async (data: any): Promise<Transfer> => {
    const response = await api.post<ApiResponse<Transfer>>('/transfers', data);
    return response.data.data;
  },

  // Get current user's transfers with filtering
  getUserTransfers: async (queryString?: string): Promise<PaginatedTransfersResponse> => {
    const url = queryString ? `/transfers/me?${queryString}` : '/transfers/me';
    const response = await api.get<PaginatedTransfersResponse>(url);
    return response.data;
  },

  // Get all transfers (admin)
  getAllTransfers: async (queryString?: string): Promise<PaginatedTransfersResponse> => {
    const url = queryString ? `/transfers?${queryString}` : '/transfers';
    const response = await api.get<PaginatedTransfersResponse>(url);
    return response.data;
  },

  // Get count of pending actions for Badge Notification
  getPendingCount: async (): Promise<{ count: number }> => {
    const response = await api.get<ApiResponse<{ count: number }>>('/transfers/pending/count');
    return response.data.data;
  },

  // Get single transfer by ID
  getTransfer: async (id: string): Promise<Transfer> => {
    const response = await api.get<ApiResponse<Transfer>>(`/transfers/${id}`);
    return response.data.data;
  },

  // Verify a transfer (admin)
  verifyTransfer: async (id: string, remarks?: string): Promise<Transfer> => {
    const response = await api.patch<ApiResponse<Transfer>>(`/transfers/${id}/verify`, { status: 'VERIFIED', remarks });
    return response.data.data;
  },

  // Reject a transfer (admin)
  rejectTransfer: async (id: string, rejectionReason: string): Promise<Transfer> => {
    const response = await api.patch<ApiResponse<Transfer>>(`/transfers/${id}/verify`, { status: 'REJECTED', rejectionReason });
    return response.data.data;
  },

  retrySync: async (id: string): Promise<{ id: string; syncedToSheet: boolean; syncedAt?: string }> => {
    const response = await api.post<ApiResponse<{ id: string; syncedToSheet: boolean; syncedAt?: string }>>(`/transfers/${id}/sync`);
    return response.data.data;
  },
};
