import request from './request';

export const dashboardApi = {
  summary: () => request.get('/dashboard/summary'),
  trend: (range = '30d') => request.get(`/dashboard/trend?range=${range}`),
  byDepartment: () => request.get('/dashboard/by-department'),
  byStatus: () => request.get('/dashboard/by-status'),
  funnel: () => request.get('/dashboard/funnel'),
};
