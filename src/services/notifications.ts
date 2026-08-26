import api from '@/lib/api';
import type { ApiResponse } from '@/types';

export interface SendNotificationPayload {
  template: 'missed_payment' | 'custom';
  recipientIds: string[];
  period?: string; // 'YYYY-MM' — required for missed_payment
  subject?: string; // required for custom
  message?: string; // required for custom
}

export interface SendNotificationResult {
  sent: { id: string; name: string }[];
  failed: { id: string; name?: string; reason: string }[];
}

export const notificationsService = {
  send: async (payload: SendNotificationPayload): Promise<SendNotificationResult> => {
    const response = await api.post<ApiResponse<SendNotificationResult>>('/notifications/send', payload);
    return response.data.data;
  },
};
