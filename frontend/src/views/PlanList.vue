<template>
  <div class="page">
    <el-card>
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <span style="font-weight: 600">培养方案</span>
          <el-button v-if="user.role === 'TEACHER'" type="primary" @click="$router.push('/plans/new')">+ 新建方案</el-button>
        </div>
      </template>
      <el-form :inline="true" :model="filter" @submit.prevent>
        <el-form-item label="关键字">
          <el-input v-model="filter.keyword" placeholder="名称/专业/代码" clearable @change="load" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filter.status" clearable placeholder="全部" style="width: 160px" @change="load">
            <el-option v-for="(v, k) in STATUS" :key="k" :label="v.label" :value="k" />
          </el-select>
        </el-form-item>
      </el-form>
      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="name" label="方案名称" min-width="200" show-overflow-tooltip />
        <el-table-column prop="code" label="专业代码" width="100" />
        <el-table-column prop="major" label="专业" width="120" />
        <el-table-column prop="versionYear" label="版本" width="80" />
        <el-table-column prop="department.name" label="院系" width="120" />
        <el-table-column prop="createdBy.name" label="发起人" width="100" />
        <el-table-column label="状态" width="110">
          <template #default="{ row }"><status-tag :status="row.status" /></template>
        </el-table-column>
        <el-table-column label="操作" width="100" align="center" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" @click="$router.push(`/plans/${row.id}`)">查看</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import request from '@/api/request';
import { useUserStore } from '@/stores/user';
import StatusTag from '@/components/StatusTag.vue';

const user = useUserStore();
const list = ref([]);
const loading = ref(false);
const filter = reactive({ keyword: '', status: '' });

const STATUS = {
  DRAFT: { label: '草稿' }, DEPT_REVIEW: { label: '院长审批' },
  ACADEMIC_REVIEW: { label: '教务处审核' }, PRESIDENT_REVIEW: { label: '校长签发' },
  PUBLISHED: { label: '已发布' },
};

async function load() {
  loading.value = true;
  try {
    const params = {};
    if (filter.keyword) params.keyword = filter.keyword;
    if (filter.status) params.status = filter.status;
    list.value = await request.get('/plans', { params });
  } finally { loading.value = false; }
}
onMounted(load);
</script>
