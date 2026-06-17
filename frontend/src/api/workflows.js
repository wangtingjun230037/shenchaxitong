import request from './request';

export const workflowApi = {
  list: () => request.get('/workflows'),
  get: (id) => request.get(`/workflows/${id}`),
  create: (data) => request.post('/workflows', data),
  update: (id, data) => request.put(`/workflows/${id}`, data),
  archive: (id) => request.delete(`/workflows/${id}`),
  validate: (data) => request.post('/workflows/validate', data),
};
