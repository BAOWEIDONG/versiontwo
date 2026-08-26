<script setup lang="ts">
import { computed, ref } from 'vue';
import { usePaged } from '../composables/usePaged';
import { useAppStore } from '../store/app';
import { useCoachCounts } from '../lib/coachCounts';
import { campDateRange, latestOrFirstId, fmtShortDate } from '../lib/camps';
import { NavBar } from './ui';
import { FileText, ChevronRight, Users, Dumbbell, Dumbbell as DumbbellIcon, Search } from 'lucide-vue-next';
import { Tabbar as VanTabbar, TabbarItem as VanTabbarItem, Popup as VanPopup } from 'vant';

const store = useAppStore();
const { unannotatedCount } = useCoachCounts();

// ─── 营期切换（统一所选营期） ───
const selectedCampId = ref<string>(store.selectedCampId || latestOrFirstId(store.camps) || '');
const showCampPicker = ref(false);
const selectedCamp = computed(() => store.camps.find((c) => c.id === selectedCampId.value));

// 当前营期的运动记录（学员侧过滤在卡片内做）
const campExerciseRecords = computed(() => store.getCampExerciseRecords(selectedCampId.value));
// 学员姓名映射
const studentNameMap = computed(() => {
  const m = new Map<string, string>();
  store.getStudentsByCamp(selectedCampId.value).forEach((s) => m.set(s.id, s.name));
  return m;
});
// 学员搜索
const searchKeyword = ref('');

// 未批注的运动记录（coachComment 空 且 coachScore 未评）
const unannotatedItems = computed(() =>
  campExerciseRecords.value
    .filter((r) => !r.coachComment && r.coachScore == null)
    .filter((r) => {
      const kw = searchKeyword.value.trim();
      if (!kw) return true;
      return (studentNameMap.value.get(r.studentId) || '').includes(kw);
    })
    .sort((a, b) => b.date.localeCompare(a.date)),
);

// 按学员分组
const studentGroups = computed(() => {
  const groups = new Map<string, typeof unannotatedItems.value>();
  unannotatedItems.value.forEach((r) => {
    const list = groups.get(r.studentId) || [];
    list.push(r);
    groups.set(r.studentId, list);
  });
  return Array.from(groups.entries()).map(([studentId, records]) => ({
    studentId,
    studentName: studentNameMap.value.get(studentId) || `学员${studentId}`,
    records,
  }));
});

const openStudent = (studentId: string) => {
  store.setSelectedStudentId(studentId);
  store.setCurrentView('coach-student-detail');
};
// 长列表分页：默认渲染前 10 个学员分组，更多点「加载更多」
const { items: pagedGroups, hasMore, remaining, loadMore } = usePaged(studentGroups, 10);

const intentLabel = (intensity: number) =>
  (['', '很轻松', '轻松', '适中', '较累', '非常吃力'][intensity] || '适中');
</script>

<template>
  <div class="flex min-h-full flex-col bg-[#F4F6F8] pb-24 font-sans">
    <div class="pt-[calc(env(safe-area-inset-top)+0.5rem)] px-6 pb-6 bg-gradient-to-br from-[#07C160] via-[#04a551] to-[#06a551] rounded-b-[28px]">
      <h1 class="text-lg font-bold text-white">教练批注</h1>
      <p class="text-xs text-white/80 mt-1">待批注运动记录 {{ unannotatedCount }} 条，点击可进入学员详情批注重</p>
    </div>

    <!-- 营期切换（与营养师端一致的白条样式，按钮用教练绿） -->
    <div class="bg-white px-4 py-3 flex items-center justify-between border-b border-gray-100">
      <div>
        <div class="text-xs text-gray-500">当前营期</div>
        <div class="text-sm font-medium text-gray-800">{{ selectedCamp?.name || '未选择' }}</div>
      </div>
      <button class="text-xs text-[#07C160] border border-[#07C160] px-3 py-1.5 rounded-full font-bold active:bg-green-50" @click="showCampPicker = true">
        切换营期
      </button>
    </div>

    <div class="px-4 mt-3">
      <div class="relative">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input v-model="searchKeyword" type="text" placeholder="搜索学员姓名"
          class="w-full pl-9 pr-3 py-2.5 bg-white rounded-xl border border-gray-100 text-sm focus:outline-none focus:border-[#07C160]/40 shadow-sm placeholder:text-gray-300" />
      </div>
    </div>

    <div class="p-4 space-y-3">
      <template v-if="studentGroups.length > 0">
        <div v-for="group in pagedGroups" :key="group.studentId" class="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <button @click="openStudent(group.studentId)"
            class="w-full flex items-center justify-between px-4 py-3 bg-[#07C160]/5 active:bg-[#07C160]/10 transition-colors">
            <div class="flex items-center gap-2">
              <div class="w-8 h-8 rounded-full bg-[#07C160]/10 flex items-center justify-center text-[#07C160] text-sm font-bold shrink-0">
                {{ group.studentName.slice(0, 1) }}
              </div>
              <span class="text-sm font-bold text-gray-900">{{ group.studentName }}</span>
              <span class="text-[10px] text-[#07C160] bg-[#07C160]/10 px-1.5 py-0.5 rounded-full font-bold">{{ group.records.length }}条待批注</span>
            </div>
            <ChevronRight class="w-4 h-4 text-gray-300" />
          </button>
          <div class="divide-y divide-gray-50">
            <button v-for="r in group.records" :key="r.id" @click="openStudent(group.studentId)"
              class="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-gray-50 transition-colors">
              <DumbbellIcon class="w-4 h-4 text-[#07C160] shrink-0" />
              <div class="flex-1 min-w-0">
                <div class="text-sm text-gray-900 truncate">{{ r.type }}</div>
                <div class="text-[10px] text-gray-400 mt-0.5">{{ fmtShortDate(r.date.split(' ')[0]) }} · {{ r.duration }}分钟 · {{ intentLabel(r.intensity) }}</div>
              </div>
              <span class="shrink-0 text-[10px] text-[#07C160] font-bold active:scale-95 px-2 py-1 rounded-full bg-[#07C160]/10">去批注</span>
            </button>
          </div>
        </div>
        <button v-if="hasMore" @click="loadMore" class="w-full py-2.5 mt-2 text-xs font-bold text-[#07C160] bg-white border border-[#07C160]/30 rounded-xl active:bg-green-50">
          加载更多（还有 {{ remaining }} 名学员）
        </button>
      </template>
      <div v-else class="text-center py-14 text-gray-400 text-sm bg-white rounded-2xl border border-gray-100">
        {{ searchKeyword ? '没有匹配该学员的待批注记录' : '暂无待批注记录，全部已处理！' }}
      </div>
    </div>

    <!-- 营期选择弹窗 -->
    <VanPopup v-model:show="showCampPicker" position="bottom" round>
      <div class="p-4">
        <h3 class="font-bold text-gray-900 text-base mb-3 text-center">选择营期</h3>
        <div class="space-y-2">
          <button v-for="camp in store.camps" :key="camp.id"
            @click="selectedCampId = camp.id; store.selectedCampId = camp.id; showCampPicker = false"
            :class="['w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all', selectedCampId === camp.id ? 'border-[#07C160] bg-green-50 text-[#07C160]' : 'border-gray-200 bg-white text-gray-700 active:bg-gray-50']">
            <div class="flex-1 text-left min-w-0"><span class="font-medium">{{ camp.name }}</span><div class="text-[10px] text-gray-400 mt-0.5">{{ campDateRange(camp) }}</div></div>
          </button>
        </div>
      </div>
    </VanPopup>

    <!-- 底部菜单：首页 / 批注 / 发布活动 -->
    <VanTabbar class="custom-tabbar tabbar-green" :model-value="1">
      <VanTabbarItem @click="store.setCurrentView('coach-dashboard')">
        <template #icon><Users class="h-6 w-6" /></template>
        首页
      </VanTabbarItem>
      <VanTabbarItem :badge="unannotatedCount > 0 ? unannotatedCount : undefined">
        <template #icon><FileText class="h-6 w-6" /></template>
        批注
      </VanTabbarItem>
      <VanTabbarItem @click="store.setCurrentView('activity-upload')">
        <template #icon><Dumbbell class="h-6 w-6" /></template>
        发布活动
      </VanTabbarItem>
    </VanTabbar>
  </div>
</template>