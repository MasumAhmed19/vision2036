import api from '@/lib/api';
import type { ApiResponse, Investment, InvestmentKind } from '@/types';

export interface ProposeInvestmentPayload {
  name: string;
  kind: InvestmentKind;
  expectedRatePct?: number;
  startDate?: string;
  maturityDate?: string;
  notes?: string;
}

export const investmentsService = {
  getInvestments: async (): Promise<Investment[]> => {
    const response = await api.get<ApiResponse<Investment[]>>('/investments');
    return response.data.data;
  },

  proposeInvestment: async (payload: ProposeInvestmentPayload): Promise<Investment> => {
    const response = await api.post<ApiResponse<Investment>>('/investments', payload);
    return response.data.data;
  },

  valueInvestment: async (id: string, currentValue: number): Promise<Investment> => {
    const response = await api.post<ApiResponse<Investment>>(`/investments/${id}/value`, { currentValue });
    return response.data.data;
  },
};
