import api from '@/lib/api';
import type { ApiResponse, AdminDashboardData, MemberDashboardData, TopContributor } from '@/types';

export const dashboardService = {
  getAdminDashboard: async (): Promise<AdminDashboardData> => {
    const response = await api.get<ApiResponse<AdminDashboardData>>('/dashboard/admin');
    return response.data.data;
  },

  getMemberDashboard: async (): Promise<MemberDashboardData> => {
    const response = await api.get<ApiResponse<MemberDashboardData>>('/dashboard/member');
    return response.data.data;
  },

  getTopContributors: async (limit = 3): Promise<TopContributor[]> => {
    const response = await api.get<ApiResponse<TopContributor[]>>(`/dashboard/top-contributors?limit=${limit}`);
    return response.data.data;
  },
};
