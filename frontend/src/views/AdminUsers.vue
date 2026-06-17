<template>
  <div class="page">
    <el-card>
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <span style="font-weight: 600">用户管理</span>
          <el-button type="primary" @click="openCreate">+ 新增用户</el-button>
        </div>
      </template>
      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="username" label="账号" width="140" />
        <el-table-column prop="name" label="姓名" width="120" />
        <el-table-column label="角色" width="120">
          <template #default="{ row }">
            <el-tag size="small" :type="roleType(row.role)">{{ ROLE_LABELS[row.role] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="department.name" label="部门" width="140" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'ACTIVE' ? 'success' : 'info'" size="small">
              {{ row.status === 'ACTIVE' ? '正常' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" align="center">
          <template #default="{ row }">
            <el-button v-if="row.status === 'ACTIVE'" size="small" text type="danger" @click="toggleStatus(row)">停用</el-button>
            <el-button v-else size="small" text type="primary" @click="toggleStatus(row)">启用</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialog" title="新增用户" width="480px">
      <el-form :model="form" :rules="rules" ref="formRef" label-width="80px">
        <el-form-item label="账号" prop="username"><el-input v-model="form.username" /></el-form-item>
        <el-form-item label="密码" prop="password"><el-input v-model="form.password" type="password" show-password /></el-form-item>
        <el-form-item label="姓名" prop="name"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="角色" prop="role">
          <el-select v-model="form.role" style="width: 100%">
            <el-option v-for="(label, key) in ROLE_LABELS" :key="key" :label="label" :value="key" />
          </el-select>
        </el-form-item>
        <el-form-item label="部门">
          <el-select v-model="form.departmentId" clearable style="width: 100%">
            <el-option v-for="d in departments" :key="d.id" :label="d.name" :value="d.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import request from '@/api/request';

const ROLE_LABELS = { TEACHER: '专业带头人', DEAN: '院长', ACADEMIC: '教务处', PRESIDENT: '校长', ADMIN: '管理员' };
const roleType = (r) => ({ DEAN: 'success', ACADEMIC: 'warning', PRESIDENT: 'danger', ADMIN: 'info' }[r] || '');

const list = ref([]);
const departments = ref([]);
const loading = ref(false);
const dialog = ref(false);
const saving = ref(false);
const formRef = ref();
const form = reactive({ username: '', password: '', name: '', role: 'TEACHER', departmentId: null });
const rules = {
  username: [{ required: true, message: '请输入账号' }],
  password: [{ required: true, min: 6, message: '密码至少 6 位' }],
  name: [{ required: true, message: '请输入姓名' }],
  role: [{ required: true, message: '请选择角色' }],
};

async function load() {
  loading.value = true;
  try { list.value = await request.get('/users'); }
  finally { loading.value = false; }
}

async function openCreate() {
  Object.assign(form, { username: '', password: '', name: '', role: 'TEACHER', departmentId: null });
  departments.value = await request.get('/departments');
  dialog.value = true;
}

async function submit() {
  await formRef.value.validate();
  saving.value = true;
  try {
    await request.post('/users', form);
    ElMessage.success('已创建');
    dialog.value = false;
    load();
  } finally { saving.value = false; }
}

async function toggleStatus(row) {
  const next = row.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
  try { await ElMessageBox.confirm(`确认${next === 'DISABLED' ? '停用' : '启用'}该用户？`, '提示', { type: 'warning' }); }
  catch (_) { return; }
  await request.put(`/users/${row.id}/status`, { status: next });
  ElMessage.success('操作成功');
  load();
}

onMounted(load);
</script>
