import api from '@/lib/api';
import type { ApiResponse, Statement } from '@/types';

export interface PaginatedStatementsResponse {
  statements: Statement[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
  };
}

export const statementsService = {
  // Get all statements
  getAllStatements: async (queryString?: string): Promise<PaginatedStatementsResponse> => {
    const url = queryString ? `/statements?${queryString}` : '/statements';
    const response = await api.get<PaginatedStatementsResponse>(url);
    return response.data;
  },

  // Get single statement
  getStatement: async (id: string): Promise<Statement> => {
    const response = await api.get<ApiResponse<Statement>>(`/statements/${id}`);
    return response.data.data;
  },

  // Upload statement (admin)
  createStatement: async (data: FormData): Promise<Statement> => {
    const response = await api.post<ApiResponse<Statement>>('/statements', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data.data;
  },

  // Delete statement (admin)
  deleteStatement: async (id: string): Promise<void> => {
    await api.delete(`/statements/${id}`);
  },
};
