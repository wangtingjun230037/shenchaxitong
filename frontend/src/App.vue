<template>
  <router-view />
</template>

<script setup>
import { onMounted } from 'vue';
import { useUserStore } from '@/stores/user';

const user = useUserStore();
onMounted(() => {
  if (user.token && !user.info) user.fetchMe();
});
</script>
