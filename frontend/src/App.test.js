import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { api } from './api';

jest.mock('./api', () => ({
  api: { get: jest.fn(), post: jest.fn() },
  friendlyError: (_error, fallback) => fallback,
  formatDate: () => 'Jan 2, 2026',
  publicJobApplicationUrl: id => `/api/jobs/${id}/application`,
}));

const job = {
  id: 7, title: 'GIS Developer', company: 'Example Labs', location: 'Dar es Salaam', job_type: 'remote',
  description: 'Build mapping tools.', responsibilities: 'Maintain spatial services.', skills: ['GIS', 'Python'],
  application_available: true, source: 'BrighterMonday', source_url: 'https://private.example/listing',
};

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  api.get.mockImplementation(path => {
    if (path === '/jobs') return Promise.resolve({ data: { jobs: [job], total: 1 } });
    if (path === '/saved-jobs') return Promise.resolve({ data: { jobs: [] } });
    if (path === '/stats') return Promise.resolve({ data: { total_jobs: 1, jobs_by_type: {} } });
    if (path === '/jobs/7') return Promise.resolve({ data: { job } });
    if (path === '/cv/templates') return Promise.resolve({ data: { templates: [] } });
    if (path === '/cv/status') return Promise.resolve({ data: { ai_available: false } });
    return Promise.resolve({ data: {} });
  });
  api.post.mockResolvedValue({ data: { success: true } });
});

test('shows a listing without exposing scraper provenance', async () => {
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'GIS Developer' })).toBeInTheDocument();
  expect(screen.getByText('Dar es Salaam')).toBeInTheDocument();
  expect(screen.queryByText('BrighterMonday')).not.toBeInTheDocument();
  expect(screen.queryByText('https://private.example/listing')).not.toBeInTheDocument();
});

test('Apply Now opens the backend verified-application route', async () => {
  const open = jest.spyOn(window, 'open').mockImplementation(() => null);
  render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: /Apply Now/i }));
  expect(open).toHaveBeenCalledWith('/api/jobs/7/application', '_blank', 'noopener,noreferrer');
  open.mockRestore();
});

test('Save sends the browser profile key to the save endpoint', async () => {
  render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: 'Save' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/jobs/7/save', expect.objectContaining({ owner_key: expect.any(String) })));
});

test('Share uses the native share action when available', async () => {
  const share = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'share', { configurable: true, value: share });
  render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: 'Share' }));
  expect(share).toHaveBeenCalledWith(expect.objectContaining({ title: 'GIS Developer', url: expect.stringContaining('?job=7') }));
});

test('View Details loads full public job information', async () => {
  render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: /View Details/i }));
  expect(await screen.findByText('Maintain spatial services.')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Responsibilities' })).toBeInTheDocument();
  expect(screen.queryByText('BrighterMonday')).not.toBeInTheDocument();
});

test('Create CV for a listing opens the job-specific builder', async () => {
  render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: 'Create CV' }));
  expect(await screen.findByRole('heading', { name: 'CV for GIS Developer' })).toBeInTheDocument();
});
