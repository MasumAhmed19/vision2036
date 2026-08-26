import api from '@/lib/api';
import type { ApiResponse, PeriodDetail } from '@/types';

export const periodsService = {
  getPeriod: async (month: string): Promise<PeriodDetail> => {
    const response = await api.get<ApiResponse<PeriodDetail>>(`/periods/${month}`);
    return response.data.data;
  },

  closePeriod: async (month: string): Promise<PeriodDetail> => {
    const response = await api.post<ApiResponse<PeriodDetail>>(`/periods/${month}/close`);
    return response.data.data;
  },

  reopenPeriod: async (month: string, reason: string): Promise<{ month: string; status: string }> => {
    const response = await api.post<ApiResponse<{ month: string; status: string }>>(`/periods/${month}/reopen`, {
      reason,
    });
    return response.data.data;
  },
};
