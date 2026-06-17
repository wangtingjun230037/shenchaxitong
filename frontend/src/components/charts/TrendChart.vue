<template>
  <el-card shadow="hover">
    <template #header>
      <div class="chart-header">
        <span style="font-weight: 600">提交/发布趋势</span>
        <el-radio-group v-model="range" size="small" @change="load">
          <el-radio-button label="7d">7天</el-radio-button>
          <el-radio-button label="30d">30天</el-radio-button>
          <el-radio-button label="90d">90天</el-radio-button>
          <el-radio-button label="180d">180天</el-radio-button>
          <el-radio-button label="1y">1年</el-radio-button>
        </el-radio-group>
      </div>
    </template>
    <div ref="chartRef" v-loading="loading" class="chart-box"></div>
  </el-card>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import * as echarts from 'echarts/core';
import { dashboardApi } from '@/api/dashboard';

const chartRef = ref(null);
const loading = ref(false);
const range = ref('30d');
let chartInstance = null;

async function load() {
  loading.value = true;
  try {
    const data = await dashboardApi.trend(range.value);
    await nextTick();
    render(data);
  } finally {
    loading.value = false;
  }
}

function render(data) {
  if (!chartRef.value) return;
  if (!chartInstance) chartInstance = echarts.init(chartRef.value);
  const xData = data.buckets.map((b) => b.key);
  const submitted = data.buckets.map((b) => b.submitted);
  const published = data.buckets.map((b) => b.published);
  chartInstance.setOption({
    grid: { left: 40, right: 20, top: 40, bottom: 40 },
    tooltip: { trigger: 'axis' },
    legend: { data: ['提交数', '发布数'], top: 0 },
    xAxis: {
      type: 'category',
      data: xData,
      axisLabel: {
        formatter: (v) => (data.granularity === 'month' ? v : v.substring(5)),
        interval: data.granularity === 'day' ? Math.floor(xData.length / 7) : 'auto',
      },
    },
    yAxis: { type: 'value', minInterval: 1 },
    series: [
      {
        name: '提交数',
        type: 'line',
        smooth: true,
        data: submitted,
        itemStyle: { color: '#409eff' },
        areaStyle: { opacity: 0.15 },
      },
      {
        name: '发布数',
        type: 'line',
        smooth: true,
        data: published,
        itemStyle: { color: '#67c23a' },
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

defineExpose({ reload: load });
</script>

<style scoped>
.chart-header { display: flex; justify-content: space-between; align-items: center; }
.chart-box { width: 100%; height: 260px; }
</style>
