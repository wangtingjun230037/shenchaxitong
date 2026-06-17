<template>
  <el-tag :type="cfg.type" effect="light" size="small">
    {{ cfg.label }}
  </el-tag>
</template>

<script setup>
import { computed } from 'vue';
const props = defineProps({ status: String });
const MAP = {
  DRAFT:            { label: '草稿',     type: 'info' },
  DEPT_REVIEW:      { label: '院长审批', type: 'success' },
  ACADEMIC_REVIEW:  { label: '教务处审核', type: 'warning' },
  PRESIDENT_REVIEW: { label: '校长签发', type: 'danger' },
  PUBLISHED:        { label: '已发布',   type: '' },
};
const cfg = computed(() => MAP[props.status] || { label: props.status, type: '' });
</script>
