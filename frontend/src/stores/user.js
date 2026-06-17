import { defineStore } from 'pinia';
import request from '@/api/request';

export const useUserStore = defineStore('user', {
  state: () => ({
    token: localStorage.getItem('token') || '',
    info: null,
  }),
  getters: {
    role: (s) => s.info?.role || '',
    isLogin: (s) => !!s.token,
    isAdmin: (s) => s.info?.role === 'ADMIN',
    canApprove: (s) => ['DEAN', 'ACADEMIC', 'PRESIDENT'].includes(s.info?.role),
  },
  actions: {
    async login(payload) {
      const data = await request.post('/auth/login', payload);
      this.token = data.token;
      this.info = data.user;
      localStorage.setItem('token', data.token);
      return data;
    },
    async fetchMe() {
      try {
        this.info = await request.get('/auth/me');
      } catch (e) { /* handled by interceptor */ }
    },
    logout() {
      this.token = '';
      this.info = null;
      localStorage.removeItem('token');
      location.href = '/#/login';
    },
  },
});
