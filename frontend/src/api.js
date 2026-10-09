import axios from 'axios';

const configuredBaseUrl = process.env.REACT_APP_API_URL || '/api';
export const API_BASE_URL = configuredBaseUrl.replace(/\/+$/, '');

export const publicJobApplicationUrl = jobId => `${API_BASE_URL}/jobs/${encodeURIComponent(jobId)}/application`;

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: { Accept: 'application/json' },
});

export function friendlyError(error, fallback) {
  const status = error?.response?.status;
  if (!status) return fallback;
  if (status >= 500) return 'The service could not complete that request. Please try again.';

  const detail = error.response?.data?.detail;
  if (typeof detail === 'string' && detail.length <= 240 && !/request failed|traceback|sqlalchemy|exception/i.test(detail)) {
    return detail;
  }
  if (Array.isArray(detail)) {
    const message = detail.map(item => item.msg).filter(Boolean).join(', ');
    if (message) return message;
  }
  if (status === 404) return 'That item could not be found. It may have been removed.';
  if (status === 409) return 'That action is already running. Please wait and try again.';
  if (status === 413) return 'The selected file is too large.';
  if (status === 415) return 'That file type is not supported.';
  if (status === 422) return 'Some of the information needs attention. Please review the form.';
  if (status === 429) return 'Too many requests. Please wait a moment and try again.';
  return fallback;
}

export function formatDate(value, options = { dateStyle: 'medium' }) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en-TZ', options).format(date);
}
