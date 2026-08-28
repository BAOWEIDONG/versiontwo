<script setup lang="ts">
import { computed, ref } from 'vue';
import { useAppStore } from '../store/app';
import { useDietitianCounts } from '../lib/dietitianCounts';
import { campDateRange, latestOrFirstId, campDaysOf } from '../lib/camps';
import { useDeferred } from '../composables/useDeferred';
import { NavBar, Card } from './ui';
import { BarChart3, TrendingDown, Users, Activity, ChevronRight, Download, UserCheck, Building2, FileText, Settings, Flame } from 'lucide-vue-next';
import { Tabbar as VanTabbar, TabbarItem as VanTabbarItem, Popup as VanPopup } from 'vant';
import { MOCK_STUDENT_METRIC_VALUES } from '../mock/data';
import { generateDietitianSummary } from '../lib/campReport';
import { exportReport } from '../lib/exportPDF';
import type { DietitianCampSummary } from '../types';

const store = useAppStore();
// 底部 Tabbar 角标：批注=待批注数，配置=发放中心待发货数（各营养师页面共用口径）
const { unannotatedCount, fulfillmentPendingCount } = useDietitianCounts();

// ─── 营期切换（默认最新一期） ───
const selectedCampId = ref<string>(latestOrFirstId(store.camps) || '');
const showCampPicker = ref(false);
const selectedCamp = computed(() => store.camps.find((c) => c.id === selectedCampId.value));
const campDays = computed(() => campDaysOf(selectedCamp.value));

// 按营期过滤学员和记录
const campStudents = computed(() => selectedCampId.value ? store.getStudentsByCamp(selectedCampId.value) : store.getAllStudents());
const campDietRecords = computed(() => selectedCampId.value ? store.getCampDietRecords(selectedCampId.value) : store.dietRecords);
const campExerciseRecords = computed(() => selectedCampId.value ? store.getCampExerciseRecords(selectedCampId.value) : store.exerciseRecords);
const campWeightRecords = computed(() => selectedCampId.value ? store.getCampWeightRecords(selectedCampId.value) : store.weightRecords);

// 生成结营统计（使用营期过滤后的数据）
// 首次进入全校聚合较慢：用 useDeferred 延迟到首帧后空闲计算，先出骨架屏，避免阻塞首绘
const { data: summary, done: summaryReady } = useDeferred<DietitianCampSummary>(() =>
  generateDietitianSummary(
    campStudents.value,
    store.metricConfigs,
    MOCK_STUDENT_METRIC_VALUES,
    campDietRecords.value,
    campExerciseRecords.value,
    campWeightRecords.value,
    campDays.value,
  ),
);

// 减重总人数及占比（基于有体重记录的学员：体重下降人数 / 有体重记录人数）
const weightLossStats = computed(() => {
  if (!summary.value) return { count: 0, total: 0 };
  const withWeight = summary.value.studentReports.filter((r) => r.weightTrend.totalChange !== null);
  const count = withWeight.filter((r) => (r.weightTrend.totalChange ?? 0) < 0).length;
  return { count, total: withWeight.length };
});

// 打开学员详情
const openStudent = (id: string) => {
  store.setSelectedStudentId(id);
  store.setCurrentView('dietitian-student-detail');
};

// 导出（普通浏览器=PDF，微信=长图长按保存）
const exportRef = ref<HTMLElement | null>(null);
const exportPDF = () => {
  if (exportRef.value) {
    exportReport(exportRef.value, `结营统计_${new Date().toISOString().split('T')[0]}`);
  }
};

// 格式化数字
const fmt = (v: number | null, digits = 1): string => {
  if (v === null) return '--';
  return v.toFixed(digits);
};

// 格式化百分比
const fmtPct = (v: number | null): string => {
  if (v === null) return '--';
  return `${(v * 100).toFixed(0)}%`;
};

// 格式化变化量（带正负号）
const fmtChange = (v: number | null, unit = ''): string => {
  if (v === null) return '--';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(1)}${unit ? ' ' + unit : ''}`;
};
</script>

<template>
  <div class="flex min-h-full flex-col bg-[#F7F8FA] pb-24 font-sans">
    <NavBar title="结营统计" :on-back="store.goBack">
      <template #right>
        <button class="text-[#FF976A] hover:bg-orange-50 p-2 rounded-full transition-colors" @click="exportPDF">
          <Download class="h-5 w-5" />
        </button>
      </template>
    </NavBar>

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

    <!-- 首次聚合计算完成前的骨架屏，避免全校统计同步计算阻塞首帧 -->
    <div v-if="!summaryReady" class="p-4 space-y-4 animate-pulse">
      <div class="h-24 bg-gray-100 rounded-xl"></div>
      <div class="grid grid-cols-2 gap-3">
        <div class="h-28 bg-gray-100 rounded-xl"></div>
        <div class="h-28 bg-gray-100 rounded-xl"></div>
        <div class="h-28 bg-gray-100 rounded-xl"></div>
        <div class="h-28 bg-gray-100 rounded-xl"></div>
      </div>
      <div class="h-40 bg-gray-100 rounded-xl"></div>
      <div class="h-40 bg-gray-100 rounded-xl"></div>
    </div>

    <div v-if="summaryReady" ref="exportRef" class="p-4 space-y-4">
      <!-- 企业汇报版入口 -->
      <Card
        class="bg-gradient-to-r from-[#07C160]/10 to-[#07C160]/5 border-[#07C160]/20 cursor-pointer hover:shadow-md transition-shadow"
        @click="store.setCurrentView('enterprise-report')"
      >
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-[#07C160]/15 flex items-center justify-center shrink-0">
            <Building2 class="w-5 h-5 text-[#07C160]" />
          </div>
          <div class="flex-1">
            <div class="font-bold text-gray-900 text-sm">企业汇报版</div>
            <div class="text-xs text-gray-500 mt-0.5">匿名聚合数据 + 本期亮点，可直接导出发给 HR</div>
          </div>
          <ChevronRight class="w-4 h-4 text-[#07C160]" />
        </div>
      </Card>

      <!-- 概览卡片 -->
      <div class="grid grid-cols-2 gap-3">
        <Card class="p-4 text-center">
          <div class="flex items-center justify-center mb-2">
            <Users class="w-5 h-5 text-[#FF976A] mr-1" />
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ summary.totalStudents }}</div>
          <div class="text-xs text-gray-500 mt-1">参营学员</div>
        </Card>
        <Card class="p-4 text-center">
          <div class="flex items-center justify-center mb-2">
            <UserCheck class="w-5 h-5 text-[#07C160] mr-1" />
          </div>
          <div class="text-2xl font-bold text-[#07C160]">{{ summary.validStudentCount }}</div>
          <div class="text-xs text-gray-500 mt-1">有效人数<span class="text-[10px] text-gray-400">（有前后体成分数据）</span></div>
        </Card>
        <Card class="p-4 text-center">
          <div class="flex items-center justify-center mb-2">
            <TrendingDown class="w-5 h-5 text-[#07C160] mr-1" />
          </div>
          <div class="text-2xl font-bold text-[#07C160]">{{ fmtChange(summary.avgWeightChange, 'kg') }}</div>
          <div class="text-xs text-gray-500 mt-1">平均体重变化<span class="text-[10px] text-gray-400">（按有体重记录）</span></div>
        </Card>
        <Card class="p-4 text-center">
          <div class="flex items-center justify-center mb-2">
            <Activity class="w-5 h-5 text-[#1677FF] mr-1" />
          </div>
          <div class="text-2xl font-bold text-[#1677FF]">{{ fmtPct(summary.avgCompletionRate) }}</div>
          <div class="text-xs text-gray-500 mt-1">平均完成率<span class="text-[10px] text-gray-400">（按全部学员）</span></div>
        </Card>
        <Card class="p-4 text-center">
          <div class="flex items-center justify-center mb-2">
            <BarChart3 class="w-5 h-5 text-[#1677FF] mr-1" />
          </div>
          <div class="text-2xl font-bold text-[#1677FF]">{{ fmt(summary.avgCheckinDays, 0) }}</div>
          <div class="text-xs text-gray-500 mt-1">平均打卡天数<span class="text-[10px] text-gray-400">（按全部学员）</span></div>
        </Card>
        <Card class="p-4 text-center">
          <div class="flex items-center justify-center mb-2">
            <Flame class="w-5 h-5 text-[#FF976A] mr-1" />
          </div>
          <div class="text-2xl font-bold text-[#FF976A]">{{ weightLossStats.count }}<span class="text-sm font-normal text-gray-400">/{{ weightLossStats.total }}</span></div>
          <div class="text-xs text-gray-500 mt-1">减重总人数<span class="text-[10px] text-gray-400">（{{ fmtPct(weightLossStats.total ? weightLossStats.count / weightLossStats.total : 0) }}占比）</span></div>
        </Card>
      </div>

      <!-- 学员列表 -->
      <Card>
        <h3 class="font-bold text-gray-900 mb-4 flex items-center gap-2 border-b pb-2">
          <BarChart3 class="h-4 w-4 text-[#FF976A]" />
          学员结营概况
        </h3>
        <div class="space-y-3">
          <div
            v-for="report in summary.studentReports"
            :key="report.studentId"
            class="flex items-center justify-between p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors"
            @click="openStudent(report.studentId)"
          >
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="font-bold text-gray-900 text-sm">{{ report.studentName }}</span>
                <span class="text-[10px] text-gray-500">{{ report.gender === 'male' ? '男' : '女' }}</span>
                <span
                  v-if="report.metricChanges.filter(m => m.category === '身体测量数据' && typeof m.beforeValue === 'number' && typeof m.afterValue === 'number').length > 0"
                  class="text-[9px] bg-[#07C160]/10 text-[#07C160] px-1.5 py-0.5 rounded font-medium"
                >有效</span>
              </div>
              <div class="flex flex-wrap gap-2 text-[10px] text-gray-500">
                <span class="flex items-center gap-0.5">
                  <TrendingDown class="w-3 h-3" :class="report.summary.weightLossKg !== null && report.summary.weightLossKg > 0 ? 'text-[#07C160]' : 'text-gray-400'" />
                  {{ report.summary.weightLossKg !== null ? `${fmt(report.summary.weightLossKg)}kg` : '--' }}
                </span>
                <span>完成率 {{ fmtPct(report.checkinStats.completionRate) }}</span>
                <span>连续{{ report.summary.longestStreak }}天</span>
              </div>
            </div>
            <div class="flex items-center shrink-0 ml-2">
              <ChevronRight class="w-4 h-4 text-gray-300" />
            </div>
          </div>
        </div>
      </Card>

      <!-- 打卡频率统计 -->
      <Card>
        <h3 class="font-bold text-gray-900 mb-3 flex items-center gap-2 border-b pb-2">
          <BarChart3 class="h-4 w-4 text-[#FF976A]" />
          打卡频率统计
        </h3>
        <div class="space-y-2.5">
          <div
            v-for="report in summary.studentReports"
            :key="report.studentId"
            class="flex items-center gap-2.5"
          >
            <span class="text-xs text-gray-700 w-12 shrink-0 truncate">{{ report.studentName }}</span>
            <div class="flex-1 bg-gray-100 rounded-full h-5 relative overflow-hidden">
              <div
                class="absolute left-0 top-0 h-full rounded-full transition-all"
                :class="report.checkinStats.completionRate >= 0.8 ? 'bg-[#07C160]' : report.checkinStats.completionRate >= 0.5 ? 'bg-[#FF976A]' : 'bg-gray-300'"
                :style="{ width: `${Math.min(report.checkinStats.completionRate * 100, 100)}%` }"
              ></div>
            </div>
            <span class="text-[10px] font-medium text-gray-600 w-20 text-right shrink-0">
              {{ report.checkinStats.completeDays }}/{{ report.checkinStats.campDays }}天 {{ fmtPct(report.checkinStats.completionRate) }}
            </span>
          </div>
        </div>
      </Card>
    </div>

    <!-- 营期选择弹窗 -->
    <VanPopup v-model:show="showCampPicker" position="bottom" round>
      <div class="p-4">
        <h3 class="font-bold text-gray-900 text-base mb-3 text-center">选择营期</h3>
        <div class="space-y-2">
          <button
            v-for="camp in store.camps"
            :key="camp.id"
            @click="selectedCampId = camp.id; showCampPicker = false"
            :class="[
              'w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all',
              selectedCampId === camp.id
                ? 'border-[#FF976A] bg-orange-50 text-[#FF976A]'
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

    <VanTabbar class="custom-tabbar tabbar-orange print:hidden" :model-value="2">
      <VanTabbarItem @click="store.setCurrentView('dietitian-dashboard')">
        <template #icon><Users class="h-6 w-6" /></template>
        首页
      </VanTabbarItem>
      <VanTabbarItem @click="store.setCurrentView('dietitian-unannotated-list')" :badge="unannotatedCount > 0 ? unannotatedCount : undefined">
        <template #icon><FileText class="h-6 w-6" /></template>
        批注
      </VanTabbarItem>
      <VanTabbarItem :badge="fulfillmentPendingCount > 0 ? fulfillmentPendingCount : undefined">
        <template #icon><Settings class="h-6 w-6" /></template>
        配置
      </VanTabbarItem>
    </VanTabbar>
  </div>
</template>

<style>
@media print {
  .print\:hidden { display: none !important; }
  .custom-nav { display: none !important; }
  .custom-tabbar { display: none !important; }
  .van-overlay { display: none !important; }
  body { background: white !important; }
  .shadow-lg, .shadow-sm, .shadow-md { box-shadow: none !important; }
  .grid { break-inside: avoid; }
  .max-w-md { max-width: 100% !important; }
  .mx-auto { margin: 0 !important; }
  .fixed { position: static !important; }
  .overflow-y-auto { overflow: visible !important; }
  .overflow-x-auto { overflow: visible !important; }
  .pb-24 { padding-bottom: 1rem !important; }
  .pt-12 { padding-top: 0 !important; }
}
</style>
