<template>
  <el-card shadow="hover" v-loading="loading">
    <div class="stat-card">
      <div class="stat-icon" :style="{ background: color }">
        <el-icon><component :is="icon" /></el-icon>
      </div>
      <div class="stat-info">
        <div class="stat-value">{{ value }}</div>
        <div class="stat-label">{{ label }}</div>
      </div>
    </div>
  </el-card>
</template>

<script setup>
defineProps({
  label: { type: String, required: true },
  value: { type: [Number, String], default: 0 },
  color: { type: String, default: '#409eff' },
  icon: { type: [String, Object], default: 'Document' },
  loading: { type: Boolean, default: false },
});
</script>

<style scoped>
.stat-card { display: flex; align-items: center; gap: 16px; }
.stat-icon {
  width: 56px; height: 56px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-size: 24px;
}
.stat-value { font-size: 26px; font-weight: 600; color: #303133; }
.stat-label { color: #909399; font-size: 13px; margin-top: 4px; }
</style>
