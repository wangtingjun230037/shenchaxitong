<template>
  <div class="lifecycle-timeline" v-loading="loading">
    <!-- 顶部统计行 + 过滤 -->
    <div class="lifecycle-header">
      <div class="stats">
        <span><b>总耗时</b> {{ stats.totalDuration || '-' }}</span>
        <span class="dot">·</span>
        <span><b>通过</b> {{ stats.approvedCount }} 节点</span>
        <span class="dot">·</span>
        <span :class="stats.rejectedCount > 0 ? 'rejected-text' : ''">
          <b>驳回</b> {{ stats.rejectedCount }} 次
        </span>
        <span v-if="stats.publishedAt" class="dot">·</span>
        <span v-if="stats.publishedAt" class="published-text">✓ 已发布</span>
      </div>
      <el-select v-model="filterType" size="small" style="width: 140px" placeholder="筛选">
        <el-option label="全部事件" value="" />
        <el-option label="审批事件" value="approve" />
        <el-option label="AI 事件" value="ai" />
        <el-option label="提交/创建" value="submit" />
        <el-option label="文件事件" value="file" />
        <el-option label="驳回事件" value="reject" />
      </el-select>
    </div>

    <el-empty v-if="!loading && filteredEvents.length === 0" description="暂无事件" :image-size="60" />

    <el-timeline v-else class="event-list">
      <el-timeline-item
        v-for="ev in filteredEvents"
        :key="ev.id"
        :type="timelineType(ev.type)"
        :hollow="false"
        :timestamp="formatTime(ev.timestamp)"
        placement="top"
        :class="['event-item', ev.type === 'TASK_REJECTED' ? 'is-reject' : '']"
      >
        <div class="event-card">
          <div class="event-head">
            <span class="event-icon" :style="{ background: typeColor(ev.type) }">
              {{ typeIcon(ev.type) }}
            </span>
            <span class="event-title">{{ ev.summary }}</span>
            <el-tag v-if="ev.details?.score != null" size="small" :type="ev.details.score >= 80 ? 'success' : ev.details.score >= 60 ? 'warning' : 'danger'">
              得分 {{ ev.details.score }}
            </el-tag>
          </div>
          <div class="event-meta">
            <span v-if="ev.actor" class="actor">
              <b>{{ ev.actor.name }}</b>
              <span class="muted">· {{ roleLabel(ev.actor.role) }}</span>
            </span>
            <span v-else class="muted">系统</span>
            <span v-if="ev.details?.duration" class="muted">⏱ {{ ev.details.duration }}</span>
          </div>
          <div v-if="ev.details?.comment" class="event-comment">
            💬 {{ ev.details.comment }}
          </div>
          <div v-if="ev.details?.summary && ev.type.startsWith('AI_')" class="event-ai-summary">
            {{ ev.details.summary }}
          </div>
          <div v-if="ev.details?.errorMessage" class="event-error">
            ⚠ {{ ev.details.errorMessage }}
          </div>
        </div>
      </el-timeline-item>
    </el-timeline>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { planEventsApi } from '@/api/planEvents';

const props = defineProps({
  planId: { type: Number, required: true },
});

const loading = ref(false);
const events = ref([]);
const stats = ref({ totalDuration: '-', approvedCount: 0, rejectedCount: 0, publishedAt: null });
const filterType = ref('');

const ROLE_LABELS = {
  TEACHER: '专业带头人', DEAN: '院长', ACADEMIC: '教务处',
  PRESIDENT: '校长', ADMIN: '管理员',
};
const roleLabel = (r) => ROLE_LABELS[r] || r;

const TYPE_META = {
  PLAN_CREATED:        { icon: '📝', color: '#909399' },
  PLAN_UPDATED:        { icon: '✏️', color: '#909399' },
  FILE_UPLOADED:       { icon: '📤', color: '#409eff' },
  AI_COMPLIANCE_SUCCESS: { icon: '🤖', color: '#7c3aed' },
  AI_COMPLIANCE_FAILED:  { icon: '🤖', color: '#f56c6c' },
  AI_GANGLUO_SUCCESS:  { icon: '🧬', color: '#7c3aed' },
  AI_GANGLUO_FAILED:   { icon: '🧬', color: '#f56c6c' },
  PLAN_SUBMITTED:      { icon: '⬆', color: '#e6a23c' },
  TASK_APPROVED:       { icon: '✓', color: '#67c23a' },
  TASK_REJECTED:       { icon: '✗', color: '#f56c6c' },
  PLAN_PUBLISHED:      { icon: '🎉', color: '#67c23a' },
};
const typeIcon = (t) => TYPE_META[t]?.icon || '·';
const typeColor = (t) => TYPE_META[t]?.color || '#909399';

const timelineType = (t) => ({
  PLAN_CREATED: 'primary', PLAN_UPDATED: 'primary',
  FILE_UPLOADED: 'primary', AI_COMPLIANCE_SUCCESS: 'primary', AI_COMPLIANCE_FAILED: 'danger',
  AI_GANGLUO_SUCCESS: 'primary', AI_GANGLUO_FAILED: 'danger',
  PLAN_SUBMITTED: 'warning', TASK_APPROVED: 'success', TASK_REJECTED: 'danger',
  PLAN_PUBLISHED: 'success',
}[t] || 'primary');

const FILTER_GROUPS = {
  approve: ['TASK_APPROVED', 'TASK_REJECTED'],
  ai: ['AI_COMPLIANCE_SUCCESS', 'AI_COMPLIANCE_FAILED', 'AI_GANGLUO_SUCCESS', 'AI_GANGLUO_FAILED'],
  submit: ['PLAN_CREATED', 'PLAN_SUBMITTED'],
  file: ['FILE_UPLOADED'],
  reject: ['TASK_REJECTED'],
};

const filteredEvents = computed(() => {
  if (!filterType.value) return events.value;
  const group = FILTER_GROUPS[filterType.value] || [];
  return events.value.filter((e) => group.includes(e.type));
});

function formatTime(t) {
  if (!t) return '-';
  const d = new Date(t);
  return d.toLocaleString('zh-CN', { hour12: false });
}

async function load() {
  loading.value = true;
  try {
    const data = await planEventsApi.list(props.planId);
    events.value = data.events || [];
    stats.value = data.stats || stats.value;
  } catch (e) {
    console.warn('加载时间轴失败', e);
    events.value = [];
  } finally {
    loading.value = false;
  }
}

watch(() => props.planId, load);
onMounted(load);

defineExpose({ reload: load });
</script>

<style scoped>
.lifecycle-timeline { padding: 4px 0; }
.lifecycle-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px dashed #ebeef5;
}
.stats { display: flex; gap: 8px; align-items: center; font-size: 13px; color: #606266; }
.stats .dot { color: #c0c4cc; }
.stats .rejected-text { color: #f56c6c; }
.stats .published-text { color: #67c23a; font-weight: 600; }

.event-list { padding: 0 0 0 4px; }
.event-item :deep(.el-timeline-item__wrapper) { padding-left: 14px; }

.event-card {
  background: #fafbfc;
  border-left: 3px solid #ebeef5;
  border-radius: 4px;
  padding: 10px 14px;
  margin-bottom: 4px;
  transition: all 0.2s;
}
.event-card:hover { background: #f0f4f8; }
.is-reject .event-card {
  background: #fef0f0;
  border-left-color: #f56c6c;
}

.event-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.event-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;
}
.event-title { font-weight: 600; color: #303133; font-size: 14px; }

.event-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: #606266;
}
.event-meta .actor { display: inline-flex; gap: 4px; align-items: center; }
.event-meta .muted { color: #909399; }

.event-comment {
  margin-top: 6px;
  padding: 6px 10px;
  background: #fff;
  border-radius: 4px;
  color: #606266;
  font-size: 13px;
  border-left: 2px solid #dcdfe6;
}
.event-ai-summary {
  margin-top: 6px;
  color: #606266;
  font-size: 13px;
  line-height: 1.5;
}
.event-error {
  margin-top: 6px;
  color: #f56c6c;
  font-size: 12px;
}
</style>
