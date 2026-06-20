import api from '@/lib/api';
import type { ApiResponse, GlobalSummary, UserSummary, UserYearlySummary } from '@/types';

export const summariesService = {
  // Get current user's summary for a specific year
  getUserSummary: async (year: number): Promise<UserYearlySummary> => {
    const response = await api.get<ApiResponse<UserYearlySummary>>('/summaries/me', { 
      params: { year } 
    });
    return response.data.data;
  },

  // Get global summary (all users) for a specific year
  getGlobalSummary: async (year: number): Promise<GlobalSummary> => {
    const response = await api.get<ApiResponse<GlobalSummary>>('/summaries/global', { 
      params: { year } 
    });
    return response.data.data;
  },

  // Get all user summaries (admin)
  getAllSummaries: async (year?: number): Promise<UserSummary[]> => {
    const response = await api.get<ApiResponse<UserSummary[]>>('/summaries', { 
      params: { year } 
    });
    return response.data.data;
  },
};
