import api from '@/lib/api';
import type { ApiResponse, AdminDashboardData, MemberDashboardData } from '@/types';

export const dashboardService = {
  getAdminDashboard: async (): Promise<AdminDashboardData> => {
    const response = await api.get<ApiResponse<AdminDashboardData>>('/dashboard/admin');
    return response.data.data;
  },

  getMemberDashboard: async (): Promise<MemberDashboardData> => {
    const response = await api.get<ApiResponse<MemberDashboardData>>('/dashboard/member');
    return response.data.data;
  },
};
