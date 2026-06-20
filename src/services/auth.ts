import api from '@/lib/api';
import type { ApiResponse, AuthResponse, User } from '@/types';
import type { LoginFormData, ChangePasswordFormData, RegisterUserFormData } from '@/lib/validations';

export const authApi = {
  login: (data: LoginFormData) => 
    api.post<ApiResponse<AuthResponse>>('/auth/login', data),
  
  logout: () => 
    api.post<ApiResponse<null>>('/auth/logout'),
  
  refresh: () => 
    api.post<ApiResponse<{ accessToken: string }>>('/auth/refresh'),
  
  changePassword: (data: ChangePasswordFormData) => 
    api.patch<ApiResponse<null>>('/users/me/password', {
      currentPassword: data.oldPassword,
      newPassword: data.newPassword,
    }),
  
  register: (data: RegisterUserFormData) => 
    api.post<ApiResponse<User>>('/auth/register', data),
};
