<template>
  <div class="page">
    <el-card>
      <template #header>
        <span style="font-weight: 600">我的待办（{{ tasks.length }}）</span>
      </template>
      <el-empty v-if="tasks.length === 0" description="暂无待办" />
      <el-table v-else :data="tasks" v-loading="loading" stripe>
        <el-table-column prop="id" label="任务ID" width="80" />
        <el-table-column label="方案名称" min-width="240">
          <template #default="{ row }">
            <el-link type="primary" @click="$router.push(`/plans/${row.planId}`)">{{ row.plan.name }}</el-link>
          </template>
        </el-table-column>
        <el-table-column prop="plan.code" label="专业代码" width="100" />
        <el-table-column prop="plan.major" label="专业" width="120" />
        <el-table-column prop="plan.department.name" label="院系" width="120" />
        <el-table-column prop="plan.createdBy.name" label="发起人" width="100" />
        <el-table-column prop="nodeName" label="节点" width="100">
          <template #default="{ row }">
            <el-tag :type="row.roleRequired === 'DEAN' ? 'success' : row.roleRequired === 'ACADEMIC' ? 'warning' : 'danger'" size="small">
              {{ row.nodeName }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="到达时间" width="160">
          <template #default="{ row }">{{ formatTime(row.arrivedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100" align="center" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" @click="$router.push(`/plans/${row.planId}`)">去审批</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import request from '@/api/request';

const tasks = ref([]);
const loading = ref(false);
const formatTime = (t) => t ? new Date(t).toLocaleString('zh-CN') : '-';

async function load() {
  loading.value = true;
  try { tasks.value = await request.get('/tasks/my-detailed'); }
  finally { loading.value = false; }
}
onMounted(load);
</script>
