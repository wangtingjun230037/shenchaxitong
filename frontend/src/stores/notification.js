import { defineStore } from 'pinia';
import { notificationsApi } from '@/api/notifications';

export const useNotificationStore = defineStore('notification', {
  state: () => ({
    unread: 0,
    recent: [],
    list: [],
    total: 0,
    page: 1,
    size: 20,
    loading: false,
    pollHandle: null,
  }),

  actions: {
    startPolling() {
      this.stopPolling();
      this.fetchUnread();
      this.pollHandle = setInterval(() => this.fetchUnread(), 30000);
    },

    stopPolling() {
      if (this.pollHandle) {
        clearInterval(this.pollHandle);
        this.pollHandle = null;
      }
    },

    async fetchUnread() {
      try {
        const r = await notificationsApi.unreadCount();
        this.unread = r.count;
      } catch (_) {
        // 静默
      }
    },

    async fetchRecent(size = 10) {
      try {
        const r = await notificationsApi.list({ size });
        this.recent = r.items || [];
        this.unread = r.unread ?? this.unread;
      } catch (_) {}
    },

    async fetchList({ type, read, page = 1, size = 20 } = {}) {
      this.loading = true;
      try {
        const params = { page, size };
        if (type) params.type = type;
        if (read === true) params.read = 'true';
        if (read === false) params.read = 'false';
        const r = await notificationsApi.list(params);
        this.list = r.items || [];
        this.total = r.total;
        this.unread = r.unread ?? this.unread;
        this.page = page;
        this.size = size;
        return r;
      } finally {
        this.loading = false;
      }
    },

    async markRead(id) {
      await notificationsApi.read(id);
      const target = this.recent.find((n) => n.id === id);
      if (target && !target.readAt) {
        target.readAt = new Date().toISOString();
        this.unread = Math.max(0, this.unread - 1);
      }
      const target2 = this.list.find((n) => n.id === id);
      if (target2 && !target2.readAt) {
        target2.readAt = new Date().toISOString();
      }
    },

    async markAllRead(type) {
      const r = await notificationsApi.readAll(type);
      this.unread = 0;
      this.recent.forEach((n) => { if (!type || n.type === type) n.readAt = new Date().toISOString(); });
      this.list.forEach((n) => { if (!type || n.type === type) n.readAt = new Date().toISOString(); });
      return r;
    },

    async remove(id) {
      await notificationsApi.remove(id);
      this.recent = this.recent.filter((n) => n.id !== id);
      this.list = this.list.filter((n) => n.id !== id);
    },

    async clearRead() {
      const r = await notificationsApi.clearRead();
      this.recent = this.recent.filter((n) => !n.readAt);
      this.list = this.list.filter((n) => !n.readAt);
      return r;
    },
  },
});
