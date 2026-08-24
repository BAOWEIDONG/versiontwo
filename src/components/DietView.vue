<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue';
import { format } from 'date-fns';
import { useAppStore } from '../store/app';
import { celebrateCheckin, celebrateReward } from '../lib/confetti';
import { calculateStreak } from '../lib/streak';
import { uploadFile } from '../lib/api';
import { Checkbox as VanCheckbox } from 'vant';
import { NavBar, Card, Button, ChartRulePopup } from './ui';
import { Camera, X, ChevronDown, UtensilsCrossed, Salad } from 'lucide-vue-next';
import { computeDietScoreTrends } from '../lib/journey';
import { formatDateTime } from '../lib/utils';
import { useDateGrouping } from '../composables/useDateGrouping';
import { useTabSwipe } from '../lib/useTabSwipe';

const MEAL_TYPES = [
  { id: 'breakfast', label: '早餐' },
  { id: 'lunch', label: '午餐' },
  { id: 'dinner', label: '晚餐' },
  { id: 'snack', label: '加餐' },
];

const store = useAppStore();

// ─── Tab 结构：打卡 / 趋势 / 记录 ────────────────────────
const activeTab = ref<'checkin' | 'trend' | 'records'>('checkin');
const { onTouchStart: tabSwipeStart, onTouchEnd: tabSwipeEnd } = useTabSwipe(activeTab, ['checkin', 'trend', 'records']);

// ─── 营期切换（多期时显示） ──────────────────────────────
const availableCamps = computed(() => store.user ? store.getStudentCamps(store.user.id) : []);
const activeCampId = computed(() => {
  if (store.selectedCampId && availableCamps.value.some(c => c.id === store.selectedCampId)) {
    return store.selectedCampId;
  }
  const active = availableCamps.value.find(c => c.status === 'active');
  return active?.id || availableCamps.value[0]?.id || null;
});

// 按营期过滤打卡记录
const campDiet = computed(() => activeCampId.value ? store.getCampDietRecords(activeCampId.value) : store.dietRecords);
const campEx = computed(() => activeCampId.value ? store.getCampExerciseRecords(activeCampId.value) : store.exerciseRecords);
const campWt = computed(() => activeCampId.value ? store.getCampWeightRecords(activeCampId.value) : store.weightRecords);
const campRewardTiers = computed(() => activeCampId.value ? store.getCampRewardTiers(activeCampId.value) : store.rewardTiers);

const todayStr = computed(() => format(new Date(), 'yyyy-MM-dd'));
const userDiets = computed(() => campDiet.value.filter((r) => r.studentId === store.user?.id));
const todayDiets = computed(() => userDiets.value.filter((r) => r.date.startsWith(todayStr.value)));
const uploadedMealIds = computed(() => todayDiets.value.map((r) => r.meal as string));

const availableMeals = computed(() => MEAL_TYPES.filter((m) => !uploadedMealIds.value.includes(m.id)));
const initialMeal = computed(() => (availableMeals.value.length > 0 ? availableMeals.value[0].id : ''));

const formData = ref({
  meal: initialMeal.value,
  description: '',
  isFasted: false,
  hasStaple: false,
  hasProtein: false,
  hasVegetable: false,
});

const photos = ref<string[]>([]);
const error = ref('');

const photoInputRef = ref<HTMLInputElement | null>(null);

const handlePhotoSelect = async (e: Event) => {
  const files = Array.from((e.target as HTMLInputElement).files || []) as File[];
  if (files.length === 0) return;
  const remaining = 3 - photos.value.length;
  const urls = await Promise.all(files.slice(0, remaining).map((f) => uploadFile(f)));
  photos.value = [...photos.value, ...urls];
  (e.target as HTMLInputElement).value = '';
};

const removePhoto = (idx: number) => {
  photos.value = photos.value.filter((_, i) => i !== idx);
};

const checkMealTime = (mealId: string): string | null => {
  const campId = activeCampId.value;
  if (!campId) return null;
  const mealConfig = store.getMealTimeConfig(campId);
  const slot = mealConfig[mealId as keyof typeof mealConfig];
  if (!slot || !slot.enabled) return null;
  const now = format(new Date(), 'HH:mm');
  if (now < slot.start || now > slot.end) {
    return `${slot.start}~${slot.end}`;
  }
  return null;
};

// 各餐打卡时间提示（从营养师配置读取，展示给学员）
const mealTimeHints = computed(() => {
  const campId = activeCampId.value;
  const mealConfig = campId ? store.getMealTimeConfig(campId) : null;
  return MEAL_TYPES.map(m => {
    const slot = mealConfig ? mealConfig[m.id as keyof typeof mealConfig] : null;
    return {
      label: m.label,
      timeText: slot?.enabled ? `${slot.start}~${slot.end}` : '随时',
      enabled: slot?.enabled ?? false,
      isSelected: formData.value.meal === m.id,
    };
  });
});

const handleSubmit = () => {
  if (!formData.value.meal) {
    error.value = '今日餐次已全部打卡';
    return;
  }

  // Check meal time range
  const timeRange = checkMealTime(formData.value.meal);
  if (timeRange) {
    const mealLabel = MEAL_TYPES.find(m => m.id === formData.value.meal)?.label || '';
    error.value = `${mealLabel}打卡时间为 ${timeRange}，当前不在打卡时间区间`;
    return;
  }
  if (!formData.value.isFasted && (formData.value.description.length < 5 || formData.value.description.length > 500)) {
    error.value = '请输入5-500字的食物描述';
    return;
  }
  if (!formData.value.isFasted && photos.value.length === 0) {
    error.value = '请至少上传一张照片';
    return;
  }
  if (photos.value.length > 3) {
    error.value = '最多上传3张照片';
    return;
  }

  error.value = '';
  const submittedMeal = formData.value.meal;

  // 打卡前连续天数
  const streakBefore = calculateStreak(campEx.value, campDiet.value, campWt.value, store.user?.id);

  store.addDietRecord({
    id: `diet_${Date.now()}`,
    studentId: store.user?.id || 's1',
    campId: activeCampId.value || undefined,
    date: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
    meal: submittedMeal as any,
    description: formData.value.isFasted ? '未进食' : formData.value.description,
    photos: formData.value.isFasted ? [] : photos.value,
    isFasted: formData.value.isFasted,
    hasStaple: formData.value.isFasted ? false : formData.value.hasStaple,
    hasProtein: formData.value.isFasted ? false : formData.value.hasProtein,
    hasVegetable: formData.value.isFasted ? false : formData.value.hasVegetable,
  });

  // reset form
  formData.value = { meal: '', description: '', isFasted: false, hasStaple: false, hasProtein: false, hasVegetable: false };
  photos.value = [];

  // 仅当连续天数增长且匹配档位且未领取时，触发奖励庆祝
  const streakAfter = calculateStreak(campEx.value, campDiet.value, campWt.value, store.user?.id);
  const tierMatched = streakAfter.currentStreak > streakBefore.currentStreak
    ? campRewardTiers.value.find(t => t.requiredDays === streakAfter.currentStreak)
    : undefined;
  const claims = activeCampId.value ? store.getCampRewardClaims(activeCampId.value) : store.rewardClaims;
  const alreadyClaimed = tierMatched
    ? claims.some(c => c.tierId === tierMatched.id && c.studentId === store.user?.id)
    : false;
  if (tierMatched && !alreadyClaimed) {
    celebrateReward(tierMatched.name);
  } else {
    celebrateCheckin(submittedMeal as 'breakfast' | 'lunch' | 'dinner' | 'snack');
  }

  store.justCheckedIn = true;
};

// Update selected meal if current selection becomes disabled
watch(
  [uploadedMealIds, () => formData.value.meal],
  () => {
    if (uploadedMealIds.value.includes(formData.value.meal as any) || !formData.value.meal) {
      const avail = MEAL_TYPES.filter((m) => !uploadedMealIds.value.includes(m.id as any));
      if (avail.length > 0) {
        formData.value.meal = avail[0].id;
      } else {
        formData.value.meal = '';
      }
    }
  },
);

// 所有历史记录按日期分组
const allHistory = computed(() => [...userDiets.value].sort((a, b) => b.date.localeCompare(a.date)));
const { grouped: groupedHistory, toggleDate, isExpanded } = useDateGrouping(allHistory);

const mealLabel = (meal: string) => MEAL_TYPES.find((m) => m.id === meal)?.label;

// 饮食健康指数周趋势（规则见 journey.ts computeDietScoreTrends 头部文档注释）
const dietTrends = computed(() => computeDietScoreTrends(campDiet.value, campEx.value, campWt.value, store.user?.id));
const dietTrendMax = computed(() => Math.max(...dietTrends.value.map((t) => t.score), 100));
const dietTrendColor = (score: number): string =>
  score >= 80 ? '#07C160' : score >= 60 ? '#FF976A' : '#EF4444';
const dietTrendDirection = computed(() => {
  const trends = dietTrends.value;
  if (trends.length < 2) return null;
  const diff = trends[trends.length - 1].score - trends[trends.length - 2].score;
  if (diff > 3) return 'up';
  if (diff < -3) return 'down';
  return 'flat';
});

// 学员对批注的反馈（点按钮同时视为已读）
const markDietFeedback = (recordId: string, feedback: 'received' | 'helpful') => {
  store.updateDietRecord(recordId, { studentFeedback: feedback, commentRead: true });
};

// 学员展开未读批注所在日期分组 → 该分组内批注标记为已读（真正看到才算已读）
const markGroupCommentsRead = (date: string) => {
  const group = groupedHistory.value.find((g) => g.date === date);
  if (!group) return;
  group.records.forEach((r) => {
    if (r.dietitianComment && !r.commentRead) {
      store.updateDietRecord(r.id, { commentRead: true });
    }
  });
};

const handleToggleDate = (date: string) => {
  const willExpand = !isExpanded(date);
  toggleDate(date);
  if (willExpand) markGroupCommentsRead(date);
};

// 默认展开的"今天"分组直接可见，其中的未读批注视为已读
markGroupCommentsRead(todayStr.value);

// 消息中心跳转：切到记录Tab，自动展开目标日期并滚动到对应记录
onMounted(() => {
  if (store.selectedDateStr) {
    const targetDate = store.selectedDateStr;
    store.setSelectedDateStr(null);
    activeTab.value = 'records';
    if (!isExpanded(targetDate)) toggleDate(targetDate);
    markGroupCommentsRead(targetDate);
    nextTick(() => {
      nextTick(() => {
        const el = document.getElementById(`diet-group-${targetDate}`);
        if (el) el.scrollIntoView({ block: 'start' });
      });
    });
  }
});
</script>

<template>
  <div class="flex min-h-full flex-col bg-[#F7F8FA] pb-8" @touchstart.passive="tabSwipeStart" @touchend.passive="tabSwipeEnd">
    <NavBar title="饮食打卡" :on-back="store.goBack" />

    <!-- Tab 切换：打卡 / 趋势 / 记录（液态玻璃胶囊） -->
    <div class="sticky top-14 z-20 px-4 pt-3 pb-1">
      <div class="seg-tabs">
        <button
          v-for="tab in ([{ id: 'checkin', label: '打卡' }, { id: 'trend', label: '趋势' }, { id: 'records', label: '记录' }] as const)"
          :key="tab.id"
          @click="activeTab = tab.id"
          :class="['seg-tab seg-tab-orange', activeTab === tab.id ? 'active' : '']"
        >{{ tab.label }}</button>
      </div>
    </div>

    <!-- ══════════ Tab 1: 打卡 ══════════ -->
    <div v-show="activeTab === 'checkin'" class="p-4 space-y-6 pb-32">
      <Card class="space-y-4">
        <div class="space-y-2">
          <label class="text-sm font-medium text-gray-700 block">选择餐次</label>
          <div class="flex gap-2">
            <button
              v-for="m in MEAL_TYPES"
              :key="m.id"
              :disabled="uploadedMealIds.includes(m.id)"
              @click="formData.meal = m.id"
              :class="['flex-1 py-2 rounded-lg text-sm transition-all font-medium active:scale-95', uploadedMealIds.includes(m.id) ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : formData.meal === m.id ? 'bg-[#FF976A] text-white shadow-sm scale-105' : 'bg-white text-gray-700 border border-gray-200']"
            >
              {{ m.label }}
            </button>
          </div>
          <!-- 各餐打卡时间提示 -->
          <div class="flex flex-wrap gap-1.5 pt-0.5">
            <div
              v-for="hint in mealTimeHints"
              :key="hint.label"
              :class="[
                'flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors',
                hint.isSelected ? 'bg-[#FF976A]/10 text-[#FF976A]' : 'bg-gray-50 text-gray-500'
              ]"
            >
              <span>{{ hint.label }}</span>
              <span :class="hint.enabled ? '' : 'text-gray-300'">{{ hint.timeText }}</span>
            </div>
          </div>
        </div>

        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <label class="text-sm font-medium text-gray-700">食物描述 <span v-if="!formData.isFasted" class="text-red-500">*</span></label>
            <VanCheckbox :model-value="formData.isFasted" @update:model-value="(v: boolean) => { formData.isFasted = v; formData.description = ''; error = ''; }" class="custom-checkbox cb-orange">
              <span class="text-sm font-medium text-gray-700">未进食</span>
            </VanCheckbox>
          </div>
          <div v-if="formData.isFasted" class="bg-yellow-50 text-yellow-700 p-2 text-xs rounded-lg mt-2 animate-pop-in">
            记得按时吃饭哦，营养师会担心你的～
          </div>
          <div v-if="!formData.isFasted" class="relative">
            <textarea
              placeholder="请详细描述您的餐食，包含食物种类和大概份量 (5-500字)"
              :value="formData.description"
              @input="formData.description = ($event.target as HTMLTextAreaElement).value; error = ''"
              class="w-full h-24 p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FF976A]/20 focus:border-[#FF976A] resize-none text-sm text-gray-900 placeholder:text-gray-400"
              maxlength="500"
            />
            <div class="absolute bottom-2 right-2 text-xs text-gray-400">
              {{ formData.description.length }}/500
            </div>
          </div>
        </div>

        <div v-if="!formData.isFasted" class="space-y-2">
          <div class="flex justify-between items-center">
            <label class="text-sm font-medium text-gray-700 block">拍照记录 <span class="text-red-500">*</span></label>
            <input ref="photoInputRef" type="file" accept="image/*" multiple class="hidden" @change="handlePhotoSelect" />
            <span class="text-xs text-gray-400">{{ photos.length }}/3 张</span>
          </div>

          <div class="grid grid-cols-3 gap-2">
            <div v-for="(url, idx) in photos" :key="idx" class="relative aspect-square rounded-lg overflow-hidden border border-gray-100 animate-pop-in">
              <img :src="url" :alt="`上传的照片 ${idx + 1}`" class="w-full min-h-full object-cover" />
              <button
                @click="removePhoto(idx)"
                class="absolute top-1 right-1 bg-black/50 rounded-full p-1 text-white hover:bg-black/70"
              >
                <X class="w-3 h-3" />
              </button>
            </div>

            <button
              v-if="photos.length < 3"
              @click="photoInputRef?.click()"
              class="aspect-square flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 text-gray-500 hover:bg-white transition-colors active:scale-95"
            >
              <Camera class="w-6 h-6 mb-1 text-gray-400" />
              <span class="text-[10px]">添加照片</span>
            </button>
          </div>
        </div>

        <div v-if="error" class="text-red-500 text-sm text-center animate-shake">{{ error }}</div>
      </Card>
    </div>

    <!-- ══════════ Tab 2: 趋势 ══════════ -->
    <div v-show="activeTab === 'trend'" class="p-4 space-y-4">
      <!-- 饮食健康指数 -->
      <Card v-if="dietTrends.length > 0" class="space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="font-bold text-gray-900 flex items-center gap-1.5 text-sm">
            <Salad class="h-4 w-4 text-[#FF976A]" />
            饮食健康指数
          </h3>
          <div class="flex items-center gap-2">
            <span v-if="dietTrendDirection" class="text-[10px] font-bold" :class="dietTrendDirection === 'up' ? 'text-[#07C160]' : dietTrendDirection === 'down' ? 'text-red-500' : 'text-gray-400'">
            {{ dietTrendDirection === 'up' ? '↑ 在变好' : dietTrendDirection === 'down' ? '↓ 有波动' : '→ 平稳' }}
          </span>
            <ChartRulePopup title="饮食健康指数计算规则">
              <p><span class="font-bold text-gray-900">综合公式：</span>每周指数 = 三餐规律 × 30% + 结构均衡 × 40% + 营养师评分 × 30%，满分100分。</p>
              <p><span class="font-bold text-gray-900">动态加权：</span>某项指标当周无数据时（如营养师尚未评分），其权重按比例分配给其他指标，不会因"未评分"直接不及格。</p>
              <p><span class="font-bold text-gray-900">三餐规律率（30%）：</span>三餐齐全天数 ÷ 有打卡天数。"三餐齐全"指同一天早、中、晚三餐都有打卡记录。仅统计有打卡的日子，不惩罚完全没打卡的天。</p>
              <p><span class="font-bold text-gray-900">结构均衡率（40%）：</span>在营养师已评定的记录中，食物类别（主食/蛋白/蔬菜）至少包含2项的记录占比。减脂餐不吃主食、只要蛋白+蔬菜也算均衡。</p>
              <p><span class="font-bold text-gray-900">营养师评分分（30%）：</span>该周营养师已评分记录的平均分（0~2分）÷ 2，映射到0~1。未批注的记录不计分。</p>
              <p><span class="font-bold text-gray-900">颜色分级：</span>≥80 绿色（优秀）、60-79 橙色（良好）、&lt;60 红色（需改善）。</p>
              <p><span class="font-bold text-gray-900">趋势箭头：</span>比较最近两周分数差值，差&gt;3显示"↑在变好"、差&lt;-3显示"↓有波动"、否则"->平稳"。</p>
            </ChartRulePopup>
          </div>
        </div>
        <!-- 柱状图：每周健康指数得分 -->
        <div class="flex items-end justify-between gap-1.5 h-24">
          <div v-for="t in dietTrends" :key="t.weekLabel" class="flex-1 flex flex-col items-center justify-end h-full">
            <div class="text-[10px] font-bold mb-0.5" :style="{ color: dietTrendColor(t.score) }">{{ t.score }}</div>
            <div class="w-full rounded-t transition-all min-h-[3px]" :style="{ height: `${Math.max((t.score / dietTrendMax) * 100, 3)}%`, backgroundColor: dietTrendColor(t.score) }"></div>
            <div class="text-[9px] text-gray-400 mt-1">{{ t.weekLabel }}</div>
          </div>
        </div>
        <!-- 图例 -->
        <div class="flex items-center gap-3 text-[9px] text-gray-400">
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded bg-[#07C160]"></span>≥80 优秀</span>
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded bg-[#FF976A]"></span>60-79 良好</span>
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded bg-red-400"></span>&lt;60 需改善</span>
        </div>
        <!-- 最近一周分解 -->
        <div v-if="dietTrends.length > 0" class="pt-2 border-t border-gray-50 space-y-2">
          <div class="text-[10px] text-gray-400">最近一周 {{ dietTrends[dietTrends.length - 1].weekLabel }} 分解：</div>
          <div class="flex items-center gap-2 text-[10px]">
            <span class="text-gray-500 w-16 shrink-0">三餐规律</span>
            <div class="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
              <div class="h-full rounded-full bg-[#1677FF]" :style="{ width: `${dietTrends[dietTrends.length - 1].regularityRate * 100}%` }"></div>
            </div>
            <span class="text-gray-500 w-16 text-right">{{ Math.round(dietTrends[dietTrends.length - 1].regularityRate * 100) }}% ({{ dietTrends[dietTrends.length - 1].fullMealDays }}/{{ dietTrends[dietTrends.length - 1].checkinDays }}天)</span>
          </div>
          <div class="flex items-center gap-2 text-[10px]">
            <span class="text-gray-500 w-16 shrink-0">结构均衡</span>
            <div class="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
              <div class="h-full rounded-full bg-[#07C160]" :style="{ width: `${dietTrends[dietTrends.length - 1].balanceRate * 100}%` }"></div>
            </div>
            <span class="text-gray-500 w-16 text-right">{{ dietTrends[dietTrends.length - 1].taggedRecords > 0 ? Math.round(dietTrends[dietTrends.length - 1].balanceRate * 100) + '%' : '待评定' }} ({{ dietTrends[dietTrends.length - 1].taggedRecords }}条)</span>
          </div>
          <div class="flex items-center gap-2 text-[10px]">
            <span class="text-gray-500 w-16 shrink-0">营养师评分</span>
            <div class="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
              <div class="h-full rounded-full bg-[#FF976A]" :style="{ width: `${dietTrends[dietTrends.length - 1].avgDietitianScore !== null ? (dietTrends[dietTrends.length - 1].avgDietitianScore! / 2) * 100 : 0}%` }"></div>
            </div>
            <span class="text-gray-500 w-16 text-right">{{ dietTrends[dietTrends.length - 1].avgDietitianScore !== null ? dietTrends[dietTrends.length - 1].avgDietitianScore!.toFixed(1) + '/2.0' : '待评分' }}</span>
          </div>
        </div>
      </Card>
      <div v-else class="text-center py-10 bg-white rounded-2xl border border-gray-100">
        <div class="w-16 h-16 mx-auto mb-3 rounded-full bg-[#FF976A]/10 flex items-center justify-center">
          <Salad class="w-8 h-8 text-[#FF976A]" />
        </div>
        <div class="text-sm font-bold text-gray-700 mb-1">还没有饮食数据</div>
        <div class="text-xs text-gray-400">完成打卡后生成健康指数趋势</div>
      </div>
    </div>

    <!-- ══════════ Tab 3: 记录 ══════════ -->
    <div v-show="activeTab === 'records'" class="p-4 space-y-3">
      <div v-if="groupedHistory.length === 0" class="text-center py-10 bg-white rounded-2xl border border-gray-100 animate-pop-in">
        <div class="w-16 h-16 mx-auto mb-3 rounded-full bg-[#FF976A]/10 flex items-center justify-center">
          <UtensilsCrossed class="w-8 h-8 text-[#FF976A]" />
        </div>
        <div class="text-sm font-bold text-gray-700 mb-1">还没有饮食记录</div>
        <div class="text-xs text-gray-400">拍下今天的第一餐，让营养师帮你把关</div>
      </div>
      <div v-else class="space-y-4">
        <div v-for="group in groupedHistory" :key="group.date" :id="`diet-group-${group.date}`">
          <!-- Date header -->
          <button
            @click="handleToggleDate(group.date)"
            class="w-full flex items-center justify-between bg-white rounded-xl px-4 py-2.5 mb-2 border border-gray-100 sticky top-[104px] z-10 shadow-sm"
          >
            <div class="flex items-center gap-2">
              <span class="w-1 h-4 rounded-full bg-[#FF976A]"></span>
              <span class="text-sm font-bold text-gray-800">{{ group.label }}</span>
              <span class="text-[10px] text-gray-400">{{ group.records.length }}条记录</span>
              <span v-if="group.records.some((r) => r.dietitianComment && !r.commentRead)" class="text-[10px] font-bold text-white bg-red-500 px-1.5 py-0.5 rounded-full">新批注</span>
            </div>
            <ChevronDown
              class="w-4 h-4 text-gray-400 transition-transform duration-200"
              :class="{ 'rotate-180': isExpanded(group.date) }"
            />
          </button>
          <!-- Records for this date -->
          <div v-show="isExpanded(group.date)" class="space-y-4 animate-pop-in">
            <Card v-for="record in group.records" :key="record.id" class="p-0 overflow-hidden">
              <div class="p-4 border-b border-gray-50">
                <div class="flex justify-between items-center mb-3">
                  <span class="text-xs text-gray-500 font-medium">{{ formatDateTime(record.date) }}</span>
                  <span class="text-[10px] px-2 py-0.5 rounded text-[#FF976A] bg-[#FF976A]/10 font-bold uppercase">
                    {{ mealLabel(record.meal) }}
                  </span>
                </div>

                <p class="text-sm text-gray-900 mb-3 whitespace-pre-wrap">{{ record.description }}</p>

                <!-- 营养师评定的餐次结构标签 -->
                <div v-if="record.hasStaple || record.hasProtein || record.hasVegetable" class="flex flex-wrap gap-1.5 mb-3">
                  <span class="text-[10px] text-gray-400 self-center">营养师评定:</span>
                  <span v-if="record.hasStaple" class="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 font-medium">🍚 主食</span>
                  <span v-if="record.hasProtein" class="text-[10px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-500 font-medium">🥩 蛋白质</span>
                  <span v-if="record.hasVegetable" class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 font-medium">🥬 蔬菜</span>
                </div>

                <div class="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                  <img
                    v-for="(url, idx) in record.photos"
                    :key="idx"
                    :src="url"
                    alt="食物"
                    class="h-20 w-20 object-cover rounded-lg shrink-0 snap-center border border-gray-100 cursor-pointer"
                    @click="store.openImagePreview(record.photos || [], idx)"
                  />
                </div>
              </div>

              <div v-if="record.dietitianComment || typeof record.dietitianScore === 'number'" class="bg-[#07C160]/5 p-4 relative">
                <div class="absolute top-0 left-0 w-1 min-h-full bg-[#07C160]"></div>
                <div class="flex items-center justify-between mb-1">
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-bold text-[#07C160]">批注</span>
                    <span v-if="record.dietitianScore === 2" class="text-[10px] font-bold text-white bg-[#07C160] px-1.5 py-0.5 rounded">+2</span>
                    <span v-else-if="record.dietitianScore === 1" class="text-[10px] font-bold text-white bg-[#FF976A] px-1.5 py-0.5 rounded">+1</span>
                    <span v-else-if="record.dietitianScore === 0" class="text-[10px] font-bold text-white bg-gray-400 px-1.5 py-0.5 rounded">0</span>
                    <span v-if="record.dietitianComment && !record.commentRead" class="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                  </div>
                  <span v-if="record.dietitianCommentDate" class="text-[10px] text-gray-500">{{ record.dietitianCommentDate }}</span>
                </div>
                <p v-if="record.dietitianComment" class="text-sm text-gray-700 whitespace-pre-wrap">{{ record.dietitianComment }}</p>
                <!-- 学员反馈 -->
                <div v-if="record.dietitianComment" class="flex gap-2 mt-2.5">
                  <button
                    @click="markDietFeedback(record.id, 'received')"
                    :class="['text-[10px] px-2.5 py-1 rounded-full font-bold transition-all active:scale-95', record.studentFeedback === 'received' ? 'bg-[#07C160] text-white' : 'bg-white text-gray-500 border border-gray-200']"
                  >
                    {{ record.studentFeedback === 'received' ? '✓ 已收到' : '收到' }}
                  </button>
                  <button
                    @click="markDietFeedback(record.id, 'helpful')"
                    :class="['text-[10px] px-2.5 py-1 rounded-full font-bold transition-all active:scale-95', record.studentFeedback === 'helpful' ? 'bg-[#FF976A] text-white' : 'bg-white text-gray-500 border border-gray-200']"
                  >
                    {{ record.studentFeedback === 'helpful' ? '✓ 有用' : '👍 有用' }}
                  </button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>

    <!-- 固定悬浮底部打卡按钮（仅打卡Tab显示） -->
    <div v-show="activeTab === 'checkin'" class="fixed bottom-0 left-0 right-0 z-40 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 bg-gradient-to-t from-[#F7F8FA] via-[#F7F8FA]/95 to-transparent">
      <Button
        class="w-full bg-[#FF976A] hover:bg-[#e8855a] active:bg-[#d97746] disabled:bg-[#FF976A]/50 text-white shadow-lg shadow-[#FF976A]/30 active:scale-95 transition-transform"
        size="lg"
        @click="handleSubmit"
        :disabled="!formData.meal"
      >
        {{ formData.meal ? '提交打卡' : '今日已全部打卡' }}
      </Button>
    </div>
  </div>
</template>

<style scoped>
@keyframes popIn {
  0% { transform: scale(0.9); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-4px); }
  40%, 80% { transform: translateX(4px); }
}
.animate-pop-in {
  animation: popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
.animate-shake {
  animation: shake 0.4s ease-in-out;
}
</style>
