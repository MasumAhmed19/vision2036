import api from '@/lib/api';
import type { ApiResponse, MonthlyCollectionSummary } from '@/types';

export const monthlySummariesService = {
  getMonthlySummaries: async (year: number): Promise<MonthlyCollectionSummary[]> => {
    const response = await api.get<ApiResponse<MonthlyCollectionSummary[]>>('/monthly-summaries', {
      params: { year },
    });
    return response.data.data;
  },
};
