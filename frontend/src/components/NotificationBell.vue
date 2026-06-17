<template>
  <el-popover :width="420" placement="bottom-end" trigger="click" @show="onShow">
    <template #reference>
      <el-badge :value="noti.unread" :hidden="!noti.unread" :max="99" class="bell-trigger">
        <el-icon :size="22" class="bell-icon"><Bell /></el-icon>
      </el-badge>
    </template>

    <div class="bell-header">
      <span style="font-weight: 600">消息中心</span>
      <div>
        <el-button text size="small" @click="noti.markAllRead()" :disabled="!noti.unread">全部已读</el-button>
        <el-button text size="small" type="primary" @click="goAll">查看全部</el-button>
      </div>
    </div>

    <div v-loading="loading" class="bell-list">
      <div v-if="!noti.recent.length" class="empty muted">暂无新消息</div>
      <div
        v-for="n in noti.recent"
        :key="n.id"
        :class="['bell-item', !n.readAt && 'unread']"
        @click="onItemClick(n)"
      >
        <div class="bell-icon-cell" :style="{ color: metaColor(n.meta?.color) }">
          {{ n.meta?.icon || '·' }}
        </div>
        <div class="bell-body">
          <div class="bell-title">{{ n.title }}</div>
          <div class="bell-text muted">{{ n.body || '点击查看详情' }}</div>
          <div class="bell-time muted">{{ relTime(n.createdAt) }}</div>
        </div>
        <el-tag v-if="!n.readAt" type="primary" size="small" effect="plain" class="bell-dot">新</el-tag>
      </div>
    </div>
  </el-popover>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useNotificationStore } from '@/stores/notification';
import { Bell } from '@element-plus/icons-vue';

const noti = useNotificationStore();
const router = useRouter();
const loading = ref(false);

const TYPE_ROUTE = {
  Plan: (n) => `/plans/${n.targetId}`,
  Announcement: (n) => `/messages?announcement=${n.targetId}`,
};

const COLORS = {
  primary: '#409eff',
  success: '#67c23a',
  warning: '#e6a23c',
  danger: '#f56c6c',
  info: '#909399',
};
function metaColor(c) { return COLORS[c] || COLORS.info; }

function relTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return '刚刚';
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  return `${Math.floor(s / 86400)} 天前`;
}

async function onShow() {
  loading.value = true;
  try {
    await noti.fetchRecent(10);
  } finally {
    loading.value = false;
  }
}

async function onItemClick(n) {
  if (!n.readAt) await noti.markRead(n.id);
  const r = TYPE_ROUTE[n.targetType];
  if (r) router.push(r(n));
  else router.push('/messages');
}

function goAll() {
  router.push('/messages');
}
</script>

<style scoped>
.bell-trigger { cursor: pointer; }
.bell-icon { color: #fff; }
.bell-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 4px 4px 10px; border-bottom: 1px solid #ebeef5;
}
.bell-list { max-height: 480px; overflow-y: auto; }
.bell-item {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 10px 4px; border-bottom: 1px solid #f5f7fa; cursor: pointer;
  transition: background 0.15s;
}
.bell-item:hover { background: #f5f7fa; }
.bell-item.unread { background: #ecf5ff; }
.bell-item.unread:hover { background: #d9ecff; }
.bell-icon-cell { font-size: 18px; line-height: 1; flex-shrink: 0; padding-top: 2px; }
.bell-body { flex: 1; min-width: 0; }
.bell-title { font-size: 14px; font-weight: 500; color: #303133; line-height: 1.4; }
.bell-text { font-size: 12px; margin-top: 2px; line-height: 1.4; }
.bell-time { font-size: 11px; margin-top: 4px; }
.bell-dot { flex-shrink: 0; }
.empty { text-align: center; padding: 32px 0; }
</style>
