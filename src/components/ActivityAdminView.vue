<script setup lang="ts">
/**
 * 活动配置（营养师端）
 *
 *   1. 四个活动开关（阶梯减重/每周挑战/全勤抽奖/积分商城），开关后学员端同步展示/隐藏
 *   2. 全员达标进度总览
 *   3. 审核/发货/发放记录已移至「发放中心」FulfillmentCenterView
 */
import { ref, computed } from 'vue';
import { useAppStore, type ActivityConfig } from '../store/app';
import { NavBar, Card } from './ui';
import { Popup as VanPopup, showToast } from 'vant';
import { Zap, Scale, Calendar, PartyPopper, Settings, ChevronRight, Users, FileText, Coins, TrendingUp, Flame } from 'lucide-vue-next';
import { Tabbar as VanTabbar, TabbarItem as VanTabbarItem, Switch as VanSwitch } from 'vant';
import { computeWeightMilestones, computeWeeklyChallenges, computeLuckyDraw } from '../lib/campActivities';
import { differenceInCalendarDays } from 'date-fns';

const store = useAppStore();

// ─── 营期切换（本地状态，默认第一个营期） ───
const selectedCampId = ref<string>(store.camps[0]?.id || '');
const showCampPicker = ref(false);
const selectedCamp = computed(() => store.camps.find((c) => c.id === selectedCampId.value));

// 活动开关（按选中营期独立配置）
const activityConfig = computed(() => store.getActivityConfig(selectedCampId.value));
// 模板中沿用 cfg 简称，指向按营期读取的配置
const cfg = activityConfig;

/** 更新当前营期的活动开关 */
function updateActivityConfigSafe(key: 'weightMilestone' | 'weeklyChallenge' | 'luckyDraw' | 'pointsMall' | 'checkinStreak', value: boolean) {
  if (!selectedCampId.value) {
    showToast('请先选择营期');
    return;
  }
  // 每周挑战：开启前必须先设置开始日期
  if (key === 'weeklyChallenge' && value === true) {
    if (!activityConfig.value.weeklyChallengeStartDate) {
      showToast('请先设置每周挑战开始日期');
      return;
    }
  }
  const updates: Partial<ActivityConfig> = {};
  updates[key] = value;
  store.updateActivityConfig(selectedCampId.value, updates);
}

/** 更新每周挑战周数 */
function updateWeeklyWeeks(value: number) {
  if (!selectedCampId.value) return;
  store.updateActivityConfig(selectedCampId.value, { weeklyChallengeWeeks: value });
}

// 按营期过滤打卡记录
const campDietRecords = computed(() => selectedCampId.value ? store.getCampDietRecords(selectedCampId.value) : store.dietRecords);
const campExerciseRecords = computed(() => selectedCampId.value ? store.getCampExerciseRecords(selectedCampId.value) : store.exerciseRecords);
const campWeightRecords = computed(() => selectedCampId.value ? store.getCampWeightRecords(selectedCampId.value) : store.weightRecords);

// 全员进度（基于当前选中营期的学员列表）
const campStudents = computed(() => {
  if (!selectedCampId.value) return store.students;
  return store.getStudentsByCamp(selectedCampId.value);
});

// 营期总天数（从营期起止日期计算，默认28）
const campTotalDays = computed(() => {
  const camp = selectedCamp.value;
  if (camp?.startDate && camp?.endDate) {
    const diff = differenceInCalendarDays(new Date(camp.endDate), new Date(camp.startDate)) + 1;
    return diff > 0 ? diff : 28;
  }
  return 28;
});

const studentProgress = computed(() =>
  campStudents.value.map((s) => {
    const weights = campWeightRecords.value
      .filter((w) => w.studentId === s.id || w.studentId === undefined)
      .sort((a, b) => a.date.localeCompare(b.date));
    const startW = weights.length > 0 ? weights[0].weight : null;
    const milestones = computeWeightMilestones(weights, startW);
    const latestW = weights.length > 0 ? weights[weights.length - 1].weight : null;

    const challenges = computeWeeklyChallenges(campDietRecords.value, campExerciseRecords.value, campWeightRecords.value, s.id, {
      challengeStartDate: activityConfig.value.weeklyChallengeStartDate,
      challengeWeeks: activityConfig.value.weeklyChallengeWeeks,
      campStartDate: selectedCamp.value?.startDate,
    });
    const luckyDraw = computeLuckyDraw(campDietRecords.value, campExerciseRecords.value, campWeightRecords.value, s.id, campTotalDays.value);

    const pendingMilestone = milestones.filter((m) => m.achieved).sort((a, b) => b.threshold - a.threshold)[0];

    return {
      id: s.id,
      name: s.name,
      phone: s.phone,
      weightLoss: startW && latestW ? +(startW - latestW).toFixed(1) : null,
      weightLossPercent: startW && latestW ? +((startW - latestW) / startW * 100).toFixed(1) : null,
      milestoneAchieved: !!pendingMilestone,
      milestoneLabel: pendingMilestone?.label || null,
      pendingMilestoneThreshold: pendingMilestone?.threshold || null,
      activeChallenge: challenges.find((c) => c.isCurrent)?.title || null,
      challengeCompletedCount: challenges.filter((c) => c.completed).length,
      luckyDrawEligible: luckyDraw.eligible,
      luckyDrawRate: luckyDraw.completionRate,
      luckyDrawCompleteDays: luckyDraw.completeDays,
      luckyDrawCampDays: luckyDraw.campDays,
    };
  }),
);

// ─── 全勤抽奖看板统计 ───
const luckyDrawStats = computed(() => {
  const total = studentProgress.value.length;
  const qualified = studentProgress.value.filter(s => s.luckyDrawEligible).length;
  const close = studentProgress.value.filter(s => !s.luckyDrawEligible && s.luckyDrawRate >= 0.6).length;
  const atRisk = studentProgress.value.filter(s => s.luckyDrawRate < 0.6).length;
  return { total, qualified, close, atRisk };
});

// 全勤看板按完成率降序
const luckyDrawRanking = computed(() =>
  [...studentProgress.value].sort((a, b) => b.luckyDrawRate - a.luckyDrawRate)
);

function openStudent(id: string, focusType?: 'milestone' | 'weekly' | 'lucky') {
  // 同步营期上下文到 store，确保学员详情页使用正确的营期数据
  store.selectedCampId = selectedCampId.value;
  store.selectedStudentId = id;
  // 里程碑达标待审核：跳到体重记录区审核照片
  if (focusType === 'milestone') {
    store.setPendingAnnotation('weight', '');
  } else {
    store.setPendingAnnotation(null);
  }
  store.setCurrentView('dietitian-student-detail');
}
</script>

<template>
  <div class="flex min-h-full flex-col bg-[#F7F8FA] pb-24 font-sans">
    <NavBar title="活动配置" :on-back="store.goBack" />

    <!-- 营期切换 -->
    <div class="bg-white px-4 py-3 flex items-center justify-between border-b border-gray-100">
      <div>
        <div class="text-xs text-gray-500">当前营期</div>
        <div class="text-sm font-medium text-gray-800">{{ selectedCamp?.name || '未选择' }}</div>
      </div>
      <button class="text-xs text-[#FF976A] border border-[#FF976A] px-3 py-1.5 rounded-full font-bold active:bg-orange-50" @click="showCampPicker = true">
        切换营期
      </button>
    </div>

    <div class="p-4 space-y-4">
      <!-- 活动开关 -->
      <Card class="space-y-3">
        <h3 class="font-bold text-gray-900 text-sm flex items-center gap-2 border-b pb-2">
          <Settings class="h-4 w-4 text-[#FF976A]" />
          活动开关
        </h3>
        <p class="text-[10px] text-gray-400">关闭后学员端将隐藏对应活动模块</p>

        <!-- 🎈 趣味活动（首期上线版暂移除，后续版本再上线）——
        <div class="flex items-center justify-between py-2 border-b border-gray-50">
          <div class="flex items-center gap-2">
            <Scale class="h-4 w-4 text-[#07C160]" />
            <div>
              <div class="text-sm font-bold text-gray-900">阶梯减重达标奖</div>
              <div class="text-[10px] text-gray-400">3%/5% 两档，需确认体重秤照片</div>
            </div>
          </div>
          <VanSwitch :model-value="cfg.weightMilestone" @update:model-value="updateActivityConfigSafe('weightMilestone', $event)" size="22" />
        </div>

        <div class="flex items-center justify-between py-2 border-b border-gray-50">
          <div class="flex items-center gap-2">
            <Calendar class="h-4 w-4 text-[#1677FF]" />
            <div>
              <div class="text-sm font-bold text-gray-900">每周主题挑战</div>
              <div class="text-[10px] text-gray-400">最多8周8主题，需设置开始日期</div>
            </div>
          </div>
          <VanSwitch :model-value="cfg.weeklyChallenge" @update:model-value="updateActivityConfigSafe('weeklyChallenge', $event)" size="22" />
        </div>

        <div class="ml-6 pl-3 border-l-2 border-[#1677FF]/20 space-y-2 py-1">
          <div v-if="cfg.weeklyChallenge" class="text-[10px] text-gray-400 bg-gray-50 rounded px-2 py-1 flex items-center gap-1">
            <svg class="w-3 h-3 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            挑战已开启，开始日期和周数已锁定（修改将影响学员进度数据）
          </div>
          <div v-if="!cfg.weeklyChallenge && !cfg.weeklyChallengeStartDate" class="text-[10px] text-orange-500 bg-orange-50 rounded px-2 py-1">⚠ 请先设置开始日期，然后开启挑战</div>

          <div class="flex items-center justify-between py-1">
            <span class="text-xs text-gray-500">开始日期 <span class="text-red-500">*</span></span>
            <input
              type="date"
              :value="cfg.weeklyChallengeStartDate || ''"
              :disabled="cfg.weeklyChallenge"
              @change="store.updateActivityConfig(selectedCampId, { weeklyChallengeStartDate: ($event.target as HTMLInputElement).value || undefined })"
              :class="['text-xs font-medium bg-transparent border-b focus:outline-none',
                       cfg.weeklyChallenge ? 'text-gray-400 border-gray-200 cursor-not-allowed' : 'text-[#1677FF] font-medium border-[#1677FF]/30 focus:border-[#1677FF]']"
            />
          </div>
          <div class="flex items-center justify-between py-1">
            <span class="text-xs text-gray-500">总周数</span>
            <div class="flex items-center gap-1">
              <button
                :disabled="cfg.weeklyChallenge"
                :class="['w-6 h-6 rounded-full border flex items-center justify-center',
                         cfg.weeklyChallenge ? 'border-gray-100 text-gray-300 cursor-not-allowed' : 'border-gray-200 text-gray-500']"
                @click="updateWeeklyWeeks(Math.max(1, (cfg.weeklyChallengeWeeks || 4) - 1))"
              >-</button>
              <span class="text-xs font-bold text-gray-900 w-6 text-center">{{ cfg.weeklyChallengeWeeks || 4 }}</span>
              <button
                :disabled="cfg.weeklyChallenge"
                :class="['w-6 h-6 rounded-full border flex items-center justify-center',
                         cfg.weeklyChallenge ? 'border-gray-100 text-gray-300 cursor-not-allowed' : 'border-gray-200 text-gray-500']"
                @click="updateWeeklyWeeks(Math.min(8, (cfg.weeklyChallengeWeeks || 4) + 1))"
              >+</button>
            </div>
          </div>
        </div>

        <div class="flex items-center justify-between py-2">
          <div class="flex items-center gap-2">
            <PartyPopper class="h-4 w-4 text-[#FF976A]" />
            <div>
              <div class="text-sm font-bold text-gray-900">全勤幸运抽奖</div>
              <div class="text-[10px] text-gray-400">完成率≥80%进入抽奖池</div>
            </div>
          </div>
          <VanSwitch :model-value="cfg.luckyDraw" @update:model-value="updateActivityConfigSafe('luckyDraw', $event)" size="22" />
        </div>
        🎈 -->

        <div class="flex items-center justify-between py-2 border-t border-gray-50">
          <div class="flex items-center gap-2">
            <Coins class="h-4 w-4 text-[#FF6B35]" />
            <div>
              <div class="text-sm font-bold text-gray-900">积分商城</div>
              <div class="text-[10px] text-gray-400">学员用排行榜积分兑换商品</div>
            </div>
          </div>
          <VanSwitch :model-value="cfg.pointsMall" @update:model-value="updateActivityConfigSafe('pointsMall', $event)" size="22" />
        </div>

        <div class="flex items-center justify-between py-2 border-t border-gray-50">
          <div class="flex items-center gap-2">
            <Flame class="h-4 w-4 text-[#07C160]" />
            <div>
              <div class="text-sm font-bold text-gray-900">连续打卡奖励</div>
              <div class="text-[10px] text-gray-400">学员连续达标领取阶梯奖励</div>
            </div>
          </div>
          <VanSwitch :model-value="cfg.checkinStreak" @update:model-value="updateActivityConfigSafe('checkinStreak', $event)" size="22" />
        </div>
      </Card>

      <!-- 全员进度总览 -->
      <Card class="space-y-3">
        <h3 class="font-bold text-gray-900 text-sm flex items-center gap-2 border-b pb-2">
          <Zap class="h-4 w-4 text-[#FF976A]" />
          全员进度总览
        </h3>
        <div class="overflow-x-auto">
          <table class="w-full text-xs">
            <thead>
              <tr class="text-[10px] text-gray-400 border-b border-gray-100">
                <th class="text-left py-2 px-1 font-medium">学员</th>
                <th v-if="cfg.weightMilestone" class="text-center py-2 px-1 font-medium">减重</th>
                <th v-if="cfg.weeklyChallenge" class="text-center py-2 px-1 font-medium">挑战</th>
                <th v-if="cfg.luckyDraw" class="text-center py-2 px-1 font-medium">完成率</th>
                <th class="text-right py-2 px-1 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="s in studentProgress"
                :key="s.id"
                class="border-b border-gray-50 cursor-pointer hover:bg-gray-50"
                @click="openStudent(s.id)"
              >
                <td class="py-2.5 px-1 font-bold text-gray-900">{{ s.name }}</td>
                <td v-if="cfg.weightMilestone" class="text-center py-2.5 px-1">
                  <span v-if="s.weightLoss !== null" :class="s.weightLoss > 0 ? 'text-[#07C160] font-bold' : 'text-gray-500'">
                    {{ s.weightLoss > 0 ? '-' : '' }}{{ s.weightLoss }}kg
                  </span>
                  <span v-else class="text-gray-300">--</span>
                  <span v-if="s.milestoneAchieved" class="ml-1 text-[9px] text-[#FF976A]">🏆</span>
                </td>
                <td v-if="cfg.weeklyChallenge" class="text-center py-2.5 px-1">
                  <span class="text-gray-700">{{ s.challengeCompletedCount }}/{{ cfg.weeklyChallengeWeeks || 4 }}</span>
                  <div v-if="s.activeChallenge" class="text-[9px] text-[#FF976A]">{{ s.activeChallenge }}</div>
                </td>
                <td v-if="cfg.luckyDraw" class="text-center py-2.5 px-1">
                  <span :class="s.luckyDrawEligible ? 'text-[#07C160] font-bold' : 'text-gray-500'">
                    {{ Math.round(s.luckyDrawRate * 100) }}%
                  </span>
                  <span v-if="s.luckyDrawEligible" class="ml-1 text-[9px]">✓</span>
                </td>
                <td class="text-right py-2.5 px-1">
                  <ChevronRight class="w-3.5 h-3.5 text-gray-300 inline" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <!-- 全勤抽奖数据看板 -->
      <Card v-if="cfg.luckyDraw" class="space-y-3">
        <h3 class="font-bold text-gray-900 text-sm flex items-center gap-2 border-b pb-2">
          <TrendingUp class="h-4 w-4 text-[#FF976A]" />
          全勤抽奖看板
        </h3>
        <p class="text-[10px] text-gray-400">完成率 ≥ 80% 进入抽奖池 · 营期共 {{ campTotalDays }} 天 · 五项全打卡（三餐+运动+体重）计为1天</p>

        <!-- 汇总统计 -->
        <div class="grid grid-cols-4 gap-2">
          <div class="rounded-xl bg-gray-50 p-2.5 text-center">
            <div class="text-lg font-bold text-gray-900">{{ luckyDrawStats.total }}</div>
            <div class="text-[10px] text-gray-400">总人数</div>
          </div>
          <div class="rounded-xl bg-[#07C160]/10 p-2.5 text-center">
            <div class="text-lg font-bold text-[#07C160]">{{ luckyDrawStats.qualified }}</div>
            <div class="text-[10px] text-[#07C160]/70">已达标</div>
          </div>
          <div class="rounded-xl bg-[#FF976A]/10 p-2.5 text-center">
            <div class="text-lg font-bold text-[#FF976A]">{{ luckyDrawStats.close }}</div>
            <div class="text-[10px] text-[#FF976A]/70">接近达标</div>
          </div>
          <div class="rounded-xl bg-gray-100 p-2.5 text-center">
            <div class="text-lg font-bold text-gray-400">{{ luckyDrawStats.atRisk }}</div>
            <div class="text-[10px] text-gray-400">需关注</div>
          </div>
        </div>

        <!-- 学员明细列表 -->
        <div class="space-y-2 pt-1">
          <div
            v-for="(s, idx) in luckyDrawRanking"
            :key="s.id"
            class="flex items-center gap-2.5 rounded-xl border border-gray-50 p-2.5 cursor-pointer hover:bg-gray-50 active:scale-[0.99] transition-all"
            @click="openStudent(s.id)"
          >
            <!-- 排名 -->
            <div class="w-5 text-center shrink-0">
              <span v-if="idx === 0" class="text-sm">🥇</span>
              <span v-else-if="idx === 1" class="text-sm">🥈</span>
              <span v-else-if="idx === 2" class="text-sm">🥉</span>
              <span v-else class="text-[10px] text-gray-400 font-bold">{{ idx + 1 }}</span>
            </div>
            <!-- 信息+进度条 -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between mb-1">
                <span class="text-xs font-bold text-gray-900">{{ s.name }}</span>
                <span class="text-[10px] text-gray-500">{{ s.luckyDrawCompleteDays }}/{{ s.luckyDrawCampDays }}天</span>
              </div>
              <div class="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                <div
                  class="h-full rounded-full transition-all"
                  :class="s.luckyDrawEligible ? 'bg-[#07C160]' : s.luckyDrawRate >= 0.6 ? 'bg-[#FF976A]' : 'bg-gray-300'"
                  :style="{ width: `${Math.min(s.luckyDrawRate * 100, 100)}%` }"
                ></div>
              </div>
            </div>
            <!-- 状态标签 -->
            <div class="shrink-0">
              <span
                v-if="s.luckyDrawEligible"
                class="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#07C160] text-white"
              >达标</span>
              <span
                v-else-if="s.luckyDrawRate >= 0.6"
                class="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#FF976A] text-white"
              >{{ Math.round((0.8 - s.luckyDrawRate) * s.luckyDrawCampDays) }}天</span>
              <span
                v-else
                class="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400"
              >{{ Math.round(s.luckyDrawRate * 100) }}%</span>
            </div>
          </div>
        </div>
      </Card>

      <!-- 说明 -->
      <div class="text-center py-3">
        <p class="text-[10px] text-gray-300">审核通过 -> 学员领取 -> 营养师发货 · 进度由打卡记录实时计算</p>
      </div>
    </div>

    <!-- 营期选择弹窗 -->
    <VanPopup v-model:show="showCampPicker" position="bottom" round>
      <div class="p-4">
        <h3 class="font-bold text-gray-900 text-base mb-3 text-center">选择营期</h3>
        <div class="space-y-2">
          <button
            v-for="camp in store.camps"
            :key="camp.id"
            @click="selectedCampId = camp.id; store.selectedCampId = camp.id; showCampPicker = false"
            :class="[
              'w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all',
              selectedCampId === camp.id
                ? 'border-[#FF976A] bg-orange-50 text-[#FF976A]'
                : 'border-gray-200 bg-white text-gray-700 active:bg-gray-50',
            ]"
          >
            <span class="font-medium">{{ camp.name }}</span>
            <span
              v-if="camp.status === 'active'"
              class="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-600"
            >进行中</span>
            <span
              v-else-if="camp.status === 'ended'"
              class="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500"
            >已结束</span>
            <span
              v-else
              class="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-500"
            >未开始</span>
          </button>
        </div>
      </div>
    </VanPopup>

    <VanTabbar class="custom-tabbar tabbar-orange" :model-value="2">
      <VanTabbarItem @click="store.setCurrentView('dietitian-dashboard')">
        <template #icon><Users class="h-6 w-6" /></template>
        首页
      </VanTabbarItem>
      <VanTabbarItem @click="store.setCurrentView('dietitian-unannotated-list')">
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
