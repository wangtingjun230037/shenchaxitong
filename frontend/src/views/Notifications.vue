<template>
  <div class="page" v-loading="noti.loading">
    <el-page-header :icon="ArrowLeft" @back="$router.back()" style="margin-bottom: 12px">
      <template #content><span style="font-size: 18px; font-weight: 600">消息中心</span></template>
    </el-page-header>

    <el-card class="box-card">
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <el-tabs v-model="activeTab" @tab-change="onTabChange">
            <el-tab-pane label="全部" name="ALL" />
            <el-tab-pane :label="`未读 ${noti.unread || ''}`" name="UNREAD" />
            <el-tab-pane label="审批" name="APPROVAL" />
            <el-tab-pane label="AI 报告" name="AI" />
            <el-tab-pane label="同部门" name="DEPT" />
            <el-tab-pane label="公告" name="ANNOUNCEMENT" />
          </el-tabs>
          <div>
            <el-button size="small" :disabled="!noti.unread" @click="onMarkAllRead">全部标已读</el-button>
            <el-button size="small" @click="onClearRead" plain>清理已读</el-button>
          </div>
        </div>
      </template>

      <div v-if="!noti.list.length" class="empty muted">暂无消息</div>

      <div v-else>
        <div
          v-for="n in noti.list"
          :key="n.id"
          :class="['msg-row', !n.readAt && 'unread']"
        >
          <div class="msg-icon" :style="{ color: metaColor(n.meta?.color) }">{{ n.meta?.icon || '·' }}</div>
          <div class="msg-body">
            <div class="msg-title">
              <b>{{ n.title }}</b>
              <el-tag v-if="!n.readAt" type="primary" size="small" effect="plain" style="margin-left: 6px">新</el-tag>
              <el-tag size="small" effect="plain" style="margin-left: 6px">{{ n.meta?.label || n.type }}</el-tag>
            </div>
            <div class="msg-text muted">{{ n.body || '点击查看详情 →' }}</div>
            <div class="msg-time muted">{{ formatTime(n.createdAt) }}</div>
          </div>
          <div class="msg-actions">
            <el-button v-if="!n.readAt" size="small" text type="primary" @click="onRead(n)">标已读</el-button>
            <el-button v-if="canJump(n)" size="small" type="primary" plain @click="onJump(n)">查看</el-button>
            <el-button size="small" text type="danger" @click="onRemove(n)">删除</el-button>
          </div>
        </div>

        <el-pagination
          v-if="noti.total > noti.size"
          :total="noti.total"
          :page-size="noti.size"
          :current-page="noti.page"
          layout="prev, pager, next, total"
          @current-change="onPageChange"
          style="margin-top: 12px; justify-content: center; display: flex"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowLeft } from '@element-plus/icons-vue';
import { ElMessageBox, ElMessage } from 'element-plus';
import { useNotificationStore } from '@/stores/notification';

const noti = useNotificationStore();
const router = useRouter();
const activeTab = ref('ALL');

const TAB_TO_TYPE = {
  APPROVAL: 'PLAN_REJECTED,PLAN_ADVANCED,PLAN_PUBLISHED,NEW_TASK',
  AI: 'AI_REPORT_DONE',
  DEPT: 'DEPT_PLAN_SUBMITTED',
  ANNOUNCEMENT: 'ANNOUNCEMENT',
};

const COLORS = {
  primary: '#409eff', success: '#67c23a', warning: '#e6a23c',
  danger: '#f56c6c', info: '#909399',
};
function metaColor(c) { return COLORS[c] || COLORS.info; }

function formatTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function canJump(n) {
  return n.targetType === 'Plan' || n.targetType === 'Announcement';
}

function buildQuery() {
  const q = {};
  if (activeTab.value === 'UNREAD') q.read = false;
  if (TAB_TO_TYPE[activeTab.value]) q.type = TAB_TO_TYPE[activeTab.value];
  return q;
}

async function onTabChange() {
  await noti.fetchList(buildQuery());
}

async function onPageChange(p) {
  await noti.fetchList({ ...buildQuery(), page: p });
}

async function onRead(n) {
  await noti.markRead(n.id);
  ElMessage.success('已标为已读');
}

async function onJump(n) {
  if (!n.readAt) await noti.markRead(n.id);
  if (n.targetType === 'Plan') router.push(`/plans/${n.targetId}`);
  else if (n.targetType === 'Announcement') router.push(`/messages?announcement=${n.targetId}`);
}

async function onRemove(n) {
  await noti.remove(n.id);
  ElMessage.success('已删除');
}

async function onMarkAllRead() {
  await noti.markAllRead(TAB_TO_TYPE[activeTab.value] || undefined);
  ElMessage.success('全部已读');
}

async function onClearRead() {
  await ElMessageBox.confirm('将删除所有已读消息，确定？', '清理已读', { type: 'warning' });
  const r = await noti.clearRead();
  ElMessage.success(`已清理 ${r.deleted} 条`);
}

onMounted(() => {
  noti.fetchList(buildQuery());
});
</script>

<style scoped>
.empty { text-align: center; padding: 48px 0; font-size: 14px; }
.msg-row {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 14px 8px; border-bottom: 1px solid #f5f7fa;
  transition: background 0.15s;
}
.msg-row:hover { background: #fafafa; }
.msg-row.unread { background: #ecf5ff; }
.msg-icon { font-size: 22px; line-height: 1; padding-top: 2px; min-width: 24px; text-align: center; }
.msg-body { flex: 1; min-width: 0; }
.msg-title { font-size: 14px; }
.msg-text { font-size: 12px; margin-top: 4px; line-height: 1.5; }
.msg-time { font-size: 11px; margin-top: 4px; }
.msg-actions { display: flex; flex-direction: column; gap: 4px; flex-shrink: 0; }
:deep(.el-tabs__header) { margin-bottom: 0; }
:deep(.el-tabs__nav-wrap::after) { display: none; }
</style>
