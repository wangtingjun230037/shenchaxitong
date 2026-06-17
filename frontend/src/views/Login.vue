<template>
  <div class="login-wrap">
    <div class="login-card">
      <div class="title">
        <div style="font-size: 32px">🎓</div>
        <h2>人才培养方案智能审核系统</h2>
        <p class="muted">AI 辅助审查 · 全生命周期线上审批闭环</p>
      </div>
      <el-form :model="form" :rules="rules" ref="formRef" label-position="top" @submit.prevent>
        <el-form-item label="账号" prop="username">
          <el-input v-model="form.username" placeholder="请输入账号" size="large" prefix-icon="User" />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input v-model="form.password" placeholder="请输入密码" size="large" type="password" prefix-icon="Lock" show-password @keyup.enter="submit" />
        </el-form-item>
        <el-button type="primary" size="large" style="width: 100%" :loading="loading" @click="submit">登 录</el-button>
      </el-form>
      <el-divider>演示账号（密码均为 123456）</el-divider>
      <div class="quick">
        <el-tag v-for="a in accounts" :key="a.u" :type="a.type" effect="plain" style="cursor: pointer; margin: 4px" @click="quickFill(a)">
          {{ a.label }} · {{ a.u }}
        </el-tag>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useUserStore } from '@/stores/user';

const router = useRouter();
const user = useUserStore();
const formRef = ref();
const loading = ref(false);
const form = reactive({ username: '', password: '123456' });
const rules = {
  username: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
};

const accounts = [
  { u: 'teacher_zhang', label: '专业带头人', type: '' },
  { u: 'dean_li', label: '院长', type: 'success' },
  { u: 'academic_wang', label: '教务处', type: 'warning' },
  { u: 'president_zhao', label: '校长', type: 'danger' },
  { u: 'admin', label: '管理员', type: 'info' },
];

function quickFill(a) { form.username = a.u; form.password = '123456'; }

async function submit() {
  await formRef.value.validate();
  loading.value = true;
  try {
    await user.login({ username: form.username, password: form.password });
    ElMessage.success('登录成功');
    router.replace('/dashboard');
  } catch (e) { /* 拦截器已提示 */ }
  finally { loading.value = false; }
}
</script>

<style scoped>
.login-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #1e3c72 0%, #2a5298 50%, #4a90e2 100%); }
.login-card { width: 420px; padding: 32px; background: #fff; border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,0.18); }
.title { text-align: center; margin-bottom: 20px; }
.title h2 { margin: 8px 0 4px; color: #303133; }
.quick { display: flex; flex-wrap: wrap; justify-content: center; }
</style>
