import api from '@/lib/api';
import type { ApiResponse, SyncFailuresData } from '@/types';

export const adminToolsService = {
  getSyncFailures: async (): Promise<SyncFailuresData> => {
    const response = await api.get<ApiResponse<SyncFailuresData>>('/sync-failures');
    return response.data.data;
  },
};
