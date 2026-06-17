import { createRouter, createWebHashHistory } from 'vue-router';
import { useUserStore } from '@/stores/user';
import { ElMessage } from 'element-plus';

const routes = [
  { path: '/login', component: () => import('@/views/Login.vue'), meta: { public: true } },
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    redirect: '/dashboard',
    children: [
      { path: 'dashboard', component: () => import('@/views/Dashboard.vue') },
      { path: 'plans', component: () => import('@/views/PlanList.vue') },
      { path: 'plans/new', component: () => import('@/views/PlanCreate.vue') },
      { path: 'plans/:id', component: () => import('@/views/PlanDetail.vue') },
      { path: 'plans/:id/edit', component: () => import('@/views/PlanCreate.vue') },
      { path: 'tasks', component: () => import('@/views/MyTasks.vue') },
      { path: 'messages', component: () => import('@/views/Notifications.vue') },
      { path: 'admin/users', component: () => import('@/views/AdminUsers.vue') },
      { path: 'admin/announcements', component: () => import('@/views/AdminAnnouncements.vue') },
      { path: 'admin/workflows', component: () => import('@/views/admin/WorkflowList.vue') },
      { path: 'admin/workflows/new', component: () => import('@/views/admin/WorkflowDesigner.vue') },
      { path: 'admin/workflows/:id', component: () => import('@/views/admin/WorkflowDesigner.vue') },
    ],
  },
];

const router = createRouter({ history: createWebHashHistory(), routes });

router.beforeEach(async (to) => {
  const user = useUserStore();
  if (to.meta.public) return true;
  if (!user.token) return { path: '/login' };
  if (!user.info) {
    try { await user.fetchMe(); } catch (_) { return { path: '/login' }; }
  }
  // 简单角色守卫
  if (to.path.startsWith('/admin') && !user.isAdmin) {
    ElMessage.warning('无访问权限');
    return { path: '/dashboard' };
  }
  return true;
});

export default router;
