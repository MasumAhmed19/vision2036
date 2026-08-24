import api from '@/lib/api';
import type { ApiResponse, AuditLogListData } from '@/types';

// No delete method — the audit log is append-only by design (see the API
// route for why).
export const auditLogsService = {
  getLogs: async (queryString?: string): Promise<AuditLogListData> => {
    const url = queryString ? `/audit-logs?${queryString}` : '/audit-logs';
    const response = await api.get<ApiResponse<AuditLogListData>>(url);
    return response.data.data;
  },
};
