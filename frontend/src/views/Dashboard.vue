<template>
  <div class="page">
    <!-- 1) 顶部 4 个数字卡片 -->
    <el-row :gutter="16">
      <el-col :span="6">
        <stat-card label="方案总数" :value="summary.total" color="#409eff" icon="Document" />
      </el-col>
      <el-col :span="6">
        <stat-card label="审批中" :value="summary.inReview" color="#e6a23c" icon="Loading" />
      </el-col>
      <el-col :span="6">
        <stat-card label="已发布" :value="summary.published" color="#67c23a" icon="CircleCheck" />
      </el-col>
      <el-col :span="6">
        <stat-card label="我的待办" :value="summary.myTasks" color="#f56c6c" icon="Bell" />
      </el-col>
    </el-row>

    <!-- 2) 2x2 图表 -->
    <el-row :gutter="16" style="margin-top: 16px">
      <el-col :span="12">
        <trend-chart />
      </el-col>
      <el-col :span="12">
        <department-chart />
      </el-col>
    </el-row>
    <el-row :gutter="16" style="margin-top: 16px">
      <el-col :span="12">
        <status-chart />
      </el-col>
      <el-col :span="12">
        <funnel-chart />
      </el-col>
    </el-row>

    <!-- 3) 原结构：最近方案 + 待办/说明 -->
    <el-row :gutter="16" style="margin-top: 16px">
      <el-col :span="14">
        <el-card>
          <template #header>
            <div style="display: flex; justify-content: space-between; align-items: center">
              <span style="font-weight: 600">最近方案</span>
              <el-button text @click="$router.push('/plans')">查看全部</el-button>
            </div>
          </template>
          <el-table :data="recent" stripe>
            <el-table-column prop="name" label="方案名称" min-width="180" show-overflow-tooltip />
            <el-table-column prop="department.name" label="院系" width="120" />
            <el-table-column label="状态" width="100">
              <template #default="{ row }"><status-tag :status="row.status" /></template>
            </el-table-column>
            <el-table-column label="操作" width="80" align="center">
              <template #default="{ row }">
                <el-button text type="primary" @click="$router.push(`/plans/${row.id}`)">查看</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="10">
        <el-card>
          <template #header><span style="font-weight: 600">{{ user.canApprove ? '我的待办' : '系统说明' }}</span></template>
          <div v-if="user.canApprove">
            <div v-if="tasks.length === 0" class="muted" style="padding: 12px 0">暂无待办 ✓</div>
            <div v-for="t in tasks" :key="t.id" class="task-item" @click="$router.push(`/plans/${t.planId}`)">
              <div>
                <div style="font-weight: 500">{{ t.plan.name }}</div>
                <div class="muted" style="font-size: 12px">{{ t.nodeName }} · {{ t.plan.department?.name }} · {{ t.plan.createdBy.name }} 提交</div>
              </div>
              <el-button text type="primary">去处理 →</el-button>
            </div>
          </div>
          <div v-else class="muted" style="line-height: 1.8">
            <p>本系统为 <b>人才培养方案智能审核</b> 系统，提供：</p>
            <p>✓ 表单填报 + Word 方案上传</p>
            <p>✓ 固定四步审批（发起 → 院长 → 教务 → 校长）</p>
            <p>✓ AI 政策合规性 + 岗课赛证智能审核</p>
            <p>✓ 用户与组织管理 + 站内通知</p>
            <p style="margin-top: 12px">点击左侧 <b>培养方案</b> 开始填报。</p>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import request from '@/api/request';
import { dashboardApi } from '@/api/dashboard';
import { useUserStore } from '@/stores/user';
import StatusTag from '@/components/StatusTag.vue';
import StatCard from '@/components/charts/StatCard.vue';
import TrendChart from '@/components/charts/TrendChart.vue';
import DepartmentChart from '@/components/charts/DepartmentChart.vue';
import StatusChart from '@/components/charts/StatusChart.vue';
import FunnelChart from '@/components/charts/FunnelChart.vue';

const user = useUserStore();
const plans = ref([]);
const tasks = ref([]);
const summary = ref({ total: 0, inReview: 0, published: 0, myTasks: 0 });
const recent = ref([]);

onMounted(async () => {
  const [summaryData, plansData, tasksData] = await Promise.all([
    dashboardApi.summary().catch(() => ({ total: 0, inReview: 0, published: 0, myTasks: 0 })),
    request.get('/plans').catch(() => []),
    user.canApprove ? request.get('/tasks/my-detailed').catch(() => []) : Promise.resolve([]),
  ]);
  summary.value = summaryData;
  plans.value = plansData;
  tasks.value = tasksData;
  recent.value = plansData.slice(0, 5);
});
</script>

<style scoped>
.task-item { display: flex; align-items: center; justify-content: space-between; padding: 10px 8px; border-bottom: 1px solid #f0f0f0; cursor: pointer; }
.task-item:hover { background: #f5f7fa; }
.task-item:last-child { border-bottom: none; }
</style>
