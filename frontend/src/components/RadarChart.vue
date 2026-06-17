<template>
  <div class="radar-wrap">
    <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`">
      <!-- 4 维网格圈层 -->
      <polygon
        v-for="r in [0.25, 0.5, 0.75, 1]"
        :key="r"
        :points="ringPoints(r)"
        fill="none"
        :stroke="r === 1 ? '#dcdfe6' : '#ebeef5'"
        stroke-width="1"
      />
      <!-- 轴线 -->
      <line
        v-for="(p, i) in axisPoints"
        :key="`ax${i}`"
        :x1="center" :y1="center"
        :x2="p.x" :y2="p.y"
        stroke="#dcdfe6" stroke-width="1"
      />
      <!-- 数据多边形 -->
      <polygon
        v-if="dataPoints.length"
        :points="dataPoints.map((p) => `${p.x},${p.y}`).join(' ')"
        fill="rgba(64, 158, 255, 0.25)"
        stroke="#409eff"
        stroke-width="2"
      />
      <!-- 顶点圆点 -->
      <circle
        v-for="(p, i) in dataPoints"
        :key="`d${i}`"
        :cx="p.x" :cy="p.y" r="3"
        fill="#409eff"
      />
      <!-- 顶点标签 -->
      <text
        v-for="(p, i) in labelPoints"
        :key="`l${i}`"
        :x="p.x" :y="p.y"
        :text-anchor="p.anchor"
        :dy="p.dy"
        font-size="13"
        fill="#606266"
      >{{ labels[i] }}</text>
      <!-- 顶点数值 -->
      <text
        v-for="(p, i) in dataPoints"
        :key="`v${i}`"
        :x="labelPoints[i].x" :y="labelPoints[i].y - 14"
        :text-anchor="labelPoints[i].anchor"
        font-size="11"
        fill="#409eff"
        font-weight="600"
      >{{ values[i] }}</text>
    </svg>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  scores: { type: Object, default: () => ({}) },
  size: { type: Number, default: 220 },
});

const labels = ['岗-课', '岗-证', '岗-赛', '内部一致'];
const values = computed(() => {
  const s = props.scores || {};
  return [
    s.position_course ?? 0,
    s.position_certificate ?? 0,
    s.position_competition ?? 0,
    s.internal_consistency ?? 0,
  ];
});

const center = computed(() => props.size / 2);
const radius = computed(() => props.size / 2 - 28);

// 4 个轴端点（顺时针：上、右、下、左）
const axisPoints = computed(() => {
  return [0, 1, 2, 3].map((i) => {
    const angle = (Math.PI * 2 * i) / 4 - Math.PI / 2;
    return { x: center.value + radius.value * Math.cos(angle), y: center.value + radius.value * Math.sin(angle) };
  });
});

const dataPoints = computed(() => {
  return values.value.map((v, i) => {
    const angle = (Math.PI * 2 * i) / 4 - Math.PI / 2;
    const r = radius.value * (Math.max(0, Math.min(100, v)) / 100);
    return { x: center.value + r * Math.cos(angle), y: center.value + r * Math.sin(angle) };
  });
});

const labelPoints = computed(() => {
  return [0, 1, 2, 3].map((i) => {
    const angle = (Math.PI * 2 * i) / 4 - Math.PI / 2;
    const r = radius.value + 16;
    const x = center.value + r * Math.cos(angle);
    const y = center.value + r * Math.sin(angle);
    let anchor = 'middle', dy = 0;
    if (i === 0) { anchor = 'middle'; dy = -4; }
    if (i === 1) { anchor = 'start'; dy = 4; }
    if (i === 2) { anchor = 'middle'; dy = 14; }
    if (i === 3) { anchor = 'end'; dy = 4; }
    return { x, y, anchor, dy };
  });
});

function ringPoints(ratio) {
  return [0, 1, 2, 3].map((i) => {
    const angle = (Math.PI * 2 * i) / 4 - Math.PI / 2;
    const r = radius.value * ratio;
    return `${center.value + r * Math.cos(angle)},${center.value + r * Math.sin(angle)}`;
  }).join(' ');
}
</script>

<style scoped>
.radar-wrap { display: inline-block; }
</style>
