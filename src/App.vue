<script setup lang="ts">
import { computed, onMounted, ref, watch, nextTick, type Component } from 'vue';
import { useAppStore } from './store/app';
import LoginView from './components/LoginView.vue';
import RegisterView from './components/RegisterView.vue';
import QuestionnaireView from './components/QuestionnaireView.vue';
import UploadView from './components/UploadView.vue';
import StudentDashboardView from './components/StudentDashboardView.vue';
import HealthProfileView from './components/HealthProfileView.vue';
import ExerciseView from './components/ExerciseView.vue';
import DietView from './components/DietView.vue';
import CalendarView from './components/CalendarView.vue';
import CoachDashboardView from './components/CoachDashboardView.vue';
import CoachStudentDetailView from './components/CoachStudentDetailView.vue';
import WeightCheckinView from './components/WeightCheckinView.vue';
import ActivitiesListView from './components/ActivitiesListView.vue';
import ActivityUploadView from './components/ActivityUploadView.vue';
import DietitianDashboardView from './components/DietitianDashboardView.vue';
import DietitianStudentDetailView from './components/DietitianStudentDetailView.vue';
import DietitianUnannotatedListView from './components/DietitianUnannotatedListView.vue';
import RankingView from './components/RankingView.vue';
import PointsDetailView from './components/PointsDetailView.vue';
import RewardView from './components/RewardView.vue';
import RewardConfigView from './components/RewardConfigView.vue';
import MealTimeConfigView from './components/MealTimeConfigView.vue';
import MetricConfigView from './components/MetricConfigView.vue';
import DietitianCampSummaryView from './components/DietitianCampSummaryView.vue';
import EnterpriseReportView from './components/EnterpriseReportView.vue';
import CampReportView from './components/CampReportView.vue';
import CampActivitiesView from './components/CampActivitiesView.vue';
import ActivityAdminView from './components/ActivityAdminView.vue';
import PersonalJourneyView from './components/PersonalJourneyView.vue';
import MessagesView from './components/MessagesView.vue';
import AccountManageView from './components/AccountManageView.vue';
import DietitianConfigView from './components/DietitianConfigView.vue';
import VideoPreview from './components/VideoPreview.vue';
import ActivityHubView from './components/ActivityHubView.vue';
import PointsMallView from './components/PointsMallView.vue';
import FulfillmentCenterView from './components/FulfillmentCenterView.vue';
import MyRewardsView from './components/MyRewardsView.vue';

const store = useAppStore();

const viewMap: Record<string, Component> = {
  login: LoginView,
  register: RegisterView,
  questionnaire: QuestionnaireView,
  upload: UploadView,
  dashboard: StudentDashboardView,
  'health-profile': HealthProfileView,
  exercise: ExerciseView,
  diet: DietView,
  'weight-checkin': WeightCheckinView,
  calendar: CalendarView,
  'coach-dashboard': CoachDashboardView,
  'coach-student-detail': CoachStudentDetailView,
  'activity-upload': ActivityUploadView,
  'activities-list': ActivitiesListView,
  'dietitian-dashboard': DietitianDashboardView,
  'dietitian-student-detail': DietitianStudentDetailView,
  'dietitian-unannotated-list': DietitianUnannotatedListView,
  ranking: RankingView,
  pointsDetail: PointsDetailView,
  reward: RewardView,
  'reward-config': RewardConfigView,
  'meal-time-config': MealTimeConfigView,
  'metric-config': MetricConfigView,
  'camp-summary': DietitianCampSummaryView,
  'enterprise-report': EnterpriseReportView,
  'camp-report': CampReportView,
  'camp-activities': CampActivitiesView,
  'activity-admin': ActivityAdminView,
  'personal-journey': PersonalJourneyView,
  messages: MessagesView,
  'account-manage': AccountManageView,
  'dietitian-config': DietitianConfigView,
  'activity-hub': ActivityHubView,
  'points-mall': PointsMallView,
  'fulfillment-center': FulfillmentCenterView,
  'my-rewards': MyRewardsView,
};

const currentComponent = computed<Component>(() => viewMap[store.currentView] || LoginView);

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

onMounted(() => {
  // 启用 iOS 液态玻璃悬浮 Tabbar（打印时移除，回到普通 Tabbar 并遵循 print:hidden）
  document.body.classList.add('liquid-glass');
  const handleBeforePrint = () => document.body.classList.remove('liquid-glass');
  const handleAfterPrint = () => document.body.classList.add('liquid-glass');
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
        <component :is="currentComponent" :key="store.currentView" />
      </div>
    </div>
    <VideoPreview />
  </div>
</template>

<style>
</style>
