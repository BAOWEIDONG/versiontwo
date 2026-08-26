<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch, nextTick, defineAsyncComponent, type Component } from 'vue';
import { useAppStore } from './store/app';
import VideoPreview from './components/VideoPreview.vue';

// 视图 → 异步组件映射（三端全局按需加载）：每个视图各自懒加载成独立 chunk，
// 首屏只加载 vue/vant/pinia 共享核心 + 首个视图，进入某端页面时才拉取该页代码，
// 显著降低启动包体积与首次渲染负担，与 KeepAlive 缓存叠加使用。
const viewMap: Record<string, Component> = {
  login: defineAsyncComponent(() => import('./components/LoginView.vue')),
  register: defineAsyncComponent(() => import('./components/RegisterView.vue')),
  questionnaire: defineAsyncComponent(() => import('./components/QuestionnaireView.vue')),
  upload: defineAsyncComponent(() => import('./components/UploadView.vue')),
  dashboard: defineAsyncComponent(() => import('./components/StudentDashboardView.vue')),
  'health-profile': defineAsyncComponent(() => import('./components/HealthProfileView.vue')),
  exercise: defineAsyncComponent(() => import('./components/ExerciseView.vue')),
  diet: defineAsyncComponent(() => import('./components/DietView.vue')),
  'weight-checkin': defineAsyncComponent(() => import('./components/WeightCheckinView.vue')),
  calendar: defineAsyncComponent(() => import('./components/CalendarView.vue')),
  'coach-dashboard': defineAsyncComponent(() => import('./components/CoachDashboardView.vue')),
  'coach-student-detail': defineAsyncComponent(() => import('./components/CoachStudentDetailView.vue')),
  'activity-upload': defineAsyncComponent(() => import('./components/ActivityUploadView.vue')),
  'activities-list': defineAsyncComponent(() => import('./components/ActivitiesListView.vue')),
  'dietitian-dashboard': defineAsyncComponent(() => import('./components/DietitianDashboardView.vue')),
  'dietitian-student-detail': defineAsyncComponent(() => import('./components/DietitianStudentDetailView.vue')),
  'dietitian-unannotated-list': defineAsyncComponent(() => import('./components/DietitianUnannotatedListView.vue')),
  ranking: defineAsyncComponent(() => import('./components/RankingView.vue')),
  pointsDetail: defineAsyncComponent(() => import('./components/PointsDetailView.vue')),
  reward: defineAsyncComponent(() => import('./components/RewardView.vue')),
  'reward-config': defineAsyncComponent(() => import('./components/RewardConfigView.vue')),
  'meal-time-config': defineAsyncComponent(() => import('./components/MealTimeConfigView.vue')),
  'metric-config': defineAsyncComponent(() => import('./components/MetricConfigView.vue')),
  'camp-summary': defineAsyncComponent(() => import('./components/DietitianCampSummaryView.vue')),
  'enterprise-report': defineAsyncComponent(() => import('./components/EnterpriseReportView.vue')),
  'camp-report': defineAsyncComponent(() => import('./components/CampReportView.vue')),
  'camp-activities': defineAsyncComponent(() => import('./components/CampActivitiesView.vue')),
  'activity-admin': defineAsyncComponent(() => import('./components/ActivityAdminView.vue')),
  'personal-journey': defineAsyncComponent(() => import('./components/PersonalJourneyView.vue')),
  messages: defineAsyncComponent(() => import('./components/MessagesView.vue')),
  'account-manage': defineAsyncComponent(() => import('./components/AccountManageView.vue')),
  'dietitian-config': defineAsyncComponent(() => import('./components/DietitianConfigView.vue')),
  'activity-hub': defineAsyncComponent(() => import('./components/ActivityHubView.vue')),
  'points-mall': defineAsyncComponent(() => import('./components/PointsMallView.vue')),
  'fulfillment-center': defineAsyncComponent(() => import('./components/FulfillmentCenterView.vue')),
  'my-rewards': defineAsyncComponent(() => import('./components/MyRewardsView.vue')),
};

const store = useAppStore();

const currentComponent = computed<Component>(() => viewMap[store.currentView] || viewMap.login);

// 同步营养师/教练角色到 <body>，用于全局复用首页浅渐变背景（学员端不挂该类）
function syncRoleClass(role?: string | null) {
  document.body.classList.remove('role-diet', 'role-coach');
  if (role === 'dietitian') document.body.classList.add('role-diet');
  else if (role === 'coach') document.body.classList.add('role-coach');
}
watch(() => store.user?.role, (r) => syncRoleClass(r));

// 视图切换时滚动到顶部
const scrollContainer = ref<HTMLElement | null>(null);
watch(() => store.currentView, () => {
  nextTick(() => {
    scrollContainer.value?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  });
});

// 启用 iOS 液态玻璃悬浮 Tabbar（打印时移除，回到普通 Tabbar 并遵循 print:hidden）
const handleBeforePrint = () => document.body.classList.remove('liquid-glass');
const handleAfterPrint = () => document.body.classList.add('liquid-glass');

onBeforeUnmount(() => {
  window.removeEventListener('beforeprint', handleBeforePrint);
  window.removeEventListener('afterprint', handleAfterPrint);
});

onMounted(() => {
  document.body.classList.add('liquid-glass');
  window.addEventListener('beforeprint', handleBeforePrint);
  window.addEventListener('afterprint', handleAfterPrint);

  // 先尝试恢复登录态（保活），再加载数据
  store.restoreAuth();
  store.init();
  syncRoleClass(store.user?.role);
});
</script>

<template>
  <div class="fixed inset-0 max-w-md mx-auto overflow-hidden font-sans text-gray-700 sm:shadow-2xl sm:border-x sm:border-gray-100">
    <div ref="scrollContainer" class="absolute inset-0 overflow-y-auto overflow-x-hidden overscroll-contain" style="-webkit-overflow-scrolling: touch; touch-action: pan-y;">
      <div class="relative">
        <!-- 视图缓存：去掉 :key 强制重建，改用 KeepAlive 缓存已访问视图。
             返回/切底部 tab 不再整个销毁重建，大幅降低导航卡顿（性能优化） -->
        <KeepAlive>
          <component :is="currentComponent" />
        </KeepAlive>
      </div>
    </div>
    <VideoPreview />
  </div>
</template>

<style>
</style>
