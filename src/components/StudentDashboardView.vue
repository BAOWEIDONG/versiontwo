<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue';
import { format } from 'date-fns';
import { useAppStore } from '../store/app';
import { Card, GenderAvatar } from './ui';
import { Activity, Coffee, Calendar, FileText, Scale, PlayCircle, LogOut, Medal, Trophy, Gift, Flame, BookOpen, Zap, MessageCircle, Bell, X, ChevronRight, Sparkles, ChevronDown, TrendingDown, TrendingUp, Minus, Target } from 'lucide-vue-next';
import { Tabbar as VanTabbar, TabbarItem as VanTabbarItem, Popup as VanPopup, showToast } from 'vant';
import { rankStudents } from '../lib/scoring';
import { getTodayQuote } from '../lib/motivationalQuotes';
import { calculateStreak } from '../lib/streak';
import { computeWeightMilestones, computeWeeklyChallenges, computeLuckyDraw } from '../lib/campActivities';
import { generateStudentReport } from '../lib/campReport';
import { MOCK_STUDENT_METRIC_VALUES } from '../mock/data';

const store = useAppStore();

const todayStr = format(new Date(), 'yyyy-MM-dd');
const isMine = (r: { studentId?: string }) => r.studentId === store.user?.id;

// ─── 核心数据带：体重变化 + 目标进度 ─────────────────────
// 慢病健康管理场景下，学员最关注的是"我瘦了多少 / 离目标还有多远"
const myWeightRecords = computed(() =>
  campWt.value.filter(isMine).sort((a, b) => a.date.localeCompare(b.date))
);
const latestWeightRecord = computed(() =>
  myWeightRecords.value.length > 0 ? myWeightRecords.value[myWeightRecords.value.length - 1] : null
);
const latestWeight = computed(() => latestWeightRecord.value?.weight ?? null);
const startWeight = computed(() =>
  myWeightRecords.value.length > 0 ? myWeightRecords.value[0].weight : null
);
const weightChange = computed(() => {
  if (latestWeight.value === null || startWeight.value === null) return null;
  return parseFloat((latestWeight.value - startWeight.value).toFixed(1));
});
const targetWeight = computed(() => store.user?.targetWeight ?? null);
// 距目标还差多少（正数=还需努力，≤0=已达标/超额）
// 方向感知：减重时 latest-target，增重时 target-latest，使 ≤0 恒等于已达标
const gapToTarget = computed(() => {
  if (latestWeight.value === null || targetWeight.value === null) return null;
  if (isWeightLoss.value) {
    // 减重：还需减多少
    return parseFloat((latestWeight.value - targetWeight.value).toFixed(1));
  }
  // 增重：还需增多少
  return parseFloat((targetWeight.value - latestWeight.value).toFixed(1));
});
// 目标进度百分比：(起始-当前) / (起始-目标)，支持减重和增重两种场景
const targetProgress = computed(() => {
  if (startWeight.value === null || latestWeight.value === null || targetWeight.value === null) return null;
  const total = startWeight.value - targetWeight.value;
  if (total === 0) return null; // 起始=目标时无意义
  const done = startWeight.value - latestWeight.value;
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
});
// 目标方向：减重（目标<起始）或增重（目标>起始）
const isWeightLoss = computed(() => {
  if (startWeight.value === null || targetWeight.value === null) return true;
  return targetWeight.value < startWeight.value;
});
// 体重变化是否朝目标方向（null=无变化，true=向好绿色，false=逆向橙色）
const isWeightChangeGood = computed(() => {
  if (weightChange.value === null || weightChange.value === 0) return null;
  if (isWeightLoss.value) return weightChange.value < 0; // 减重：变轻为好
  return weightChange.value > 0; // 增重：变重为好
});

// ─── 营期切换器（多期时显示） ──────────────────────────────
const availableCamps = computed(() => store.user ? store.getStudentCamps(store.user.id) : []);
const activeCampId = computed(() => {
  if (store.selectedCampId && availableCamps.value.some(c => c.id === store.selectedCampId)) {
    return store.selectedCampId;
  }
  const active = availableCamps.value.find(c => c.status === 'active');
  return active?.id || availableCamps.value[0]?.id || null;
});
const activeCamp = computed(() => availableCamps.value.find(c => c.id === activeCampId.value) || null);
const showCampSwitcher = computed(() => availableCamps.value.length > 1);
const showCampPicker = ref(false);
const handleCampSelect = (campId: string) => {
  store.selectedCampId = campId;
  showCampPicker.value = false;
};

// 同营期学员列表（用于排名计算，跟随 activeCampId 切换）
const campStudents = computed(() => {
  if (!activeCampId.value) return [];
  return store.getStudentsByCamp(activeCampId.value);
});

// 按营期过滤打卡记录
const campDiet = computed(() => activeCampId.value ? store.getCampDietRecords(activeCampId.value) : store.dietRecords);
const campEx = computed(() => activeCampId.value ? store.getCampExerciseRecords(activeCampId.value) : store.exerciseRecords);
const campWt = computed(() => activeCampId.value ? store.getCampWeightRecords(activeCampId.value) : store.weightRecords);
const campManual = computed(() => activeCampId.value ? store.getCampManualScoreRecords(activeCampId.value) : store.manualScoreRecords);

const scoreData = computed(() => {
  if (!store.user || campStudents.value.length === 0) return null;
  const ranked = rankStudents(campStudents.value, campDiet.value, campEx.value, campManual.value);
  return ranked.find((s) => s.studentId === store.user!.id) || null;
});

// 与前一名（更高分者）的分差
const gapToAhead = computed(() => {
  if (!store.user || campStudents.value.length === 0) return null;
  const ranked = rankStudents(campStudents.value, campDiet.value, campEx.value, campManual.value);
  const me = ranked.find((s) => s.studentId === store.user!.id);
  if (!me || me.rank <= 1) return null;
  const ahead = ranked
    .filter((s) => s.totalScore > me.totalScore)
    .sort((a, b) => a.totalScore - b.totalScore)[0];
  if (!ahead) return null;
  return ahead.totalScore - me.totalScore;
});

const todayQuote = getTodayQuote();

const streakData = computed(() => calculateStreak(campEx.value, campDiet.value, campWt.value, store.user?.id));
const currentStreak = computed(() => streakData.value.currentStreak);

// 开营第几天（用于头部 DAY X 徽章）
const campDay = computed(() => {
  if (!activeCamp.value?.startDate) return 1;
  const start = new Date(activeCamp.value.startDate);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - start.getTime()) / 86400000) + 1;
  return Math.max(1, diffDays);
});

// ─── 营期未开始：禁止打卡入口 ─────────────────────────────
const campNotStarted = computed(() => {
  if (!activeCamp.value) return false;
  return !store.isCampStarted(activeCamp.value);
});
// 未开始营期的权威状态（用于提示文案）：优先 status，其次按日期推断
const campNotStartedText = computed(() => {
  const camp = activeCamp.value;
  if (!camp) return '营期尚未开始';
  if (camp.startDate) {
    return `营期尚未开始（${camp.startDate} 开营），暂不能打卡`;
  }
  return '营期尚未开始，暂不能打卡';
});
// 打卡入口统一拦截：未开始时弹提示，不进入打卡页
function guardCheckin(view: string) {
  if (campNotStarted.value) {
    showToast(campNotStartedText.value);
    return;
  }
  store.setCurrentView(view);
}

// 活动配置（按营期独立配置，取代旧的全局 activityConfig）
const activityConfig = computed(() => store.getActivityConfig(activeCampId.value));

// ---- 趣味活动入口（营养师开关 + 学员有打卡记录才显示） ----
const hasAnyCheckin = computed(() => {
  if (!store.user) return false;
  return campDiet.value.some(isMine) || campEx.value.some(isMine) || campWt.value.some(isMine);
});
const hasActivityEnabled = computed(() =>
  activityConfig.value.weightMilestone || activityConfig.value.weeklyChallenge || activityConfig.value.luckyDraw
);
const showActivitiesEntry = computed(() => hasActivityEnabled.value && hasAnyCheckin.value);

// 活动预览数据（用于首页入口卡片展示摘要，与趣味活动页数据口径一致：按当前营期过滤）
const activityPreview = computed(() => {
  const items: { label: string; progress: string; color: string }[] = [];
  const camp = activeCamp.value;
  const campStart = camp?.startDate || null;
  const cDiet = campDiet.value;
  const cEx = campEx.value;
  const cWt = campWt.value;

  if (activityConfig.value.weightMilestone) {
    const myWeights = cWt.filter(isMine).sort((a, b) => a.date.localeCompare(b.date));
    const startW = myWeights.length > 0 ? myWeights[0].weight : null;
    const milestones = computeWeightMilestones(myWeights, startW);
    const topMilestone = milestones.find(m => !m.achieved) || milestones[milestones.length - 1];
    items.push({
      label: topMilestone.achieved ? topMilestone.label + ' ✓' : '达标 ' + Math.round(topMilestone.threshold * 100) + '%',
      progress: topMilestone.achieved ? '已达标' : Math.round(topMilestone.progress * 100) + '%',
      color: '#FF976A',
    });
  }
  if (activityConfig.value.weeklyChallenge) {
    const challenges = computeWeeklyChallenges(cDiet, cEx, cWt, store.user?.id, {
      challengeStartDate: activityConfig.value.weeklyChallengeStartDate,
      challengeWeeks: activityConfig.value.weeklyChallengeWeeks,
      campStartDate: campStart || undefined,
    });
    const completed = challenges.filter(c => c.completed).length;
    const current = challenges.find(c => c.isCurrent);
    const notStarted = challenges.length > 0 && challenges.every(c => c.status === 'locked');
    items.push({
      label: notStarted ? '挑战未开始' : current ? current.title : '每周挑战',
      progress: notStarted ? (activityConfig.value.weeklyChallengeStartDate || '待定') : completed + '/' + challenges.length + ' 周',
      color: '#1677FF',
    });
  }
  if (activityConfig.value.luckyDraw) {
    const campDays = camp?.startDate && camp?.endDate
      ? Math.max(1, Math.round((new Date(camp.endDate).getTime() - new Date(camp.startDate).getTime()) / 86400000))
      : 28;
    const lucky = computeLuckyDraw(cDiet, cEx, cWt, store.user?.id, campDays);
    items.push({
      label: '全勤抽奖',
      progress: lucky.eligible ? '已入围 ✓' : Math.round(lucky.completionRate * 100) + '%',
      color: '#07C160',
    });
  }
  return items;
});

// 每周挑战主题预览（用于首页入口卡片展示 8 周主题缩略）
const weeklyChallengePreview = computed(() => {
  if (!activityConfig.value.weeklyChallenge) return [];
  const challenges = computeWeeklyChallenges(campDiet.value, campEx.value, campWt.value, store.user?.id, {
    challengeStartDate: activityConfig.value.weeklyChallengeStartDate,
    challengeWeeks: activityConfig.value.weeklyChallengeWeeks,
    campStartDate: activeCamp.value?.startDate,
  });
  const notStarted = challenges.length > 0 && challenges.every(c => c.status === 'locked');
  return challenges.map(c => ({
    icon: c.icon,
    title: c.title,
    completed: c.completed,
    isCurrent: c.isCurrent,
    status: c.status,
    notStarted,
  }));
});

// ---- 昨日小结卡（今天首次打开时展示） ----
const yesterdayStr = format(new Date(Date.now() - 86400000), 'yyyy-MM-dd');
// 同步读取 localStorage，避免返回首页时弹窗闪现
const _dailySummaryKey = `daily_summary_${store.user?.id || 'anon'}_${todayStr}`;
const dailySummaryDismissed = ref(!!localStorage.getItem(_dailySummaryKey));

const dailySummary = computed(() => {
  if (!store.user) return null;
  const meals = new Set(campDiet.value.filter((r) => isMine(r) && r.date.startsWith(yesterdayStr)).map((r) => r.meal));
  const exerciseMins = campEx.value
    .filter((r) => isMine(r) && r.date.startsWith(yesterdayStr))
    .reduce((sum, r) => sum + (r.duration || 0), 0);
  const weights = campWt.value.filter((r) => isMine(r)).sort((a, b) => a.date.localeCompare(b.date));
  const yesterdayWeight = weights.filter((r) => r.date.startsWith(yesterdayStr)).pop();
  // 昨日体重 vs 前一天最近一条
  let weightChange: number | null = null;
  if (yesterdayWeight) {
    const before = weights.filter((r) => r.date < yesterdayStr);
    const prev = before[before.length - 1];
    if (prev) weightChange = parseFloat((yesterdayWeight.weight - prev.weight).toFixed(1));
  }
  // 昨日收到的最新一条营养师批注
  const comments = [
    ...campDiet.value.filter((r) => isMine(r) && r.dietitianComment && (r.dietitianCommentDate || '').startsWith(yesterdayStr)),
    ...campEx.value.filter((r) => isMine(r) && r.coachComment && (r.coachCommentDate || '').startsWith(yesterdayStr)),
    ...campWt.value.filter((r) => isMine(r) && r.dietitianComment && (r.dietitianCommentDate || '').startsWith(yesterdayStr)),
  ].sort((a, b) => ((b as any).dietitianCommentDate || (b as any).coachCommentDate || '').localeCompare((a as any).dietitianCommentDate || (a as any).coachCommentDate || ''));
  const latestComment = comments[0] || null;

  const didSomething = meals.size > 0 || exerciseMins > 0 || !!yesterdayWeight;
  if (!didSomething && !latestComment) return null;
  return { mealCount: meals.size, exerciseMins, weightChange, comment: latestComment };
});

const showDailySummary = computed(() => dailySummary.value !== null && !dailySummaryDismissed.value);
// 昨日体重变化颜色（方向感知：增重时变重为好，减重时变轻为好）
const dailySummaryWeightColor = computed(() => {
  const wc = dailySummary.value?.weightChange;
  if (wc === null || wc === undefined || wc === 0) return 'text-gray-900';
  if (isWeightLoss.value) return wc < 0 ? 'text-[#07C160]' : 'text-orange-500';
  return wc > 0 ? 'text-[#07C160]' : 'text-orange-500';
});
const dismissDailySummary = () => {
  dailySummaryDismissed.value = true;
  localStorage.setItem(_dailySummaryKey, '1');
};

// ---- 今日打卡状态 ----
const todayExerciseDone = computed(() => campEx.value.some((r) => isMine(r) && r.date.startsWith(todayStr)));
const todayWeightDone = computed(() => campWt.value.some((r) => isMine(r) && r.date.startsWith(todayStr)));
const todayDietMeals = computed(() => {
  const meals = new Set(campDiet.value.filter((r) => isMine(r) && r.date.startsWith(todayStr)).map((r) => r.meal));
  return meals;
});
const todayDietDone = computed(() => todayDietMeals.value.size > 0);

// ---- 今日五项打卡环形进度（早餐/午餐/晚餐/运动/体重） ----
const todayProgress = computed(() => {
  let done = 0;
  if (todayDietMeals.value.has('breakfast')) done++;
  if (todayDietMeals.value.has('lunch')) done++;
  if (todayDietMeals.value.has('dinner')) done++;
  if (todayExerciseDone.value) done++;
  if (todayWeightDone.value) done++;
  return done;
});
const todayProgressTotal = 5;
const todayAllDone = computed(() => todayProgress.value >= todayProgressTotal);
// SVG 环形参数：r=22，周长 = 2πr ≈ 138.23
const RING_CIRCUMFERENCE = 2 * Math.PI * 22;
const ringDashOffset = computed(() => RING_CIRCUMFERENCE * (1 - todayProgress.value / todayProgressTotal));
const todayDietLabel = computed(() => {
  const count = todayDietMeals.value.size;
  if (count === 0) return '拍照上传';
  if (count >= 3) return '已完成 ✓';
  return `已记 ${count} 餐`;
});

// ---- 营养师未读批注（仅用于 tabbar badge 计数） ----
const unreadComments = computed(() => {
  const diet = campDiet.value.filter((r) => isMine(r) && r.dietitianComment && !r.commentRead);
  const exercise = campEx.value.filter((r) => isMine(r) && r.coachComment && !r.commentRead);
  const weight = campWt.value.filter((r) => isMine(r) && r.dietitianComment && !r.commentRead);
  return [
    ...diet.map((r) => ({ ...r, _type: 'diet' as const })),
    ...exercise.map((r) => ({ ...r, _type: 'exercise' as const })),
    ...weight.map((r) => ({ ...r, _type: 'weight' as const })),
  ].sort((a, b) => ((b as any).dietitianCommentDate || (b as any).coachCommentDate || '').localeCompare((a as any).dietitianCommentDate || (a as any).coachCommentDate || ''));
});

// 卡片入场动画
const visibleCards = ref<number[]>([]);

// ---- 成就解锁通知 ----
const newAchievements = ref<{ icon: string; title: string; description: string }[]>([]);
const showAchievementNotify = ref(false);
// 记录上次已知的已解锁成就ID（避免每次进页面都弹）
const prevAchievementIds = ref<Set<string>>(new Set());
// 记录上次已知的已达标里程碑阈值（避免重复弹窗）
const prevMilestoneThresholds = ref<Set<number>>(new Set());
// 待展示的成就弹窗（当昨日小结正在展示时，先暂存）
const pendingAchievements = ref<{ icon: string; title: string; description: string }[]>([]);

const dismissAchievementNotify = () => {
  showAchievementNotify.value = false;
  // 记录已看过的成就
  const key = `seen_ach_v2_${store.user?.id || 'anon'}`;
  const all = generateStudentReport(
    { id: store.user?.id || 's1', name: store.user?.name || '', gender: store.user?.gender },
    store.metricConfigs,
    MOCK_STUDENT_METRIC_VALUES[store.user?.id || 's1'] || {},
    campDiet.value.filter(isMine),
    campEx.value.filter(isMine),
    campWt.value.filter(isMine),
  ).achievements.filter((a) => a.unlocked).map((a) => a.id);
  prevAchievementIds.value = new Set(all);
  localStorage.setItem(key, JSON.stringify(all));
  // 同时记录里程碑阈值
  const mKey = `seen_ms_v2_${store.user?.id || 'anon'}`;
  const mThresholds = computeWeightMilestones(myWeightRecords.value, startWeight.value)
    .filter(m => m.achieved).map(m => m.threshold);
  prevMilestoneThresholds.value = new Set(mThresholds);
  localStorage.setItem(mKey, JSON.stringify(mThresholds));
};

// 检测新解锁的成就
function checkNewAchievements() {
  if (!store.user) return;
  const report = generateStudentReport(
    { id: store.user.id, name: store.user.name, gender: store.user.gender },
    store.metricConfigs,
    MOCK_STUDENT_METRIC_VALUES[store.user.id] || {},
    campDiet.value.filter(isMine),
    campEx.value.filter(isMine),
    campWt.value.filter(isMine),
  );
  const unlocked = report.achievements.filter((a) => a.unlocked);
  const fresh = unlocked.filter((a) => !prevAchievementIds.value.has(a.id));

  // 同时检查体重里程碑（3%/5%）
  const ms = computeWeightMilestones(myWeightRecords.value, startWeight.value);
  const newMilestones = ms.filter(m => m.achieved && !prevMilestoneThresholds.value.has(m.threshold));

  if (fresh.length > 0 || newMilestones.length > 0) {
    const items = [
      ...fresh.map((a) => ({ icon: a.icon, title: a.title, description: a.description })),
      ...newMilestones.map((m) => ({
        icon: '🎯',
        title: `减重${Math.round(m.threshold * 100)}%里程碑`,
        description: `恭喜达成减重 ${Math.round(m.threshold * 100)}% 目标`,
      })),
    ];

    // 如果昨日小结正在展示，暂存等关闭后再弹
    if (showDailySummary.value) {
      pendingAchievements.value = items;
    } else {
      newAchievements.value = items;
      showAchievementNotify.value = true;
    }
  }
  // 更新已知已解锁集合
  prevAchievementIds.value = new Set(unlocked.map((a) => a.id));
  prevMilestoneThresholds.value = new Set(ms.filter(m => m.achieved).map(m => m.threshold));
}

// 监听打卡记录变化（从子页面打卡后返回首页时触发）
const checkinRecordCount = computed(() => ({
  diet: campDiet.value.filter(isMine).length,
  exercise: campEx.value.filter(isMine).length,
  weight: campWt.value.filter(isMine).length,
}));

watch(checkinRecordCount, (newVal, oldVal) => {
  // 只在记录数增加时检测（说明完成了新打卡）
  const increased = newVal.diet > (oldVal?.diet ?? 0) ||
    newVal.exercise > (oldVal?.exercise ?? 0) ||
    newVal.weight > (oldVal?.weight ?? 0);
  if (!increased) return;
  // 延迟检测，避免与昨日小结弹窗冲突
  const tryCheck = () => {
    if (showDailySummary.value) {
      // 昨日小结还在展示，等它关闭后再检测
      setTimeout(tryCheck, 600);
      return;
    }
    checkNewAchievements();
  };
  setTimeout(tryCheck, 800);
});

// 监听昨日小结关闭后，如果有待展示的成就弹窗，则展示
watch(showDailySummary, (val) => {
  if (!val && pendingAchievements.value.length > 0) {
    newAchievements.value = pendingAchievements.value;
    pendingAchievements.value = [];
    showAchievementNotify.value = true;
  }
});

onMounted(() => {
  const delays = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
  delays.forEach((delay, idx) => {
    setTimeout(() => visibleCards.value.push(idx), delay);
  });

  // 页面加载时初始化 baseline
  if (store.user) {
    // 使用版本化 key，避免旧版 mock 数据残留的 baseline 干扰
    const key = `seen_ach_v2_${store.user.id}`;
    let seenIds: string[] = [];
    try { seenIds = JSON.parse(localStorage.getItem(key) || '[]'); } catch { /* */ }
    if (seenIds.length > 0) {
      prevAchievementIds.value = new Set(seenIds);
    } else {
      // 首次使用：记录当前已解锁的成就为 baseline，不弹窗
      const report = generateStudentReport(
        { id: store.user.id, name: store.user.name, gender: store.user.gender },
        store.metricConfigs,
        MOCK_STUDENT_METRIC_VALUES[store.user.id] || {},
        campDiet.value.filter(isMine),
        campEx.value.filter(isMine),
        campWt.value.filter(isMine),
      );
      const unlocked = report.achievements.filter((a) => a.unlocked).map((a) => a.id);
      prevAchievementIds.value = new Set(unlocked);
      localStorage.setItem(key, JSON.stringify(unlocked));
    }
    // 同步初始化里程碑 baseline
    const mKey = `seen_ms_v2_${store.user.id}`;
    let seenMs: number[] = [];
    try { seenMs = JSON.parse(localStorage.getItem(mKey) || '[]'); } catch { /* */ }
    if (seenMs.length > 0) {
      prevMilestoneThresholds.value = new Set(seenMs);
    } else {
      const ms = computeWeightMilestones(myWeightRecords.value, startWeight.value)
        .filter(m => m.achieved).map(m => m.threshold);
      prevMilestoneThresholds.value = new Set(ms);
      localStorage.setItem(mKey, JSON.stringify(ms));
    }

    // 如果刚完成打卡，立即检测新成就（不被昨日小结阻塞）
    if (store.justCheckedIn) {
      store.justCheckedIn = false;
      // 短延迟确保组件渲染完成
      setTimeout(() => checkNewAchievements(), 300);
    }
  }
});
</script>

<template>
  <div class="flex min-h-full flex-col bg-[#F4F6F8] pb-28 font-sans relative">
    <!-- Dynamic Background Header -->
    <div class="relative pt-[calc(env(safe-area-inset-top)+2.5rem)] px-6 pb-8 bg-gradient-to-br from-[#07C160] via-[#06b558] to-[#03a14f] rounded-b-[32px] shadow-[0_10px_34px_-14px_rgba(7,193,96,0.5)] overflow-hidden">
      <div class="absolute -top-12 -right-12 w-64 h-64 bg-white/15 rounded-full blur-3xl pointer-events-none"></div>
      <div class="absolute -bottom-16 -left-10 w-56 h-56 bg-white/10 rounded-full blur-3xl pointer-events-none"></div>

      <div class="relative z-10 flex justify-between items-center mb-6">
        <button v-if="showCampSwitcher" @click="showCampPicker = true" class="text-sm font-bold text-white flex items-center gap-1.5 px-3 py-1.5 bg-white/15 rounded-full backdrop-blur-md shrink-0 max-w-[65%] active:scale-95 transition-transform">
          <Medal class="h-4 w-4 text-amber-300 shrink-0" />
          <span class="truncate">{{ activeCamp?.name || '健康训练营' }}</span>
          <ChevronDown class="h-3 w-3 text-white/70 shrink-0" />
        </button>
        <h1 v-else class="text-sm font-bold text-white flex items-center gap-1.5 px-3 py-1.5 bg-white/15 rounded-full backdrop-blur-md shrink-0 max-w-[65%]">
          <Medal class="h-4 w-4 text-amber-300 shrink-0" />
          <span class="truncate">{{ activeCamp?.name || '健康训练营' }}</span>
        </h1>
        <button @click="store.logout()" class="text-white/95 hover:text-white transition-colors flex items-center gap-1 text-xs bg-white/15 px-3 py-1.5 rounded-full backdrop-blur-md shrink-0 ml-2">
          <LogOut class="h-3 w-3 shrink-0" /> 退出
        </button>
      </div>

      <div class="relative z-10 flex items-start space-x-4">
        <div class="h-16 w-16 rounded-full bg-white/95 p-1 shadow-lg shrink-0 overflow-hidden">
          <GenderAvatar :gender="store.user?.gender" />
        </div>
        <div class="flex-1 min-w-0">
          <h2 class="text-2xl font-black text-white tracking-tight truncate">你好，{{ store.user?.name || '学员' }}</h2>
          <div class="flex items-start gap-2 mt-2">
            <span class="text-[11px] font-bold text-[#07C160] bg-white px-2 py-0.5 rounded-full tracking-wide shrink-0 mt-0.5">DAY {{ campDay }}</span>
            <span class="text-xs text-white/95 font-medium tracking-wide leading-snug min-h-[36px] break-words break-all">{{ todayQuote }}</span>
          </div>
        </div>
        <!-- 今日五项打卡环形进度 -->
        <div class="relative w-14 h-14 shrink-0 rounded-full bg-white/20 flex items-center justify-center cursor-pointer" title="今日打卡进度" @click="store.setCurrentView('calendar')">
          <svg viewBox="0 0 56 56" class="w-14 h-14 -rotate-90">
            <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="5" />
            <circle
              cx="28" cy="28" r="22" fill="none"
              :stroke="todayAllDone ? '#F6C453' : '#ffffff'"
              stroke-width="5"
              stroke-linecap="round"
              :stroke-dasharray="RING_CIRCUMFERENCE"
              :stroke-dashoffset="ringDashOffset"
              class="ring-progress"
            />
          </svg>
          <div class="absolute inset-0 flex flex-col items-center justify-center">
            <template v-if="todayAllDone">
              <svg viewBox="0 0 12 12" class="w-4 h-4 check-pop"><path d="M2 6.5 L4.8 9 L10 3" fill="none" stroke="#F6C453" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="check-path" /></svg>
              <span class="text-[8px] font-bold text-white leading-none mt-0.5">完成</span>
            </template>
            <template v-else>
              <span class="text-xs font-black text-white leading-none">{{ todayProgress }}<span class="text-[9px] font-bold text-white/60">/5</span></span>
              <span class="text-[8px] text-white/70 leading-none mt-0.5">今日</span>
            </template>
          </div>
        </div>
      </div>
    </div>

    <div class="flex-1 px-5 pt-5 space-y-5 relative z-20">
      <!-- 体重 + 排名（2列卡片） -->
      <div class="grid grid-cols-2 gap-4 items-stretch">
        <!-- 最新体重卡（含体重变化 + 目标进度） -->
        <Card :class="['flex flex-col justify-center p-5 border-0 relative overflow-hidden h-full transition-all', campNotStarted ? 'cursor-not-allowed opacity-60 grayscale' : 'cursor-pointer hover:shadow-lg shadow-[0_4px_20px_-8px_rgba(15,23,42,0.14)]']" @click="guardCheckin('weight-checkin')">
          <div class="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[#07C160]/20 to-teal-100 rounded-full blur-2xl transform translate-x-1/4 -translate-y-1/4 z-0 pointer-events-none"></div>
          <div class="relative z-10">
            <div class="flex items-center gap-1 mb-2">
              <Target class="w-4 h-4 text-[#07C160] shrink-0" />
              <div class="text-xs text-gray-500 font-bold truncate">当前体重</div>
            </div>
            <div class="flex items-end gap-1">
              <span class="text-3xl font-black text-gray-900 tracking-tighter truncate">{{ latestWeight ?? '--' }}</span>
              <span class="text-sm mb-1 text-gray-500 font-medium shrink-0">kg</span>
            </div>
            <div v-if="weightChange !== null" :class="['text-[11px] font-bold mt-1.5 flex items-center gap-0.5', isWeightChangeGood === null ? 'text-gray-400' : isWeightChangeGood ? 'text-[#07C160]' : 'text-orange-500']">
              <TrendingDown v-if="weightChange < 0" class="w-3 h-3" />
              <TrendingUp v-else-if="weightChange > 0" class="w-3 h-3" />
              <Minus v-else class="w-3 h-3" />
              较开营 {{ weightChange > 0 ? '+' : '' }}{{ weightChange }}kg
            </div>
            <div v-if="targetProgress !== null" class="mt-2">
              <div class="h-1 bg-gray-100 rounded-full overflow-hidden">
                <div class="h-full rounded-full transition-all duration-700" :class="isWeightLoss ? 'bg-gradient-to-r from-[#07C160] to-[#04a551]' : 'bg-gradient-to-r from-[#1677FF] to-[#0958d9]'" :style="{ width: targetProgress + '%' }"></div>
              </div>
              <div class="text-[10px] text-gray-400 mt-1">
                <template v-if="gapToTarget !== null && gapToTarget <= 0">已达成{{ isWeightLoss ? '减重' : '增重' }}目标 🎉</template>
                <template v-else>距{{ isWeightLoss ? '减重' : '增重' }}目标 {{ Math.abs(gapToTarget) }}kg · {{ targetProgress }}%</template>
              </div>
            </div>
          </div>
        </Card>

        <!-- 排名卡（含总积分 + 距前一名分差） -->
        <Card class="flex flex-col justify-center p-5 cursor-pointer hover:shadow-lg transition-shadow border-0 shadow-[0_4px_20px_-8px_rgba(15,23,42,0.14)] relative overflow-hidden h-full" @click="store.setCurrentView('ranking')">
          <div class="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[#FF976A]/20 to-orange-100 rounded-full blur-2xl transform translate-x-1/4 -translate-y-1/4 z-0 pointer-events-none"></div>
          <div class="relative z-10 flex flex-col h-full justify-between">
            <div>
              <div class="flex items-center gap-1 mb-2">
                <Trophy class="w-4 h-4 text-[#FF976A] shrink-0" />
                <div class="text-xs text-gray-500 font-bold truncate">我的排名</div>
              </div>
              <div class="flex items-end gap-1">
                <span class="text-[28px] font-black text-gray-900 tracking-tighter truncate">第{{ scoreData?.rank || '--' }}位</span>
              </div>
            </div>
            <div class="text-xs text-gray-500 font-medium mt-1 truncate">
              <template v-if="gapToAhead !== null">距前一名差 {{ gapToAhead }} 分</template>
              <template v-else-if="scoreData?.rank === 1">保持榜首 👑</template>
              <template v-else>完成打卡即可涨分</template>
            </div>
            <div class="text-xs text-[#07C160] font-bold mt-0.5 truncate">总计 {{ scoreData?.totalScore || 0 }} 分</div>
          </div>
        </Card>
      </div>

      <!-- 每日打卡任务 -->
      <div>
        <h3 class="text-sm font-bold text-gray-900 mb-3 ml-1 flex items-center gap-1.5">
          <div class="w-1.5 h-4 bg-[#07C160] rounded-full"></div>
          每日打卡任务
        </h3>
        <div class="grid grid-cols-3 gap-3">
          <Card :class="['flex flex-col items-center justify-center py-6 border-0 shadow-sm card-enter relative overflow-hidden transition-all', campNotStarted ? 'cursor-not-allowed opacity-60 grayscale' : 'cursor-pointer hover:ring-2 ring-[#07C160] active:scale-[0.96]', visibleCards.includes(3) ? 'card-enter-active' : '']" @click="guardCheckin('exercise')">
            <div class="absolute -top-6 -right-4 w-24 h-24 bg-gradient-to-br from-[#07C160]/12 to-green-50 rounded-full blur-2xl pointer-events-none"></div>
            <div class="relative z-10 flex flex-col items-center">
              <div :class="['w-12 h-12 rounded-full flex items-center justify-center mb-3 shadow-sm', campNotStarted ? 'bg-gray-200 text-gray-400' : todayExerciseDone ? 'bg-[#07C160]/15 text-[#07C160]' : 'bg-gradient-to-br from-[#07C160] to-green-500 text-white animate-pulse hover:scale-110']">
                <Activity class="h-6 w-6" />
              </div>
              <div class="text-sm font-bold text-gray-900 mb-0.5">运动打卡</div>
              <div :class="['text-[10px]', campNotStarted ? 'text-gray-400' : todayExerciseDone ? 'text-[#07C160] font-bold' : 'text-gray-400']">{{ campNotStarted ? '营期未开始' : (todayExerciseDone ? '已完成 ✓' : '记录消耗') }}</div>
            </div>
          </Card>

          <Card :class="['flex flex-col items-center justify-center py-6 border-0 shadow-sm card-enter relative overflow-hidden transition-all', campNotStarted ? 'cursor-not-allowed opacity-60 grayscale' : 'cursor-pointer hover:ring-2 ring-[#FF976A] active:scale-[0.96]', visibleCards.includes(4) ? 'card-enter-active' : '']" @click="guardCheckin('diet')">
            <div class="absolute -top-6 -right-4 w-24 h-24 bg-gradient-to-br from-[#FF976A]/12 to-orange-50 rounded-full blur-2xl pointer-events-none"></div>
            <div class="relative z-10 flex flex-col items-center">
              <div :class="['w-12 h-12 rounded-full flex items-center justify-center mb-3 shadow-sm', campNotStarted ? 'bg-gray-200 text-gray-400' : todayDietDone ? 'bg-[#FF976A]/15 text-[#FF976A]' : 'bg-gradient-to-br from-[#FF976A] to-orange-400 text-white animate-pulse hover:scale-110']">
                <Coffee class="h-6 w-6" />
              </div>
              <div class="text-sm font-bold text-gray-900 mb-0.5">饮食打卡</div>
              <div :class="['text-[10px]', campNotStarted ? 'text-gray-400' : todayDietDone ? 'text-[#07C160] font-bold' : 'text-gray-400']">{{ campNotStarted ? '营期未开始' : todayDietLabel }}</div>
            </div>
          </Card>

          <Card :class="['flex flex-col items-center justify-center py-6 border-0 shadow-sm card-enter relative overflow-hidden transition-all', campNotStarted ? 'cursor-not-allowed opacity-60 grayscale' : 'cursor-pointer hover:ring-2 ring-[#1677FF] active:scale-[0.96]', visibleCards.includes(5) ? 'card-enter-active' : '']" @click="guardCheckin('weight-checkin')">
            <div class="absolute -top-6 -right-4 w-24 h-24 bg-gradient-to-br from-[#1677FF]/12 to-blue-50 rounded-full blur-2xl pointer-events-none"></div>
            <div class="relative z-10 flex flex-col items-center">
              <div :class="['w-12 h-12 rounded-full flex items-center justify-center mb-3 shadow-sm', campNotStarted ? 'bg-gray-200 text-gray-400' : todayWeightDone ? 'bg-[#1677FF]/15 text-[#1677FF]' : 'bg-gradient-to-br from-[#1677FF] to-blue-500 text-white animate-pulse hover:scale-110']">
                <Scale class="h-6 w-6" />
              </div>
              <div class="text-sm font-bold text-gray-900 mb-0.5">体重打卡</div>
              <div :class="['text-[10px]', campNotStarted ? 'text-gray-400' : todayWeightDone ? 'text-[#07C160] font-bold' : 'text-gray-400']">{{ campNotStarted ? '营期未开始' : (todayWeightDone ? '已完成 ✓' : '见证蜕变') }}</div>
            </div>
          </Card>
        </div>
      </div>

      <!-- 营期回顾与指导 -->
      <div>
        <h3 class="text-sm font-bold text-gray-900 mb-3 ml-1 flex items-center gap-1.5 mt-2">
          <div class="w-1.5 h-4 bg-[#04a551] rounded-full"></div>
          营期回顾与指导
        </h3>
        <div class="grid grid-cols-2 gap-3">
          <Card class="p-5 cursor-pointer hover:shadow-md transition-shadow border-0 shadow-sm flex flex-col justify-between h-32 bg-white relative overflow-hidden" @click="store.setCurrentView('calendar')">
            <div class="absolute -top-8 -right-6 w-32 h-32 bg-gradient-to-br from-orange-100/50 to-orange-50 rounded-full blur-2xl pointer-events-none"></div>
            <div class="relative z-10">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-100 to-orange-50 flex items-center justify-center text-orange-500 mb-2 shadow-sm">
                <Calendar class="h-5 w-5" />
              </div>
              <div>
                <div class="text-sm font-bold text-gray-900">打卡日历</div>
                <div class="text-[11px] text-gray-500 mt-0.5">查看历史记录</div>
              </div>
            </div>
          </Card>

          <Card class="p-5 cursor-pointer hover:shadow-md transition-shadow border-0 shadow-sm flex flex-col justify-between h-32 bg-white relative overflow-hidden" @click="store.setCurrentView('activities-list')">
            <div class="absolute -top-8 -right-6 w-32 h-32 bg-gradient-to-br from-blue-100/50 to-blue-50 rounded-full blur-2xl pointer-events-none"></div>
            <div class="relative z-10">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-100 to-blue-50 flex items-center justify-center text-blue-500 mb-2 shadow-sm">
                <PlayCircle class="h-5 w-5" />
              </div>
              <div>
                <div class="text-sm font-bold text-gray-900">锻炼活动</div>
                <div class="text-[11px] text-gray-500 mt-0.5">健康指导与教学</div>
              </div>
            </div>
          </Card>

          <!-- 个人历程入口 - 首期上线版暂移除，后续版本上线 -->
          <!-- <Card class="col-span-2 p-5 cursor-pointer hover:shadow-md transition-shadow border-0 shadow-sm h-32 bg-white relative overflow-hidden" @click="store.setCurrentView('personal-journey')">
            <div class="absolute -top-10 -right-8 w-44 h-44 bg-gradient-to-br from-[#07C160]/12 to-green-50 rounded-full blur-2xl pointer-events-none"></div>
            <div class="absolute -bottom-14 -right-2 w-36 h-36 bg-gradient-to-br from-teal-50 to-[#07C160]/8 rounded-full blur-2xl pointer-events-none"></div>
            <div class="relative z-10 h-full flex items-center justify-between">
              <div class="flex items-center gap-4">
                <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-[#07C160] to-[#04a551] flex items-center justify-center text-white shrink-0 shadow-sm">
                  <BookOpen class="h-6 w-6" />
                </div>
                <div>
                  <div class="text-sm font-bold text-gray-900">个人历程</div>
                  <div class="text-[11px] text-gray-500 mt-0.5">减重报告 · 成就解锁 · 数据趋势</div>
                  <div class="flex gap-1.5 mt-2">
                    <span class="text-[9px] font-bold text-[#07C160] bg-[#07C160]/8 px-2 py-0.5 rounded-full">报告</span>
                    <span class="text-[9px] font-bold text-[#FF976A] bg-[#FF976A]/8 px-2 py-0.5 rounded-full">成就</span>
                    <span class="text-[9px] font-bold text-[#1677FF] bg-[#1677FF]/8 px-2 py-0.5 rounded-full">趋势</span>
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <span class="text-[10px] text-gray-400 font-medium">查看详情</span>
                <ChevronRight class="w-4 h-4 text-gray-300" />
              </div>
            </div>
          </Card> -->

        </div>
      </div>
    </div>

    <!-- Bottom Nav (Vant Tabbar) - 首期上线版：首页 / 档案 -->
    <VanTabbar class="custom-tabbar" :model-value="0">
      <VanTabbarItem>
        <template #icon><Activity class="h-6 w-6" /></template>
        首页
      </VanTabbarItem>
      <VanTabbarItem @click="store.setCurrentView('health-profile')">
        <template #icon><FileText class="h-6 w-6" /></template>
        档案
      </VanTabbarItem>
    </VanTabbar>

    <!-- 昨日小结弹层（今天首次打开时展示） -->
    <Teleport to="body">
      <Transition name="summary-fade">
        <div v-if="showDailySummary" class="fixed inset-0 z-[999] bg-black/40 flex items-end justify-center" @click.self="dismissDailySummary">
          <div class="w-full max-w-md bg-white rounded-t-3xl p-6 pb-8 summary-slide-up">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-base font-black text-gray-900 flex items-center gap-2">
                <div class="w-8 h-8 rounded-full bg-gradient-to-br from-[#07C160] to-teal-500 flex items-center justify-center">
                  <BookOpen class="w-4 h-4 text-white" />
                </div>
                昨日小结
              </h3>
              <button @click="dismissDailySummary" class="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-transform">
                <X class="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <!-- 三项数据 -->
            <div class="grid grid-cols-3 gap-2 mb-4">
              <div class="bg-orange-50 rounded-xl p-3 text-center">
                <Coffee class="w-4 h-4 text-[#FF976A] mx-auto mb-1" />
                <div class="text-lg font-black text-gray-900">{{ dailySummary!.mealCount }}<span class="text-[10px] font-normal text-gray-400 ml-0.5">餐</span></div>
                <div class="text-[10px] text-gray-500">饮食打卡</div>
              </div>
              <div class="bg-green-50 rounded-xl p-3 text-center">
                <Activity class="w-4 h-4 text-[#07C160] mx-auto mb-1" />
                <div class="text-lg font-black text-gray-900">{{ dailySummary!.exerciseMins }}<span class="text-[10px] font-normal text-gray-400 ml-0.5">分钟</span></div>
                <div class="text-[10px] text-gray-500">运动时长</div>
              </div>
              <div class="bg-blue-50 rounded-xl p-3 text-center">
                <Scale class="w-4 h-4 text-[#1677FF] mx-auto mb-1" />
                <div v-if="dailySummary!.weightChange !== null" :class="['text-lg font-black', dailySummaryWeightColor]">
                  {{ dailySummary!.weightChange > 0 ? '+' : '' }}{{ dailySummary!.weightChange }}<span class="text-[10px] font-normal text-gray-400 ml-0.5">kg</span>
                </div>
                <div v-else class="text-lg font-black text-gray-300">--</div>
                <div class="text-[10px] text-gray-500">体重变化</div>
              </div>
            </div>

            <!-- 营养师一句话 -->
            <div v-if="dailySummary!.comment" class="bg-[#07C160]/5 border border-[#07C160]/15 rounded-xl p-3 mb-4">
              <div class="flex items-center gap-1.5 mb-1">
                <MessageCircle class="w-3 h-3 text-[#07C160]" />
                <span class="text-[10px] font-bold text-[#07C160]">{{ (dailySummary!.comment as any).dietitianName || (dailySummary!.comment as any).coachName || '老师' }} 昨天对你说</span>
              </div>
              <p class="text-xs text-gray-700 leading-relaxed line-clamp-2">{{ (dailySummary!.comment as any).dietitianComment || (dailySummary!.comment as any).coachComment }}</p>
            </div>

            <button @click="dismissDailySummary" class="w-full py-3 rounded-xl bg-gradient-to-r from-[#07C160] to-[#06b558] text-white text-sm font-bold active:scale-[0.98] transition-transform shadow-lg shadow-[#07C160]/20">
              开启今天 ->
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 成就解锁通知弹层 -->
    <Teleport to="body">
      <Transition name="summary-fade">
        <div v-if="showAchievementNotify" class="fixed inset-0 z-[998] bg-black/40 flex items-center justify-center px-8" @click.self="dismissAchievementNotify">
          <div class="bg-white rounded-3xl p-6 max-w-sm w-full text-center summary-slide-up">
            <div class="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-yellow-100 to-orange-100 flex items-center justify-center mb-3">
              <Sparkles class="w-8 h-8 text-[#FF976A]" />
            </div>
            <h3 class="text-base font-black text-gray-900 mb-1">恭喜解锁新成就！</h3>
            <p class="text-xs text-gray-400 mb-4">你达成了{{ newAchievements.length > 1 ? `${newAchievements.length}个里程碑` : '一个里程碑' }}</p>
            <div class="space-y-3 mb-5">
              <div v-for="ach in newAchievements" :key="ach.title" class="flex items-center gap-3 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-xl p-3">
                <div class="w-11 h-11 rounded-full bg-gradient-to-br from-yellow-100 to-orange-100 flex items-center justify-center text-2xl shrink-0">{{ ach.icon }}</div>
                <div class="text-left flex-1 min-w-0">
                  <div class="text-sm font-bold text-gray-900">{{ ach.title }}</div>
                  <div class="text-[10px] text-gray-500 leading-tight">{{ ach.description }}</div>
                </div>
              </div>
            </div>
            <button @click="dismissAchievementNotify" class="w-full py-3 rounded-xl bg-gradient-to-r from-[#FF976A] to-[#F7941D] text-white text-sm font-bold active:scale-[0.98] transition-transform shadow-lg shadow-orange-500/20">
              继续加油 ->
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 营期选择弹窗 -->
    <VanPopup v-model:show="showCampPicker" position="bottom" round class="custom-popup">
      <div class="p-4">
        <h3 class="font-bold text-gray-900 text-base mb-3 text-center">选择营期</h3>
        <div class="space-y-2">
          <button
            v-for="camp in availableCamps"
            :key="camp.id"
            @click="handleCampSelect(camp.id)"
            :class="[
              'w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all',
              activeCampId === camp.id
                ? 'border-[#07C160] bg-green-50 text-[#07C160]'
                : 'border-gray-200 bg-white text-gray-700 active:bg-gray-50',
            ]"
          >
            <div>
              <span class="font-medium">{{ camp.name }}</span>
              <span v-if="camp.startDate && camp.endDate" class="text-xs text-gray-400 ml-2">{{ camp.startDate }} ~ {{ camp.endDate }}</span>
            </div>
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
  </div>
</template>

<style scoped>
/* 激励语：渐变流光效果 */
.motivational-gradient {
  background: linear-gradient(90deg, #07C160, #1677FF, #FF976A, #F59E0B, #07C160);
  background-size: 200% auto;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: motivationalShimmer 5s linear infinite;
}
@keyframes motivationalShimmer {
  0% { background-position: 0% center; }
  100% { background-position: 200% center; }
}
/* 闪烁星星脉动 */
.sparkle-pulse {
  animation: sparklePulse 2s ease-in-out infinite;
}
@keyframes sparklePulse {
  0%, 100% { opacity: 0.5; transform: scale(0.85); }
  50% { opacity: 1; transform: scale(1.15); }
}

@keyframes popIn {
  0% { transform: scale(0.8); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
.animate-pop-in {
  animation: popIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
.card-enter {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.4s ease-out, transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.card-enter-active {
  opacity: 1;
  transform: translateY(0);
}
/* 打卡完成勾：圆点弹入 + 对勾画线 */
@keyframes checkPop {
  0% { transform: scale(0); }
  60% { transform: scale(1.25); }
  100% { transform: scale(1); }
}
.check-pop {
  animation: checkPop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
.check-path {
  stroke-dasharray: 14;
  stroke-dashoffset: 14;
  animation: checkDraw 0.3s ease-out 0.2s forwards;
}
@keyframes checkDraw {
  to { stroke-dashoffset: 0; }
}
/* 今日进度环：平滑过渡 */
.ring-progress {
  transition: stroke-dashoffset 0.5s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.3s ease;
}
/* 昨日小结弹层 */
.summary-slide-up {
  animation: summaryUp 0.35s cubic-bezier(0.34, 1.2, 0.64, 1) forwards;
}
@keyframes summaryUp {
  0% { transform: translateY(100%); }
  100% { transform: translateY(0); }
}
.summary-fade-enter-active,
.summary-fade-leave-active {
  transition: opacity 0.25s ease;
}
.summary-fade-enter-from,
.summary-fade-leave-to {
  opacity: 0;
}
</style>
