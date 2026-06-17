<template>
  <el-card shadow="hover">
    <template #header>
      <span style="font-weight: 600">各角色审批积压</span>
    </template>
    <div ref="chartRef" v-loading="loading" class="chart-box">
      <div v-if="!loading && !hasPermission" class="empty">您无审批权限</div>
      <div v-else-if="!loading && data.length === 0" class="empty">暂无待办</div>
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
const hasPermission = ref(true);
let chartInstance = null;

async function load() {
  loading.value = true;
  try {
    const res = await dashboardApi.funnel();
    hasPermission.value = res.hasPermission;
    data.value = res.stages;
    await nextTick();
    render();
  } finally {
    loading.value = false;
  }
}

function render() {
  if (!chartRef.value) return;
  if (!hasPermission.value || data.value.length === 0) {
    if (chartInstance) {
      chartInstance.dispose();
      chartInstance = null;
    }
    return;
  }
  if (!chartInstance) chartInstance = echarts.init(chartRef.value);
  chartInstance.setOption({
    tooltip: { trigger: 'item' },
    series: [
      {
        type: 'funnel',
        left: 'center',
        top: 10,
        bottom: 10,
        width: '80%',
        sort: 'descending',
        gap: 4,
        label: { show: true, position: 'inside', formatter: '{b}\n{c}' },
        itemStyle: { borderColor: '#fff', borderWidth: 1 },
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
