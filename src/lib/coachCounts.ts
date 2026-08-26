import { computed } from 'vue';
import { useAppStore } from '../store/app';
import { latestOrFirstId } from './camps';

/**
 * 教练端底部 Tabbar 角标（各教练页面共用，口径一致）：
 * - unannotatedCount：「批注」tab 的待批注运动记录数 = 当前营期下未批注(coachComment 为空且 coachScore 为 null)的运动记录数
 */
export function useCoachCounts() {
  const store = useAppStore();
  // 统一取所选营期（未选则回落最近一期）
  const campId = computed(() => store.selectedCampId || latestOrFirstId(store.camps) || '');

  const unannotatedCount = computed(() => {
    if (!campId.value) return 0;
    return store
      .getCampExerciseRecords(campId.value)
      .filter((r) => !r.coachComment && r.coachScore == null).length;
  });

  return { unannotatedCount };
}