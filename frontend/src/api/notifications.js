import request from './request';

export const notificationsApi = {
  list: (params) => request.get('/notifications', { params }),
  unreadCount: () => request.get('/notifications/unread-count'),
  read: (id) => request.post(`/notifications/${id}/read`),
  readAll: (type) => request.post('/notifications/read-all', type ? { type } : {}),
  remove: (id) => request.delete(`/notifications/${id}`),
  clearRead: () => request.delete('/notifications', { params: { read: true } }),
};

export const announcementsApi = {
  list: (params) => request.get('/announcements', { params }),
  listAll: (params) => request.get('/announcements/all', { params }),
  publish: (data) => request.post('/announcements', data),
  update: (id, data) => request.put(`/announcements/${id}`, data),
  withdraw: (id) => request.delete(`/announcements/${id}`),
};
