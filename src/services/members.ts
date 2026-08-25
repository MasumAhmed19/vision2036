import api from '@/lib/api';
import type { ApiResponse, PublicMember } from '@/types';

export const membersService = {
  getMembers: async (): Promise<PublicMember[]> => {
    const response = await api.get<ApiResponse<PublicMember[]>>('/members');
    return response.data.data;
  },
};
