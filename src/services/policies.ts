import api from '@/lib/api';
import type { ApiResponse, Policy } from '@/types';

export interface PolicyFormData {
  year: number;
  monthlyAmount: number;
  yearlyFlexibleAmount: number;
  paymentDeadlineDay?: number;
  flexibleHalfDeadlineMonth?: number;
  isActive?: boolean;
}

export const policiesService = {
  // Get active policy
  getActivePolicy: async (): Promise<Policy> => {
    const response = await api.get<ApiResponse<Policy>>('/policies/active');
    return response.data.data;
  },

  // Get all policies
  getAllPolicies: async (): Promise<Policy[]> => {
    const response = await api.get<ApiResponse<Policy[]>>('/policies');
    return response.data.data;
  },

  // Get policy by ID
  getPolicy: async (id: string): Promise<Policy> => {
    const response = await api.get<ApiResponse<Policy>>(`/policies/${id}`);
    return response.data.data;
  },

  // Create new policy (super admin)
  createPolicy: async (data: PolicyFormData): Promise<Policy> => {
    const response = await api.post<ApiResponse<Policy>>('/policies', data);
    return response.data.data;
  },

  // Update policy (super admin)
  updatePolicy: async (id: string, data: Partial<PolicyFormData>): Promise<Policy> => {
    const response = await api.patch<ApiResponse<Policy>>(`/policies/${id}`, data);
    return response.data.data;
  },
};
