<script setup lang="ts">
import { computed, ref } from 'vue';
import { useAppStore } from '../store/app';
import { campDateRange, latestOrFirstId, campDaysOf } from '../lib/camps';
import { NavBar, Card } from './ui';
import { Building2, Users, Activity, Trophy, Flame, Sparkles, Download, ShieldCheck, ChevronRight, HeartPulse, Dumbbell } from 'lucide-vue-next';
import { Tabbar as VanTabbar, TabbarItem as VanTabbarItem, Popup as VanPopup } from 'vant';
import { MOCK_STUDENT_METRIC_VALUES } from '../mock/data';
import { generateDietitianSummary, generateEnterpriseReport } from '../lib/campReport';
import { exportElementAsImage } from '../lib/exportImage';

const store = useAppStore();

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

const summary = computed(() =>
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

// 企业汇报版（匿名聚合）
const report = computed(() => generateEnterpriseReport(summary.value));

const fmt = (v: number | null, digits = 1): string => (v === null ? '--' : v.toFixed(digits));
const fmtPct = (v: number | null): string => (v === null ? '--' : `${Math.round(v * 100)}%`);

// 导出长图
const exportRef = ref<HTMLElement | null>(null);
const handleExport = () => {
  if (exportRef.value) {
    exportElementAsImage(exportRef.value, `企业汇报_健康训练营_${new Date().toISOString().split('T')[0]}`);
  }
};
</script>

<template>
  <div class="flex min-h-full flex-col bg-[#F7F8FA] pb-24 font-sans">
    <NavBar title="企业汇报版" :on-back="store.goBack">
      <template #right>
        <button class="text-[#07C160] hover:bg-green-50 p-2 rounded-full transition-colors" @click="handleExport">
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
      <button class="text-xs text-[#07C160] border border-[#07C160] px-3 py-1.5 rounded-full font-bold active:bg-green-50" @click="showCampPicker = true">
        切换营期
      </button>
    </div>

    <div ref="exportRef" class="p-4 space-y-4">
      <!-- 隐私提示（导出时隐藏） -->
      <div class="flex items-start gap-2 bg-[#07C160]/5 border border-[#07C160]/15 rounded-xl px-3 py-2.5" data-html2canvas-ignore>
        <ShieldCheck class="w-4 h-4 text-[#07C160] shrink-0 mt-0.5" />
        <p class="text-[11px] text-gray-500 leading-relaxed">
          本页仅含匿名聚合数据，无任何学员个人健康信息，可放心导出发送给企业 HR。
        </p>
      </div>

      <!-- 顶部品牌卡片 -->
      <div class="bg-gradient-to-br from-[#07C160] to-[#06A952] rounded-2xl p-5 text-white shadow-lg">
        <div class="flex items-center gap-2 mb-1">
          <Building2 class="w-5 h-5" />
          <h2 class="text-lg font-bold">健康训练营 · 结营汇报</h2>
        </div>
        <p class="text-xs opacity-85 mb-4">{{ report.campDays }} 天 · {{ report.totalStudents }} 名员工参营</p>
        <div class="grid grid-cols-3 gap-3 text-center">
          <div class="bg-white/15 rounded-lg py-3">
            <div class="text-2xl font-bold">{{ fmt(report.avgWeightLoss) }}<span class="text-xs font-normal">kg</span></div>
            <div class="text-[10px] opacity-80 mt-0.5">人均减重</div>
          </div>
          <div class="bg-white/15 rounded-lg py-3">
            <div class="text-2xl font-bold">{{ fmtPct(report.avgCompletionRate) }}</div>
            <div class="text-[10px] opacity-80 mt-0.5">平均打卡完成率</div>
          </div>
          <div class="bg-white/15 rounded-lg py-3">
            <div class="text-2xl font-bold">{{ report.abnormalImprovedTotal }}</div>
            <div class="text-[10px] opacity-80 mt-0.5">异常指标恢复(项次)</div>
          </div>
        </div>
      </div>

      <!-- 本期亮点 -->
      <Card v-if="report.highlights.length > 0">
        <h3 class="font-bold text-gray-900 mb-3 flex items-center gap-2 border-b pb-2">
          <Sparkles class="h-4 w-4 text-[#FF976A]" />
          本期亮点
        </h3>
        <div class="space-y-2.5">
          <div v-for="(h, i) in report.highlights" :key="i" class="flex items-start gap-2.5">
            <span class="w-5 h-5 rounded-full bg-[#07C160]/10 text-[#07C160] text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{{ i + 1 }}</span>
            <p class="text-sm text-gray-700 leading-relaxed">{{ h }}</p>
          </div>
        </div>
      </Card>

      <!-- 参与度 -->
      <Card>
        <h3 class="font-bold text-gray-900 mb-3 flex items-center gap-2 border-b pb-2">
          <Users class="h-4 w-4 text-[#1677FF]" />
          参与情况
        </h3>
        <div class="grid grid-cols-2 gap-3 text-center">
          <div class="bg-gray-50 rounded-xl py-3">
            <div class="text-xl font-bold text-gray-900">{{ report.highCompletionCount }}<span class="text-xs text-gray-400 font-normal">/{{ report.totalStudents }}人</span></div>
            <div class="text-[10px] text-gray-500 mt-1">完成率≥80%的学员</div>
          </div>
          <div class="bg-gray-50 rounded-xl py-3">
            <div class="text-xl font-bold text-gray-900">{{ report.streakChampionCount }}<span class="text-xs text-gray-400 font-normal">/{{ report.totalStudents }}人</span></div>
            <div class="text-[10px] text-gray-500 mt-1">坚持≥70%营期天数</div>
          </div>
          <div class="bg-gray-50 rounded-xl py-3">
            <div class="text-xl font-bold text-gray-900">{{ fmt(report.avgCheckinDays, 0) }}<span class="text-xs text-gray-400 font-normal">天</span></div>
            <div class="text-[10px] text-gray-500 mt-1">人均打卡天数</div>
          </div>
          <div class="bg-gray-50 rounded-xl py-3">
            <div class="text-xl font-bold text-gray-900">{{ fmt(report.avgLongestStreak, 0) }}<span class="text-xs text-gray-400 font-normal">天</span></div>
            <div class="text-[10px] text-gray-500 mt-1">人均最长连续打卡</div>
          </div>
        </div>
        <!-- 打卡类型细分 -->
        <div class="mt-3 pt-3 border-t border-gray-100 space-y-2">
          <div class="flex items-center gap-2">
            <span class="text-xs text-gray-500 w-16 shrink-0">饮食打卡</span>
            <div class="flex-1 bg-gray-100 rounded-full h-2.5 relative overflow-hidden">
              <div class="absolute left-0 top-0 h-full rounded-full bg-[#07C160]" :style="{ width: `${Math.min((report.avgDietCheckinDays ?? 0) / Math.max(report.campDays, 1) * 100, 100)}%` }"></div>
            </div>
            <span class="text-xs text-gray-600 w-14 text-right shrink-0">{{ fmt(report.avgDietCheckinDays, 0) }}天</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-gray-500 w-16 shrink-0">运动打卡</span>
            <div class="flex-1 bg-gray-100 rounded-full h-2.5 relative overflow-hidden">
              <div class="absolute left-0 top-0 h-full rounded-full bg-[#FF976A]" :style="{ width: `${Math.min((report.avgExerciseCheckinDays ?? 0) / Math.max(report.campDays, 1) * 100, 100)}%` }"></div>
            </div>
            <span class="text-xs text-gray-600 w-14 text-right shrink-0">{{ fmt(report.avgExerciseCheckinDays, 0) }}天</span>
          </div>
        </div>
      </Card>

      <!-- 健康改善成果 -->
      <Card>
        <h3 class="font-bold text-gray-900 mb-3 flex items-center gap-2 border-b pb-2">
          <HeartPulse class="h-4 w-4 text-[#07C160]" />
          健康改善成果
        </h3>
        <div class="flex items-center justify-between py-2 border-b border-gray-50">
          <span class="text-sm text-gray-500">减重≥3kg 人数</span>
          <span class="text-sm font-bold text-gray-900">
            {{ report.weightGoalCount }} 人
            <span v-if="report.weightGoalRate !== null" class="text-xs text-[#07C160]">（{{ fmtPct(report.weightGoalRate) }}）</span>
          </span>
        </div>
        <div class="flex items-center justify-between py-2 border-b border-gray-50">
          <span class="text-sm text-gray-500">体重下降的学员</span>
          <span class="text-sm font-bold text-gray-900">{{ report.weightLossCount }}/{{ report.weightRecordCount }} 人</span>
        </div>
        <div class="flex items-center justify-between py-2 border-b border-gray-50">
          <span class="text-sm text-gray-500">体脂肪下降的学员</span>
          <span class="text-sm font-bold text-gray-900">
            {{ report.bodyFatLossCount }}/{{ report.bodyFatRecordCount }} 人
            <span v-if="report.bodyFatRecordCount > 0" class="text-xs text-[#07C160]">（{{ fmtPct(report.bodyFatLossCount / report.bodyFatRecordCount) }}）</span>
          </span>
        </div>
        <div class="flex items-center justify-between py-2 border-b border-gray-50">
          <span class="text-sm text-gray-500">肌肉量增加的学员</span>
          <span class="text-sm font-bold text-gray-900">
            {{ report.muscleGainCount }}/{{ report.muscleRecordCount }} 人
            <span v-if="report.muscleRecordCount > 0" class="text-xs text-[#1677FF]">（{{ fmtPct(report.muscleGainCount / report.muscleRecordCount) }}）</span>
          </span>
        </div>
        <div class="flex items-center justify-between py-2">
          <span class="text-sm text-gray-500">异常指标恢复正常</span>
          <span class="text-sm font-bold text-[#07C160]">{{ report.abnormalImprovedTotal }} 项次</span>
        </div>
      </Card>

      <!-- 运动参与 -->
      <Card>
        <h3 class="font-bold text-gray-900 mb-3 flex items-center gap-2 border-b pb-2">
          <Dumbbell class="h-4 w-4 text-[#FF976A]" />
          运动参与
        </h3>
        <div class="grid grid-cols-2 gap-3 text-center">
          <div class="bg-gray-50 rounded-xl py-3">
            <div class="text-xl font-bold text-gray-900">{{ (report.totalExerciseMinutes / 60).toFixed(0) }}<span class="text-xs text-gray-400 font-normal">小时</span></div>
            <div class="text-[10px] text-gray-500 mt-1">全员累计运动时长</div>
          </div>
          <div class="bg-gray-50 rounded-xl py-3">
            <div class="text-xl font-bold text-gray-900">{{ report.totalCheckinRecords }}</div>
            <div class="text-[10px] text-gray-500 mt-1">累计打卡总次数</div>
          </div>
        </div>
      </Card>

      <!-- 改善最显著的指标 -->
      <Card v-if="report.topImprovedMetrics.length > 0">
        <h3 class="font-bold text-gray-900 mb-3 flex items-center gap-2 border-b pb-2">
          <Trophy class="h-4 w-4 text-[#FF976A]" />
          改善最显著的指标
        </h3>
        <div class="space-y-3">
          <div v-for="(m, i) in report.topImprovedMetrics" :key="i" class="flex items-center gap-3">
            <span class="text-sm text-gray-700 w-24 shrink-0 truncate">{{ m.name }}</span>
            <div class="flex-1 bg-gray-100 rounded-full h-4 relative overflow-hidden">
              <div
                class="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-[#07C160] to-[#4ade80]"
                :style="{ width: `${(m.improvementRate ?? 0) * 100}%` }"
              ></div>
            </div>
            <span class="text-xs font-bold text-[#07C160] w-12 text-right shrink-0">{{ fmtPct(m.improvementRate) }}</span>
            <span class="text-[10px] text-gray-400 w-20 text-right shrink-0">
              {{ m.improvedCount }}/{{ m.totalCount }}人
            </span>
          </div>
        </div>
        <p class="text-[10px] text-gray-400 mt-3">改善率 = 该指标改善人数 ÷ 参与检测总人数（有前后数据），按改善率降序排列</p>
      </Card>

      <!-- 页脚 -->
      <div class="text-center py-3">
        <div class="flex items-center justify-center gap-1.5 text-xs text-gray-400">
          <Flame class="w-3.5 h-3.5" />
          <span>{{ report.campDays }}天健康训练营 · 专业营养师全程指导</span>
        </div>
        <p class="text-[10px] text-gray-300 mt-1">本报告仅含群体统计数据，不涉及任何个人健康信息</p>
      </div>
    </div>

    <!-- 入口：查看营养师明细版 -->
    <div class="px-4 pb-4" data-html2canvas-ignore>
      <button
        @click="store.setCurrentView('camp-summary')"
        class="w-full py-3 rounded-xl border border-gray-200 bg-white text-sm text-gray-600 flex items-center justify-center gap-1 active:bg-gray-50 transition-colors"
      >
        查看学员明细统计（仅营养师可见）
        <ChevronRight class="w-4 h-4 text-gray-400" />
      </button>
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

    <VanTabbar class="custom-tabbar print:hidden" :model-value="0">
      <VanTabbarItem @click="store.setCurrentView('dietitian-dashboard')">
        <template #icon><Activity class="h-6 w-6" /></template>
        返回工作台
      </VanTabbarItem>
    </VanTabbar>
  </div>
</template>
