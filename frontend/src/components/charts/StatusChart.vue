<template>
  <el-card shadow="hover">
    <template #header>
      <span style="font-weight: 600">方案状态分布</span>
    </template>
    <div ref="chartRef" v-loading="loading" class="chart-box">
      <div v-if="!loading && data.length === 0" class="empty">暂无数据</div>
    </div>
  </el-card>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
import * as echarts from 'echarts/core';
import { dashboardApi } from '@/api/dashboard';

const chartRef = ref(null);
const loading = ref(false);
const data = ref([]);
let chartInstance = null;

const STATUS_LABEL = {
  DRAFT: '草稿',
  DEPT_REVIEW: '院长审核',
  ACADEMIC_REVIEW: '教务审核',
  PRESIDENT_REVIEW: '校长审核',
  PUBLISHED: '已发布',
  REJECTED: '已驳回',
};
const STATUS_COLOR = {
  DRAFT: '#909399',
  DEPT_REVIEW: '#e6a23c',
  ACADEMIC_REVIEW: '#409eff',
  PRESIDENT_REVIEW: '#f56c6c',
  PUBLISHED: '#67c23a',
  REJECTED: '#dcdfe6',
};

async function load() {
  loading.value = true;
  try {
    const dist = await dashboardApi.byStatus();
    data.value = Object.entries(dist).map(([k, v]) => ({
      name: STATUS_LABEL[k] || k,
      value: v,
      itemStyle: { color: STATUS_COLOR[k] || '#409eff' },
    }));
    await nextTick();
    render();
  } finally {
    loading.value = false;
  }
}

function render() {
  if (!chartRef.value) return;
  if (data.value.length === 0) {
    if (chartInstance) {
      chartInstance.dispose();
      chartInstance = null;
    }
    return;
  }
  if (!chartInstance) chartInstance = echarts.init(chartRef.value);
  chartInstance.setOption({
    tooltip: { trigger: 'item' },
    legend: { bottom: 0 },
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: true,
        label: { show: true, formatter: '{b}\n{c}' },
        data: data.value,
      },
    ],
  });
}

function onResize() {
  chartInstance?.resize();
}

onMounted(() => {
  load();
  window.addEventListener('resize', onResize);
});
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  chartInstance?.dispose();
  chartInstance = null;
});
</script>

<style scoped>
.chart-box { width: 100%; height: 260px; position: relative; }
.empty { color: #909399; text-align: center; padding-top: 100px; }
</style>
