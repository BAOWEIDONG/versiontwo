<script setup lang="ts">
import { computed } from 'vue';
import { useAppStore } from '../store/app';
import { Card } from './ui';
import { Clock, Gift, Trophy, Activity, FileText, Users, ChevronRight, Settings, Package } from 'lucide-vue-next';
import { Tabbar as VanTabbar, TabbarItem as VanTabbarItem } from 'vant';
import { computeWeightMilestones, computeWeeklyChallenges, computeLuckyDraw } from '../lib/campActivities';

const store = useAppStore();

// ─── 待批注数量（与首页一致，显示在底部 Tabbar 徽标） ───
const unannotatedCount = computed(() => {
  const activeCampId = store.selectedCampId;
  const dietRecords = activeCampId ? store.getCampDietRecords(activeCampId) : store.dietRecords;
  const weightRecords = activeCampId ? store.getCampWeightRecords(activeCampId) : store.weightRecords;
  const diet = dietRecords.filter((r) => !r.dietitianComment && r.dietitianScore == null).length;
  const weight = weightRecords.filter((r) => !r.dietitianComment).length;
  return diet + weight;
});

// ─── 发放中心待处理条数 ───
const pendingAuditCount = computed(() => {
  let count = 0;
  for (const camp of store.camps) {
    const cfg = store.getActivityConfig(camp.id);
    const dietRecords = store.getCampDietRecords(camp.id);
    const exerciseRecords = store.getCampExerciseRecords(camp.id);
    const weightRecords = store.getCampWeightRecords(camp.id);
    const students = store.getStudentsByCamp(camp.id);
    const claims = store.getCampRewardClaims(camp.id);
    const tiers = store.getCampRewardTiers(camp.id);

    const getStudentActivityClaims = (studentId: string, activityType: string) =>
      claims.filter(c => {
        const tier = tiers.find(t => t.id === c.tierId);
        return c.studentId === studentId && tier?.source === 'activity' && tier?.activityType === activityType;
      });

    for (const s of students) {
      const weights = weightRecords
        .filter(w => w.studentId === s.id || w.studentId === undefined)
        .sort((a, b) => a.date.localeCompare(b.date));
      const startW = weights.length > 0 ? weights[0].weight : null;
      const milestones = computeWeightMilestones(weights, startW);

      const challenges = computeWeeklyChallenges(dietRecords, exerciseRecords, weightRecords, s.id, {
        challengeStartDate: cfg.weeklyChallengeStartDate,
        challengeWeeks: cfg.weeklyChallengeWeeks,
        campStartDate: camp.startDate,
      });
      const luckyDraw = computeLuckyDraw(dietRecords, exerciseRecords, weightRecords, s.id);

      const pendingMilestone = milestones.filter(m => m.achieved).sort((a, b) => b.threshold - a.threshold)[0];

      if (cfg.weightMilestone && pendingMilestone && getStudentActivityClaims(s.id, 'milestone').length === 0) count++;
      if (cfg.weeklyChallenge) {
        const totalWeeks = cfg.weeklyChallengeWeeks || 4;
        if (challenges.filter(c => c.completed).length >= totalWeeks && getStudentActivityClaims(s.id, 'weekly').length === 0) count++;
      }
      if (cfg.luckyDraw && luckyDraw.eligible && getStudentActivityClaims(s.id, 'lucky').length === 0) count++;
    }
  }
  return count;
});

const pendingShipCount = computed(() => {
  const claimCount = store.rewardClaims.filter(c => c.status === 'pending').length;
  const exchangeCount = store.pointExchanges.filter(e => e.status === 'pending').length;
  return claimCount + exchangeCount;
});

const fulfillmentPending = computed(() => pendingAuditCount.value + pendingShipCount.value);

interface ConfigItem {
  view: string;
  title: string;
  desc: string;
  icon: typeof Clock;
  color: string;
  badge?: number;
}

const configItems = computed<ConfigItem[]>(() => [
  { view: 'reward-config', title: '奖品配置', desc: '连续打卡奖励阶梯与配置', icon: Gift, color: '#FF976A' },
  { view: 'fulfillment-center', title: '发放中心', desc: '发货·发放·兑换记录', icon: Package, color: '#FF976A', badge: fulfillmentPending.value > 0 ? fulfillmentPending.value : undefined },
  { view: 'activity-admin', title: '活动配置', desc: '连续打卡奖励与积分商城开关', icon: Activity, color: '#FF976A' },
  { view: 'metric-config', title: '指标配置', desc: '健康档案体检指标项', icon: FileText, color: '#FF976A' },
  { view: 'camp-summary', title: '结营统计', desc: '学员数据变化与打卡频率', icon: Trophy, color: '#FF976A' },
  { view: 'account-manage', title: '账户管理', desc: '各角色手机号与营期', icon: Users, color: '#FF976A' },
]);
</script>

<template>
  <div class="flex min-h-full flex-col bg-[#F7F8FA] pb-24 font-sans">
    <div class="pt-[calc(env(safe-area-inset-top)+2.5rem)] px-6 pb-6 bg-gradient-to-b from-[#FF976A]/10 to-[#F7F8FA]">
      <div class="flex items-center space-x-3">
        <div class="h-12 w-12 rounded-xl bg-[#FF976A] flex items-center justify-center shadow-md shrink-0">
          <Settings class="h-6 w-6 text-white" />
        </div>
        <div>
          <h2 class="text-lg font-bold text-gray-900">管理配置</h2>
          <p class="text-xs text-gray-500 mt-0.5">营期配置、奖励管理、活动设置等</p>
        </div>
      </div>
    </div>

    <div class="flex-1 px-5 pt-2">
      <div class="space-y-3">
        <Card
          v-for="item in configItems"
          :key="item.view"
          class="flex items-center justify-between p-4 cursor-pointer hover:border-[#FF976A] transition-colors border-0 shadow-sm"
          @click="store.setCurrentView(item.view as any)"
        >
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" :style="{ background: item.color + '15' }">
              <component :is="item.icon" class="w-5 h-5" :style="{ color: item.color }" />
            </div>
            <div>
              <div class="text-sm font-bold text-gray-900">{{ item.title }}</div>
              <div class="text-xs text-gray-500 mt-0.5">{{ item.desc }}</div>
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <span v-if="item.badge" class="bg-[#FF4444] text-white text-[10px] font-bold min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center">
              {{ item.badge }}
            </span>
            <ChevronRight class="w-4 h-4 text-gray-300" />
          </div>
        </Card>
      </div>
    </div>

    <!-- Bottom Nav -->
    <VanTabbar class="custom-tabbar tabbar-orange" :model-value="2">
      <VanTabbarItem @click="store.setCurrentView('dietitian-dashboard')">
        <template #icon><Users class="h-6 w-6" /></template>
        首页
      </VanTabbarItem>
      <VanTabbarItem @click="store.setCurrentView('dietitian-unannotated-list')" :badge="unannotatedCount > 0 ? unannotatedCount : undefined">
        <template #icon><FileText class="h-6 w-6" /></template>
        批注
      </VanTabbarItem>
      <VanTabbarItem>
        <template #icon><Settings class="h-6 w-6" /></template>
        配置
      </VanTabbarItem>
    </VanTabbar>
  </div>
</template>
