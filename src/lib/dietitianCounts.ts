import { computed } from 'vue';
import { useAppStore } from '../store/app';
import { latestOrFirstId } from './camps';

/**
 * 营养师端底部 Tabbar 的角标数字（所有营养师页面共用，口径一致）：
 * - unannotatedCount  ：「批注」tab 的待批注数 = 当前营期下未批注的饮食 + 体重记录数
 * - fulfillmentPendingCount：「配置」tab 的发放中心"待发货"订单数 = 状态 pending 的奖励领取 + 积分兑换（跨营期，与 FulfillmentCenterView 一致）
 */
export function useDietitianCounts() {
  const store = useAppStore();
  // 统一取所选营期（未选则回落最近一期），保证各页角标为同一口径
  const campId = computed(() => store.selectedCampId || latestOrFirstId(store.camps) || '');

  const unannotatedCount = computed(() => {
    if (!campId.value) return 0;
    const diet = store.getCampDietRecords(campId.value).filter((r) => !r.dietitianComment && r.dietitianScore == null).length;
    const weight = store.getCampWeightRecords(campId.value).filter((r) => !r.dietitianComment).length;
    return diet + weight;
  });

  const fulfillmentPendingCount = computed(() => {
    const claims = store.rewardClaims.filter((c) => c.status === 'pending').length;
    const exchanges = store.pointExchanges.filter((e) => e.status === 'pending').length;
    return claims + exchanges;
  });

  return { unannotatedCount, fulfillmentPendingCount };
}