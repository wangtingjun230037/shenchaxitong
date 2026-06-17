<template>
  <el-container style="height: 100vh">
    <el-aside width="220px" class="aside">
      <div class="logo">
        <span style="font-size: 20px">🎓</span>
        <div>
          <div style="font-weight: 600; line-height: 1.2">人才培养方案</div>
          <div style="font-size: 12px; color: #c0c4cc">智能审核系统</div>
        </div>
      </div>
      <el-menu :default-active="active" router :collapse="false" background-color="#001529" text-color="#c0c4cc" active-text-color="#fff">
        <el-menu-item index="/dashboard"><el-icon><DataLine /></el-icon><span>工作台</span></el-menu-item>
        <el-menu-item index="/plans"><el-icon><Document /></el-icon><span>培养方案</span></el-menu-item>
        <el-menu-item index="/messages"><el-icon><ChatLineRound /></el-icon><span>消息中心</span></el-menu-item>
        <el-menu-item v-if="user.canApprove" index="/tasks"><el-icon><Bell /></el-icon><span>我的待办</span></el-menu-item>
        <el-menu-item v-if="user.isAdmin" index="/admin/users"><el-icon><User /></el-icon><span>用户管理</span></el-menu-item>
        <el-menu-item v-if="user.isAdmin" index="/admin/announcements"><el-icon><Promotion /></el-icon><span>公告管理</span></el-menu-item>
        <el-menu-item v-if="user.isAdmin" index="/admin/workflows"><el-icon><Share /></el-icon><span>流程管理</span></el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="topbar">
        <div></div>
        <div style="display: flex; align-items: center; gap: 16px">
          <notification-bell />
          <el-dropdown @command="onCommand">
            <span class="user-chip">
              <el-avatar :size="28" style="margin-right: 8px">{{ avatarText }}</el-avatar>
              {{ user.info?.name }}
              <el-tag size="small" :type="roleTagType" effect="plain" style="margin-left: 6px">{{ roleLabel }}</el-tag>
              <el-icon style="margin-left: 6px"><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>
      <el-main>
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';
import { useUserStore } from '@/stores/user';
import { useNotificationStore } from '@/stores/notification';
import NotificationBell from '@/components/NotificationBell.vue';
import { Share } from '@element-plus/icons-vue';

const user = useUserStore();
const noti = useNotificationStore();
const route = useRoute();
const active = computed(() => route.path);

const ROLE_LABELS = { TEACHER: '专业带头人', DEAN: '院长', ACADEMIC: '教务处', PRESIDENT: '校长', ADMIN: '管理员' };
const roleLabel = computed(() => ROLE_LABELS[user.role] || user.role);
const roleTagType = computed(() => ({ DEAN: 'success', ACADEMIC: 'warning', PRESIDENT: 'danger', ADMIN: 'info' }[user.role] || ''));
const avatarText = computed(() => (user.info?.name || '?')[0]);

function onCommand(cmd) { if (cmd === 'logout') user.logout(); }

onMounted(() => noti.startPolling());
onBeforeUnmount(() => noti.stopPolling());
</script>

<style scoped>
.aside { background: #001529; color: #fff; }
.logo { display: flex; gap: 10px; align-items: center; padding: 16px; color: #fff; border-bottom: 1px solid #1f2d3d; }
.topbar { display: flex; align-items: center; justify-content: space-between; background: #fff; border-bottom: 1px solid #ebeef5; }
.user-chip { display: flex; align-items: center; cursor: pointer; color: #303133; }
.el-menu { border-right: none; }
</style>
