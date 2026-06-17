<template>
  <div class="page">
    <div class="page-header">
      <h2>流程配置</h2>
      <el-button v-if="isAdmin" type="primary" @click="onCreate">+ 新建工作流</el-button>
    </div>

    <el-tabs v-model="status" @tab-change="load">
      <el-tab-pane label="启用中" name="ACTIVE" />
      <el-tab-pane v-if="isAdmin" label="已归档" name="ARCHIVED" />
    </el-tabs>

    <el-empty v-if="!loading && list.length === 0" description="暂无工作流" />
    <div v-else class="grid">
      <div v-for="w in list" :key="w.id" class="card">
        <div class="card-head">
          <span class="title">{{ w.name }}</span>
          <el-tag v-if="w.status === 'ARCHIVED'" type="info" size="small">已归档</el-tag>
        </div>
        <div class="desc">{{ w.description || '无描述' }}</div>
        <div class="meta">
          <span>节点：{{ w.nodeCount }}</span>
          <span>关联方案：{{ w.planCount }}</span>
          <span>{{ formatTime(w.createdAt) }}</span>
        </div>
        <div class="actions">
          <el-button text type="primary" @click="onView(w)">查看</el-button>
          <el-button v-if="isAdmin && w.status === 'ACTIVE'" text type="primary" @click="onEdit(w)">编辑</el-button>
          <el-button v-if="isAdmin && w.status === 'ACTIVE'" text type="danger" @click="onArchive(w)">归档</el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { workflowApi } from '@/api/workflows';
import { useUserStore } from '@/stores/user';

const router = useRouter();
const user = useUserStore();
const isAdmin = computed(() => user.role === 'ADMIN');

const list = ref([]);
const loading = ref(false);
const status = ref('ACTIVE');

async function load() {
  loading.value = true;
  try {
    list.value = await workflowApi.list();
  } finally {
    loading.value = false;
  }
}

function onCreate() {
  router.push({ path: '/admin/workflows/new' });
}
function onEdit(w) {
  router.push({ path: `/admin/workflows/${w.id}`, query: { edit: 1 } });
}
function onView(w) {
  router.push({ path: `/admin/workflows/${w.id}` });
}
async function onArchive(w) {
  try {
    await ElMessageBox.confirm(`确认归档【${w.name}】？归档后创建方案时不可选，但老方案不受影响。`, '归档确认', { type: 'warning' });
    await workflowApi.archive(w.id);
    ElMessage.success('已归档');
    load();
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message || '归档失败');
  }
}

function formatTime(s) {
  if (!s) return '';
  return new Date(s).toLocaleString('zh-CN', { hour12: false });
}

onMounted(load);
</script>

<style scoped>
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
.card { background: #fff; border: 1px solid #ebeef5; border-radius: 6px; padding: 16px; }
.card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.title { font-weight: 600; font-size: 16px; }
.desc { color: #666; font-size: 13px; min-height: 36px; margin-bottom: 8px; }
.meta { display: flex; gap: 12px; color: #999; font-size: 12px; margin-bottom: 12px; }
.actions { display: flex; gap: 8px; }
</style>
