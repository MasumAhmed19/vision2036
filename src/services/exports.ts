import api from '@/lib/api';
import type { ExportScope } from '@/types';

export interface ExportParams {
  scope: ExportScope;
  year?: number;
  month?: string;
  userId?: string;
}

function buildQuery(params: ExportParams) {
  const query = new URLSearchParams();
  query.set('scope', params.scope);
  if (params.year) query.set('year', String(params.year));
  if (params.month) query.set('month', params.month);
  if (params.userId) query.set('userId', params.userId);
  return query.toString();
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function getFileNameFromDisposition(header?: string, fallback = 'report') {
  if (!header) return fallback;
  const match = /filename="?([^\"]+)"?/i.exec(header);
  return match?.[1] || fallback;
}

export const exportsService = {
  downloadPdf: async (params: ExportParams) => {
    const response = await api.get(`/exports/pdf?${buildQuery(params)}`, {
      responseType: 'blob',
    });

    const fileName = getFileNameFromDisposition(response.headers['content-disposition'], 'report.pdf');
    downloadBlob(response.data, fileName);
  },

  downloadExcel: async (params: ExportParams) => {
    const response = await api.get(`/exports/excel?${buildQuery(params)}`, {
      responseType: 'blob',
    });

    const fileName = getFileNameFromDisposition(response.headers['content-disposition'], 'report.xlsx');
    downloadBlob(response.data, fileName);
  },
};
