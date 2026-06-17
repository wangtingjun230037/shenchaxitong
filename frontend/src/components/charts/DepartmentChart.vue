<template>
  <el-card shadow="hover">
    <template #header>
      <span style="font-weight: 600">各院系方案数（TOP 10）</span>
    </template>
    <div ref="chartRef" v-loading="loading" class="chart-box">
      <div v-if="!loading && data.length === 0" class="empty">暂无数据</div>
    </div>
  </el-card>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import * as echarts from 'echarts/core';
import { dashboardApi } from '@/api/dashboard';

const chartRef = ref(null);
const loading = ref(false);
const data = ref([]);
let chartInstance = null;

async function load() {
  loading.value = true;
  try {
    data.value = await dashboardApi.byDepartment();
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
  const names = data.value.map((d) => d.departmentName);
  const counts = data.value.map((d) => d.count);
  chartInstance.setOption({
    grid: { left: 100, right: 30, top: 10, bottom: 30 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: { type: 'value', minInterval: 1 },
    yAxis: { type: 'category', data: names.reverse(), inverse: false },
    series: [
      {
        type: 'bar',
        data: counts.reverse(),
        itemStyle: { color: '#409eff', borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: 'right' },
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
