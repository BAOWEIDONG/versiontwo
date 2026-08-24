<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useAppStore } from '../store/app';
import { campDateRange, campDaysOf } from '../lib/camps';
import { NavBar, Card, StudentTabbar } from './ui';
import { Trophy, TrendingDown, TrendingUp, Activity, Target, Flame, Heart, Download, Lock, MessageCircle, FileText, Bell, Gift } from 'lucide-vue-next';
import { Popup as VanPopup } from 'vant';
import { MOCK_STUDENT_METRIC_VALUES } from '../mock/data';
import { generateStudentReport, weightTrendToSvgPoints } from '../lib/campReport';
import { exportElementAsImage } from '../lib/exportImage';
import type { StudentCampReport, MetricChange } from '../types';

const store = useAppStore();

// 获取当前学员数据
const studentId = computed(() => store.user?.id || 's1');
const studentName = computed(() => store.user?.name || '学员');
const studentGender = computed(() => store.user?.gender);

// ─── 营期切换（学员可能在多个营期中） ───
const studentCamps = computed(() => store.getStudentCamps(studentId.value));
const selectedCampId = ref<string>('');
const showCampPicker = ref(false);
const selectedCamp = computed(() => studentCamps.value.find((c) => c.id === selectedCampId.value) || null);

// 初始化选中营期（优先 active，其次 ended）
watch(() => studentId.value, (id) => {
  if (id) {
    const camp = store.getStudentCamp(id);
    if (camp) selectedCampId.value = camp.id;
  }
}, { immediate: true });

// 营期信息
const campInfo = computed(() => selectedCamp.value || store.getStudentCamp(studentId.value));
const campDays = computed(() => {
  if (campInfo.value?.startDate && campInfo.value?.endDate) {
    return campDaysOf(campInfo.value);
  }
  return store.getCampDays(studentId.value);
});
// 学员端结营报告不再上锁：营期未结束也可随时打开查看（数据为截至当前的累计）
const canView = computed(() => true);

// 按营期过滤打卡记录
const campDietRecords = computed(() => selectedCampId.value ? store.getCampDietRecords(selectedCampId.value) : store.dietRecords);
const campExerciseRecords = computed(() => selectedCampId.value ? store.getCampExerciseRecords(selectedCampId.value) : store.exerciseRecords);
const campWeightRecords = computed(() => selectedCampId.value ? store.getCampWeightRecords(selectedCampId.value) : store.weightRecords);

// 未读批注数（tabbar badge）
const unreadCount = computed(() => {
  if (store.user?.role !== 'student') return 0;
  const id = store.user.id;
  const diet = campDietRecords.value.filter((r) => r.studentId === id && r.dietitianComment && !r.commentRead);
  const ex = campExerciseRecords.value.filter((r) => r.studentId === id && r.coachComment && !r.commentRead);
  const wt = campWeightRecords.value.filter((r) => r.studentId === id && r.dietitianComment && !r.commentRead);
  return diet.length + ex.length + wt.length;
});

// 体重记录（当前学员，按营期过滤）
const studentWeights = computed(() =>
  campWeightRecords.value.filter((r) => r.studentId === studentId.value),
);

// 饮食记录（当前学员，按营期过滤）
const studentDiets = computed(() =>
  campDietRecords.value.filter((r) => r.studentId === studentId.value),
);

// 运动记录（当前学员，按营期过滤）
const studentExercises = computed(() =>
  campExerciseRecords.value.filter((r) => r.studentId === studentId.value),
);

// 生成结营报告
const report = computed<StudentCampReport>(() =>
  generateStudentReport(
    { id: studentId.value, name: studentName.value, gender: studentGender.value },
    store.metricConfigs,
    MOCK_STUDENT_METRIC_VALUES[studentId.value] || MOCK_STUDENT_METRIC_VALUES['s1'] || {},
    studentDiets.value,
    studentExercises.value,
    studentWeights.value,
    campDays.value,
  ),
);

// 体重趋势 SVG
const svgPoints = computed(() => weightTrendToSvgPoints(report.value.weightTrend, 280, 100, 20));

// 按分类分组的关键指标变化（改善的排前面，让学员优先看到好结果）
const bodyCompositionMetrics = computed(() =>
  report.value.metricChanges
    .filter((m) => m.category === '身体测量数据')
    .sort((a, b) => {
      // 有前后值的排前面，改善的排前面
      const aHas = a.beforeValue !== null || a.afterValue !== null;
      const bHas = b.beforeValue !== null || b.afterValue !== null;
      if (aHas !== bHas) return aHas ? -1 : 1;
      if (aHas && bHas) {
        if (a.isImproved !== b.isImproved) return a.isImproved ? -1 : 1;
      }
      return 0;
    }),
);

const labMetrics = computed(() =>
  report.value.metricChanges
    .filter((m) => m.category !== '身体测量数据')
    .sort((a, b) => {
      const aHas = a.beforeValue !== null || a.afterValue !== null;
      const bHas = b.beforeValue !== null || b.afterValue !== null;
      if (aHas !== bHas) return aHas ? -1 : 1;
      if (aHas && bHas) {
        if (a.isImproved !== b.isImproved) return a.isImproved ? -1 : 1;
      }
      return 0;
    }),
);

// 解锁的成就
const unlockedAchievements = computed(() => report.value.achievements.filter((a) => a.unlocked));

// 营养师结营寄语（按营期存储，key = `${campId}_${studentId}`）
const campMessage = computed(() => {
  const sid = store.user?.id;
  const cid = selectedCampId.value || campInfo.value?.id;
  if (!sid || !cid) return '';
  return store.getCampMessage(cid, sid);
});
const dietitianName = computed(() => {
  const names = [campDietRecords.value, campExerciseRecords.value, campWeightRecords.value]
    .flat()
    .map((r) => (r as any).dietitianName || (r as any).coachName)
    .filter(Boolean);
  return names.length > 0 ? names[names.length - 1] : '营养师';
});

// 目标达成度（学员在体重打卡页设置的目标体重）
const targetInfo = computed(() => {
  const target = store.user?.targetWeight;
  const start = report.value.weightTrend.startWeight;
  const end = report.value.weightTrend.endWeight;
  if (!target || start === null || end === null) return null;
  const needLose = start - target;      // 需要减的总量
  const actualLose = start - end;       // 实际减的
  if (needLose <= 0) {
    return { target, end, achieved: end <= target, progress: end <= target ? 1 : 0, text: end <= target ? '已达到目标体重' : '目标体重高于开营体重' };
  }
  const progress = Math.min(Math.max(actualLose / needLose, 0), 1.5);
  return { target, end, achieved: end <= target, progress, remaining: Math.max(end - target, 0) };
});

// 格式化
const fmt = (v: number | null, digits = 1): string => v === null ? '--' : v.toFixed(digits);
const fmtPct = (v: number | null): string => v === null ? '--' : `${(v * 100).toFixed(0)}%`;

const fmtChange = (v: number | null, unit = ''): string => {
  if (v === null) return '--';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(1)}${unit ? ' ' + unit : ''}`;
};

// 指标变化展示文本
const metricChangeText = (m: MetricChange): string => {
  if (m.change === null) return '未检测';
  return fmtChange(m.change, m.unit);
};

// 指标变化颜色
const metricChangeColor = (m: MetricChange): string => {
  if (m.change === null) return 'text-gray-400';
  return m.isImproved ? 'text-[#07C160]' : 'text-orange-500';
};

// 体重变化趋势箭头
const weightTrendIcon = computed(() => {
  if (report.value.weightTrend.trend === 'decreasing') return TrendingDown;
  if (report.value.weightTrend.trend === 'increasing') return TrendingUp;
  return Activity;
});

// 顶部鼓励语：数据自适应展示本营期「最亮的一面」——锚定本人真实进步，而非平铺全部指标；
// 且不造假：没有身体亮点时按实际坚持程度给有依据的鼓励，而非万能套话。
const encouragement = computed(() => {
  const s = report.value.summary;
  const name = studentName.value;
  const parts: string[] = [];
  // 1) 体重维度：优先百分比(归一化到体型)，否则绝对公斤
  if (s.weightLossPercent !== null && s.weightLossPercent > 0) {
    parts.push(`体重下降${s.weightLossPercent.toFixed(1)}%`);
  } else if (s.weightLossKg !== null && s.weightLossKg > 0) {
    parts.push(`减重${s.weightLossKg.toFixed(1)}公斤`);
  }
  // 2) 体成分：肌肉增加独立成亮点(含体重未降的「减脂增肌」重塑)；体脂降仅在不与体重重复时补充，避免注水
  if (s.muscleChangeKg !== null && s.muscleChangeKg > 0) parts.push(`肌肉增加${s.muscleChangeKg.toFixed(1)}公斤`);
  if (s.bodyFatLossKg !== null && s.bodyFatLossKg > 0 && !(s.weightLossKg !== null && s.weightLossKg > 0)) parts.push(`体脂减少${s.bodyFatLossKg.toFixed(1)}公斤`);
  // 3) 健康指标正常化
  if (s.abnormalImprovedCount > 0) parts.push(`${s.abnormalImprovedCount}项异常指标恢复正常`);
  // 4) 坚持维度：与身体数据互为补充，长连击优先、其次高完成率
  if (s.longestStreak >= 7) parts.push(`最长连续打卡${s.longestStreak}天`);
  else if (s.completionRate !== null && s.completionRate >= 0.8) parts.push(`打卡完成率${fmtPct(s.completionRate)}`);

  if (parts.length > 0) {
    // 最多取 3 句，避免罗列过载
    return `恭喜你，${name}！本次营期${parts.slice(0, 3).join('，')}，这些变化的背后，是你每天的自律与坚持。`;
  }
  // 无身体数据亮点：肯定坚持过程(有依据、不造假)
  if (s.totalCheckinDays > 0) {
    return `无论如何，你在这个营期坚持打卡了${s.totalCheckinDays}天。别用一次数字否定自己的努力，改变正在习惯里悄悄发生。${name}，继续加油！`;
  }
  // 数据尚在累积（刚开营记录少）
  return `${name}，你已获得了这份结营报告。请继续保持打卡习惯，每一次记录都会在积累中看到回响。`;
});

// ─── 长图导出（微信可用；未装 html2canvas 时自动降级为打印）───
const exportRef = ref<HTMLElement | null>(null);
const exportPDF = () => {
  if (exportRef.value) {
    exportElementAsImage(exportRef.value, `个人营期报告_${studentName.value}_${new Date().toISOString().split('T')[0]}`);
  }
};
</script>

<template>
  <div class="flex min-h-full flex-col bg-[#F7F8FA] pb-24 font-sans">
    <NavBar title="个人营期报告" :on-back="store.goBack">
      <template #right>
        <button v-if="canView" class="text-[#07C160] hover:bg-green-50 p-2 rounded-full transition-colors" @click="exportPDF">
          <Download class="h-5 w-5" />
        </button>
      </template>
    </NavBar>

    <!-- 营期切换（学员在多个营期时显示） -->
    <div v-if="studentCamps.length > 1" class="bg-white px-4 py-2.5 flex items-center justify-between border-b border-gray-100">
      <div>
        <span class="text-xs text-gray-500">当前营期：</span>
        <span class="text-sm font-medium text-gray-800">{{ selectedCamp?.name || '未选择' }}</span>
      </div>
      <button class="text-xs text-[#07C160] border border-[#07C160] px-2.5 py-1 rounded-full font-bold active:bg-green-50" @click="showCampPicker = true">
        切换
      </button>
    </div>

    <!-- 营期未结束：显示锁定状态 -->
    <div v-if="!canView" class="flex-1 flex flex-col items-center justify-center px-6 text-center">
      <div class="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <Lock class="w-10 h-10 text-gray-400" />
      </div>
      <h3 class="text-lg font-bold text-gray-700 mb-2">个人营期报告尚未生成</h3>
      <p class="text-sm text-gray-500 leading-relaxed">
        你的营期（{{ campInfo?.name || '当前期' }}）预计于
        <span class="font-medium text-gray-700">{{ campInfo?.endDate || '--' }}</span>
        结束，届时将自动生成个人营期报告。
      </p>
    </div>

    <!-- 营期已结束：显示完整报告 -->
    <div v-else ref="exportRef" class="p-4 space-y-4">
      <!-- 顶部鼓励卡片 -->
      <div class="bg-gradient-to-br from-[#07C160] to-[#06A952] rounded-2xl p-5 text-white shadow-lg">
        <div class="flex items-center gap-2 mb-3">
          <Trophy class="w-6 h-6" />
          <h2 class="text-lg font-bold">个人营期报告</h2>
        </div>
        <p class="text-sm leading-relaxed opacity-95">{{ encouragement }}</p>
        <div class="flex gap-4 mt-4 text-center">
          <div class="flex-1 bg-white/15 rounded-lg py-2">
            <div class="text-xl font-bold">{{ report.summary.totalCheckinDays }}</div>
            <div class="text-[10px] opacity-80">打卡天数</div>
          </div>
          <div class="flex-1 bg-white/15 rounded-lg py-2">
            <div class="text-xl font-bold">{{ fmtPct(report.summary.completionRate) }}</div>
            <div class="text-[10px] opacity-80">完成率</div>
          </div>
          <div class="flex-1 bg-white/15 rounded-lg py-2">
            <div class="text-xl font-bold">{{ unlockedAchievements.length }}</div>
            <div class="text-[10px] opacity-80">成就解锁</div>
          </div>
        </div>
      </div>

      <!-- 体重变化 -->
      <Card>
        <h3 class="font-bold text-gray-900 mb-4 flex items-center gap-2 border-b pb-2">
          <component :is="weightTrendIcon" class="h-4 w-4 text-[#07C160]" />
          体重变化趋势
        </h3>
        <template v-if="report.weightTrend.records.length > 0">
          <div class="flex items-center justify-between mb-4">
            <div class="text-center">
              <div class="text-xs text-gray-500 mb-1">开营前</div>
              <div class="text-xl font-bold text-gray-900">{{ fmt(report.weightTrend.startWeight) }} <span class="text-xs text-gray-400">kg</span></div>
            </div>
            <div class="flex-1 mx-4 text-center">
              <div class="text-2xl font-bold" :class="report.weightTrend.totalChange !== null && report.weightTrend.totalChange < 0 ? 'text-[#07C160]' : 'text-orange-500'">
                {{ fmtChange(report.weightTrend.totalChange, 'kg') }}
              </div>
              <div class="text-xs text-gray-400 mt-1">{{ report.weightTrend.changePercent !== null ? `${Math.abs(report.weightTrend.changePercent).toFixed(1)}%` : '--' }}</div>
            </div>
            <div class="text-center">
              <div class="text-xs text-gray-500 mb-1">结营后</div>
              <div class="text-xl font-bold text-gray-900">{{ fmt(report.weightTrend.endWeight) }} <span class="text-xs text-gray-400">kg</span></div>
            </div>
          </div>
          <!-- SVG 折线图 -->
          <div v-if="svgPoints" class="w-full">
            <svg viewBox="0 0 280 100" class="w-full" preserveAspectRatio="none" style="height: 100px;">
              <defs>
                <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#07C160" stop-opacity="0.2" />
                  <stop offset="100%" stop-color="#07C160" stop-opacity="0" />
                </linearGradient>
              </defs>
              <polygon
                :points="`20,80 ${svgPoints} 260,80`"
                fill="url(#weightGrad)"
              />
              <polyline
                :points="svgPoints"
                fill="none"
                stroke="#07C160"
                stroke-width="2"
                stroke-linejoin="round"
                stroke-linecap="round"
              />
              <circle
                v-for="(r, i) in report.weightTrend.records"
                :key="i"
                :cx="20 + (i / (report.weightTrend.records.length - 1)) * 240"
                :cy="100 - 20 - ((r.weight - Math.min(...report.weightTrend.records.map(x => x.weight))) / (Math.max(...report.weightTrend.records.map(x => x.weight)) - Math.min(...report.weightTrend.records.map(x => x.weight)) || 1)) * 60"
                r="3"
                fill="#07C160"
              />
            </svg>
          </div>
        </template>
        <div v-else class="text-center text-sm text-gray-400 py-6">暂无体重记录</div>
      </Card>

      <!-- 体成分变化 -->
      <Card>
        <h3 class="font-bold text-gray-900 mb-4 flex items-center gap-2 border-b pb-2">
          <Activity class="h-4 w-4 text-[#1677FF]" />
          体成分检测变化
        </h3>
        <div class="space-y-3">
          <div
            v-for="m in bodyCompositionMetrics.filter(m => m.beforeValue !== null || m.afterValue !== null)"
            :key="m.configId"
            class="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
          >
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium text-gray-900">{{ m.name }}</div>
              <div class="text-[10px] text-gray-400">{{ m.beforeValue ?? '--' }} → {{ m.afterValue ?? '--' }} {{ m.unit }}</div>
            </div>
            <div class="text-right shrink-0 ml-2">
              <div class="text-sm font-bold" :class="metricChangeColor(m)">
                {{ metricChangeText(m) }}
              </div>
              <div v-if="m.turnedNormal" class="text-[10px] text-[#07C160]">已恢复正常</div>
              <div v-else-if="m.beforeAbnormal && m.afterAbnormal" class="text-[10px] text-orange-400">仍偏高</div>
            </div>
          </div>
        </div>
      </Card>

      <!-- 核心数据摘要 -->
      <div class="grid grid-cols-2 gap-3">
        <Card class="p-4 text-center">
          <Flame class="w-5 h-5 text-orange-400 mx-auto mb-1" />
          <div class="text-lg font-bold text-gray-900">{{ fmt(report.summary.bodyFatLossKg) }} <span class="text-xs text-gray-400">kg</span></div>
          <div class="text-xs text-gray-500 mt-1">脂肪减少</div>
        </Card>
        <Card class="p-4 text-center">
          <Heart class="w-5 h-5 text-[#1677FF] mx-auto mb-1" />
          <div class="text-lg font-bold" :class="report.summary.muscleChangeKg !== null && report.summary.muscleChangeKg > 0 ? 'text-[#07C160]' : 'text-gray-900'">
            {{ fmtChange(report.summary.muscleChangeKg, 'kg') }}
          </div>
          <div class="text-xs text-gray-500 mt-1">肌肉变化</div>
        </Card>
        <Card class="p-4 text-center">
          <Target class="w-5 h-5 text-[#FF976A] mx-auto mb-1" />
          <div class="text-lg font-bold text-gray-900">{{ fmt(report.summary.visceralFatChange) }} <span class="text-xs text-gray-400">cm²</span></div>
          <div class="text-xs text-gray-500 mt-1">内脏脂肪改善</div>
        </Card>
        <Card class="p-4 text-center">
          <Trophy class="w-5 h-5 text-[#FF976A] mx-auto mb-1" />
          <div class="text-lg font-bold text-[#07C160]">{{ report.summary.abnormalImprovedCount }}</div>
          <div class="text-xs text-gray-500 mt-1">异常指标改善</div>
        </Card>
      </div>

      <!-- 打卡统计 -->
      <Card>
        <h3 class="font-bold text-gray-900 mb-4 flex items-center gap-2 border-b pb-2">
          <Activity class="h-4 w-4 text-[#07C160]" />
          打卡统计
        </h3>
        <div class="grid grid-cols-3 gap-3 text-center mb-4">
          <div class="bg-gray-50 rounded-lg py-3">
            <div class="text-xl font-bold text-gray-900">{{ report.checkinStats.totalCheckinDays }}</div>
            <div class="text-[10px] text-gray-500 mt-1">总打卡天数</div>
          </div>
          <div class="bg-[#07C160]/5 rounded-lg py-3">
            <div class="text-xl font-bold text-[#07C160]">{{ report.checkinStats.completeDays }}</div>
            <div class="text-[10px] text-gray-500 mt-1">完成全部打卡</div>
          </div>
          <div class="bg-orange-50 rounded-lg py-3">
            <div class="text-xl font-bold text-[#FF976A]">{{ report.checkinStats.longestStreak }}</div>
            <div class="text-[10px] text-gray-500 mt-1">最长连续天数</div>
          </div>
        </div>
        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-gray-500">饮食打卡天数</span>
            <span class="text-gray-900 font-medium">{{ report.checkinStats.dietCheckinDays }} 天 / {{ report.checkinStats.totalDietRecords }} 条</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">运动打卡天数</span>
            <span class="text-gray-900 font-medium">{{ report.checkinStats.exerciseCheckinDays }} 天 / {{ report.checkinStats.totalExerciseRecords }} 条</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">体重打卡天数</span>
            <span class="text-gray-900 font-medium">{{ report.checkinStats.weightCheckinDays }} 天</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">总运动时长</span>
            <span class="text-gray-900 font-medium">{{ report.checkinStats.totalExerciseDuration }} 分钟</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">饮食总得分</span>
            <span class="text-gray-900 font-medium">{{ report.checkinStats.totalDietScore }} 分</span>
          </div>
        </div>
      </Card>

      <!-- 化验指标改善 -->
      <Card v-if="labMetrics.some(m => m.beforeValue !== null || m.afterValue !== null)">
        <h3 class="font-bold text-gray-900 mb-4 flex items-center gap-2 border-b pb-2">
          <Heart class="h-4 w-4 text-[#1677FF]" />
          化验指标变化
        </h3>
        <div class="space-y-2">
          <template v-for="m in labMetrics" :key="m.configId">
            <div
              v-if="m.beforeValue !== null || m.afterValue !== null"
              class="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
            >
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium text-gray-900">{{ m.name }}</div>
                <div class="text-[10px] text-gray-400">
                  {{ m.beforeValue ?? '--' }} → {{ m.afterValue ?? '--' }} {{ m.unit }}
                  <span v-if="m.normalRange" class="ml-1">参考: {{ m.normalRange }}</span>
                </div>
              </div>
              <div class="text-right shrink-0 ml-2">
                <div class="text-sm font-bold" :class="metricChangeColor(m)">
                  {{ metricChangeText(m) }}
                </div>
                <div v-if="m.turnedNormal" class="text-[10px] text-[#07C160]">已恢复正常</div>
              </div>
            </div>
          </template>
        </div>
      </Card>

      <!-- 目标达成度 -->
      <Card v-if="targetInfo">
        <h3 class="font-bold text-gray-900 mb-3 flex items-center gap-2 border-b pb-2">
          <Target class="h-4 w-4 text-[#FF976A]" />
          目标达成度
        </h3>
        <div class="flex items-center justify-between mb-2 text-sm">
          <span class="text-gray-500">目标 <span class="font-bold text-gray-900">{{ targetInfo.target }}kg</span></span>
          <span class="text-gray-500">结营 <span class="font-bold text-gray-900">{{ fmt(targetInfo.end) }}kg</span></span>
        </div>
        <div class="w-full bg-gray-100 rounded-full h-3 overflow-hidden mb-2">
          <div
            class="h-full rounded-full bg-gradient-to-r from-[#07C160] to-[#4ade80] transition-all"
            :style="{ width: `${Math.min(targetInfo.progress * 100, 100)}%` }"
          ></div>
        </div>
        <p class="text-xs" :class="targetInfo.achieved ? 'text-[#07C160] font-bold' : 'text-gray-500'">
          <template v-if="targetInfo.achieved">🎉 恭喜达成目标体重！</template>
          <template v-else>达成 {{ Math.round(targetInfo.progress * 100) }}%，距目标还差 {{ targetInfo.remaining?.toFixed(1) }}kg，继续加油！</template>
        </p>
      </Card>

      <!-- 营养师寄语与保持建议 -->
      <Card class="bg-gradient-to-br from-[#1677FF]/5 to-[#1677FF]/[0.02] border-[#1677FF]/15">
        <h3 class="font-bold text-gray-900 mb-3 flex items-center gap-2 border-b border-[#1677FF]/10 pb-2">
          <MessageCircle class="h-4 w-4 text-[#1677FF]" />
          营养师寄语与保持建议
        </h3>
        <div v-if="campMessage" class="mb-4">
          <p class="text-sm text-gray-700 leading-relaxed">{{ campMessage }}</p>
          <p class="text-xs text-gray-400 mt-2 text-right">-- {{ dietitianName }}</p>
        </div>
        <div class="space-y-3 text-sm text-gray-700 leading-relaxed">
          <div class="flex gap-2.5">
            <span class="shrink-0">🥗</span>
            <p><span class="font-bold text-gray-900">饮食：</span>保持三餐规律，每餐蔬菜占一半、主食一拳头，聚餐后下一餐清淡即可，不必补偿性节食。</p>
          </div>
          <div class="flex gap-2.5">
            <span class="shrink-0">🏃</span>
            <p><span class="font-bold text-gray-900">运动：</span>每周保持 3 次以上、每次 40 分钟的运动习惯，快走、游泳、骑车都可以，选你能坚持的。</p>
          </div>
          <div class="flex gap-2.5">
            <span class="shrink-0">⚖️</span>
            <p><span class="font-bold text-gray-900">监测：</span>每周固定一天早晨空腹称重，体重回升超过 2kg 时及时调整饮食和运动。</p>
          </div>
          <div class="flex gap-2.5">
            <span class="shrink-0">😴</span>
            <p><span class="font-bold text-gray-900">作息：</span>保证 7 小时以上睡眠，熬夜会促进食欲激素分泌，是反弹的隐形推手。</p>
          </div>
        </div>
      </Card>

      <!-- 底部鼓励语 -->
      <div class="text-center py-4">
        <p class="text-sm text-gray-400">
          {{ report.studentName }} · {{ report.campDays }}天健康训练营
        </p>
        <p class="text-xs text-gray-300 mt-1">坚持就是胜利，健康是最好的奖励</p>
      </div>
    </div>

    <!-- 营期选择弹窗 -->
    <VanPopup v-model:show="showCampPicker" position="bottom" round>
      <div class="p-4">
        <h3 class="font-bold text-gray-900 text-base mb-3 text-center">选择营期</h3>
        <div class="space-y-2">
          <button
            v-for="camp in studentCamps"
            :key="camp.id"
            @click="selectedCampId = camp.id; showCampPicker = false"
            :class="[
              'w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all',
              selectedCampId === camp.id
                ? 'border-[#07C160] bg-green-50 text-[#07C160]'
                : 'border-gray-200 bg-white text-gray-700 active:bg-gray-50',
            ]"
          >
            <div class="flex-1 text-left min-w-0"><span class="font-medium">{{ camp.name }}</span><div class="text-[10px] text-gray-400 mt-0.5">{{ campDateRange(camp) }}</div></div>
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

    <StudentTabbar anchor="health-profile" print-hidden :badge="unreadCount > 0 ? unreadCount : undefined" />
  </div>
</template>

<style>
@media print {
  /* 隐藏不需要打印的元素 */
  .print\:hidden { display: none !important; }
  .custom-nav { display: none !important; }
  .custom-tabbar { display: none !important; }
  .van-overlay { display: none !important; }
  /* 白色背景 */
  body { background: white !important; }
  /* 移除阴影和圆角，节省墨水 */
  .shadow-lg, .shadow-sm, .shadow-md { box-shadow: none !important; }
  /* 避免在卡片内分页 */
  .grid { break-inside: avoid; }
  /* 确保内容占满宽度 */
  .max-w-md { max-width: 100% !important; }
  .mx-auto { margin: 0 !important; }
  .fixed { position: static !important; }
  .overflow-y-auto { overflow: visible !important; }
  .pb-24 { padding-bottom: 1rem !important; }
  .pt-12 { padding-top: 0 !important; }
}
</style>
