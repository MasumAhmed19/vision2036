import api from '@/lib/api';
import type { ApiResponse, AuditLogListData } from '@/types';

export const auditLogsService = {
  getLogs: async (queryString?: string): Promise<AuditLogListData> => {
    const url = queryString ? `/audit-logs?${queryString}` : '/audit-logs';
    const response = await api.get<ApiResponse<AuditLogListData>>(url);
    return response.data.data;
  },

  deleteLogs: async (payload: {
    ids?: string[];
    actor?: string;
    action?: string;
    dateFrom?: string;
    dateTo?: string;
    targetCollection?: string;
    deleteAll?: boolean;
  }) => {
    const response = await api.delete<ApiResponse<{ deletedCount: number }>>('/audit-logs', { data: payload });
    return response.data.data;
  },
};
