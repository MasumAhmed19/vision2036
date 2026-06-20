import api from '@/lib/api';
import type { ApiResponse, User, UserRole } from '@/types';

export interface UpdateProfileData {
  name?: string;
  phoneNumber?: string;
}

export interface PaginatedUsersResponse {
  users: User[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
  };
}

export interface PasswordResetResponse {
  id: string;
  temporaryPassword: string;
}

export const usersService = {
  // Get current user profile
  getMe: async (): Promise<User> => {
    const response = await api.get<ApiResponse<User>>('/users/me');
    return response.data.data;
  },

  // Update current user profile
  updateProfile: async (data: UpdateProfileData): Promise<User> => {
    const response = await api.patch<ApiResponse<User>>('/users/me', data);
    return response.data.data;
  },

  // Update avatar
  updateAvatar: async (formData: FormData): Promise<User> => {
    const response = await api.patch<ApiResponse<User>>('/users/me/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data.data;
  },

  // Get all users (admin)
  getAllUsers: async (queryString?: string): Promise<PaginatedUsersResponse> => {
    const url = queryString ? `/users?${queryString}` : '/users';
    const response = await api.get<PaginatedUsersResponse>(url);
    return response.data;
  },

  // Get single user by ID
  getUser: async (id: string): Promise<User> => {
    const response = await api.get<ApiResponse<User>>(`/users/${id}`);
    return response.data.data;
  },

  // Update user status (admin)
  updateUserStatus: async (id: string, isActive: boolean): Promise<User> => {
    const response = await api.patch<ApiResponse<User>>(`/users/${id}/status`, { isActive });
    return response.data.data;
  },

  // Update user role (super admin)
  updateUserRole: async (id: string, role: UserRole): Promise<User> => {
    const response = await api.patch<ApiResponse<User>>(`/users/${id}/role`, { role });
    return response.data.data;
  },

  resetUserPassword: async (id: string, newPassword?: string): Promise<PasswordResetResponse> => {
    const response = await api.post<ApiResponse<PasswordResetResponse>>(`/users/${id}/reset-password`, {
      ...(newPassword ? { newPassword } : {}),
    });
    return response.data.data;
  },
};

// Legacy export for backward compatibility
export const userApi = usersService;
