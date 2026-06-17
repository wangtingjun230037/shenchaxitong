<template>
  <div class="page" v-loading="loading">
    <el-page-header :icon="ArrowLeft" @back="$router.back()" style="margin-bottom: 12px">
      <template #content><span style="font-size: 18px; font-weight: 600">系统公告管理</span></template>
    </el-page-header>

    <el-card class="box-card">
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <span style="color: #606266; font-size: 13px">共 {{ total }} 条</span>
          <el-button type="primary" :icon="Plus" @click="openCreate">发布新公告</el-button>
        </div>
      </template>

      <el-table :data="items" stripe>
        <el-table-column prop="title" label="标题" min-width="220" show-overflow-tooltip />
        <el-table-column label="正文" min-width="240">
          <template #default="{ row }">
            <span class="muted" style="font-size: 12px">{{ (row.body || '').slice(0, 60) }}{{ row.body && row.body.length > 60 ? '…' : '' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="发布人" width="120">
          <template #default="{ row }">{{ row.publishedBy?.name || '-' }}</template>
        </el-table-column>
        <el-table-column label="发布时间" width="160">
          <template #default="{ row }">{{ formatTime(row.publishedAt) }}</template>
        </el-table-column>
        <el-table-column label="过期时间" width="160">
          <template #default="{ row }">{{ row.expiresAt ? formatTime(row.expiresAt) : '永久' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'ACTIVE' ? 'success' : 'info'" size="small">
              {{ row.status === 'ACTIVE' ? '已发布' : '已撤回' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status === 'ACTIVE'" size="small" text type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button v-if="row.status === 'ACTIVE'" size="small" text type="danger" @click="onWithdraw(row)">撤回</el-button>
            <el-tag v-else size="small" type="info">已撤回</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 编辑/发布弹窗 -->
    <el-dialog v-model="dialogVisible" :title="editing ? '编辑公告' : '发布新公告'" width="560px" :close-on-click-modal="false">
      <el-form :model="form" :rules="rules" ref="formRef" label-width="80px">
        <el-form-item label="标题" prop="title">
          <el-input v-model="form.title" maxlength="100" show-word-limit placeholder="请输入公告标题" />
        </el-form-item>
        <el-form-item label="正文" prop="body">
          <el-input v-model="form.body" type="textarea" :rows="6" placeholder="请输入公告正文" />
        </el-form-item>
        <el-form-item label="过期时间">
          <el-date-picker
            v-model="form.expiresAt"
            type="datetime"
            placeholder="不填则永久有效"
            value-format="YYYY-MM-DDTHH:mm:ss[Z]"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="onSubmit">{{ editing ? '保存' : '发布并通知' }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, reactive } from 'vue';
import { ArrowLeft, Plus } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { announcementsApi } from '@/api/notifications';

const loading = ref(false);
const submitting = ref(false);
const items = ref([]);
const total = ref(0);

const dialogVisible = ref(false);
const editing = ref(null);
const formRef = ref(null);
const form = reactive({ title: '', body: '', expiresAt: null });
const rules = {
  title: [{ required: true, message: '请输入标题', trigger: 'blur' }],
  body: [{ required: true, message: '请输入正文', trigger: 'blur' }],
};

function formatTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

async function fetchList() {
  loading.value = true;
  try {
    const r = await announcementsApi.listAll();
    items.value = r.items || [];
    total.value = r.total;
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editing.value = null;
  Object.assign(form, { title: '', body: '', expiresAt: null });
  dialogVisible.value = true;
}

function openEdit(row) {
  editing.value = row;
  Object.assign(form, {
    title: row.title,
    body: row.body,
    expiresAt: row.expiresAt,
  });
  dialogVisible.value = true;
}

async function onSubmit() {
  await formRef.value.validate();
  submitting.value = true;
  try {
    if (editing.value) {
      await announcementsApi.update(editing.value.id, form);
      ElMessage.success('已保存');
    } else {
      await announcementsApi.publish(form);
      ElMessage.success('已发布，全体用户将收到通知');
    }
    dialogVisible.value = false;
    fetchList();
  } finally {
    submitting.value = false;
  }
}

async function onWithdraw(row) {
  await ElMessageBox.confirm(`确认撤回公告「${row.title}」？`, '撤回公告', { type: 'warning' });
  await announcementsApi.withdraw(row.id);
  ElMessage.success('已撤回');
  fetchList();
}

onMounted(fetchList);
</script>
