<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAppStore } from '../store/app';
import { NavBar as VanNavBar, Tabbar as VanTabbar, TabbarItem as VanTabbarItem, showSuccessToast } from 'vant';
import {
  Activity, FileText, Bell, Coins, Gift, Zap,
  Truck, CheckCircle, XCircle, Clock, Package, AlertTriangle, ChevronRight, MapPin,
} from 'lucide-vue-next';
import type { PointExchangeRecord, RewardClaim } from '../types';
import { calculateStreak } from '../lib/streak';

const store = useAppStore();

// ─── Tab ───
type Tab = 'all' | 'exchange' | 'reward' | 'activity';
const activeTab = ref<Tab>('all');

// ─── 学员数据 ───
const studentId = computed(() => store.user?.id || '');

// ─── 营期上下文（与日历、首页保持一致） ───
const availableCamps = computed(() => store.user ? store.getStudentCamps(store.user.id) : []);
const activeCampId = computed(() => {
  if (store.selectedCampId && availableCamps.value.some(c => c.id === store.selectedCampId)) {
    return store.selectedCampId;
  }
  const active = availableCamps.value.find(c => c.status === 'active');
  return active?.id || availableCamps.value[0]?.id || null;
});

// 营期范围内的奖品层级（用于 tier 查找）
const campTiers = computed(() =>
  activeCampId.value ? store.getCampRewardTiers(activeCampId.value) : store.rewardTiers,
);

// 营期打卡记录（用于连续天数计算）
const campDiet = computed(() => activeCampId.value ? store.getCampDietRecords(activeCampId.value) : store.dietRecords);
const campEx = computed(() => activeCampId.value ? store.getCampExerciseRecords(activeCampId.value) : store.exerciseRecords);
const campWt = computed(() => activeCampId.value ? store.getCampWeightRecords(activeCampId.value) : store.weightRecords);

// 连续打卡数据
const streakData = computed(() => calculateStreak(campEx.value, campDiet.value, campWt.value, studentId.value));

// 积分兑换记录（按当前营期过滤，与打卡/活动奖励口径一致）
const exchanges = computed(() =>
  store.getStudentExchanges(studentId.value)
    .filter((e) => !activeCampId.value || !e.campId || e.campId === activeCampId.value),
);

// 打卡奖励 claims（source = streak）— 按营期过滤
const streakClaims = computed(() => {
  const claims = activeCampId.value
    ? store.getCampRewardClaims(activeCampId.value)
    : store.rewardClaims;
  return claims.filter(c => {
    if (c.studentId !== studentId.value) return false;
    const tier = campTiers.value.find(t => t.id === c.tierId);
    return tier?.source === 'streak';
  });
});

const claimableStreakTiers = computed(() => {
  const streakTiers = campTiers.value.filter(t => t.source === 'streak');
  return streakTiers.filter(tier => {
    if (streakClaims.value.some(c => c.tierId === tier.id)) return false;
    if (streakData.value.currentStreak < tier.requiredDays) return false;
    if (tier.stock <= 0) return false;
    return true;
  });
});

// 活动奖励 claims（source = activity）— 按营期过滤
const activityClaims = computed(() => {
  const claims = activeCampId.value
    ? store.getCampRewardClaims(activeCampId.value)
    : store.rewardClaims;
  return claims.filter(c => {
    if (c.studentId !== studentId.value) return false;
    const tier = campTiers.value.find(t => t.id === c.tierId);
    return tier?.source === 'activity';
  });
});

// 统一记录类型
interface UnifiedRecord {
  id: string;
  type: 'exchange' | 'streak' | 'activity';
  typeName: string;
  productName: string;
  productImage: string;
  date: string;
  status: string;
  statusLabel: string;
  statusColor: string;
  statusBg: string;
  deliveryMethod?: 'shipped' | 'in-person';
  trackingNumber?: string;
  shipDate?: string;
  deliveredAt?: string;
  pointsSpent?: number;
  recipientName?: string;
  recipientPhone?: string;
  recipientAddress?: string;
  raw?: PointExchangeRecord | RewardClaim;
}

const EXCHANGE_STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: '待发货', color: '#1677FF', bg: '#EBF5FF' },
  fulfilled: { label: '已发货', color: '#07C160', bg: '#E8F8EE' },
  cancelled: { label: '已取消', color: '#969799', bg: '#F2F3F5' },
};

const CLAIM_STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  claimable: { label: '可领取', color: '#FF976A', bg: '#FFF4ED' },
  confirmed: { label: '待领取', color: '#FF976A', bg: '#FFF4ED' },
  pending: { label: '待发货', color: '#1677FF', bg: '#EBF5FF' },
  shipped: { label: '已发货', color: '#07C160', bg: '#E8F8EE' },
  'in-person': { label: '线下发放', color: '#07C160', bg: '#E8F8EE' },
};

const allRecords = computed<UnifiedRecord[]>(() => {
  const list: UnifiedRecord[] = [];

  // 兑换记录
  exchanges.value.forEach(e => {
    const s = EXCHANGE_STATUS_MAP[e.status] || { label: e.status, color: '#969799', bg: '#F2F3F5' };
    list.push({
      id: e.id, type: 'exchange', typeName: '积分兑换',
      productName: e.productName, productImage: e.productImage,
      date: e.exchangeDate, status: e.status,
      statusLabel: s.label, statusColor: s.color, statusBg: s.bg,
      deliveryMethod: e.deliveryMethod,
      trackingNumber: e.trackingNumber,
      shipDate: e.shipDate, deliveredAt: e.deliveredAt,
      pointsSpent: e.pointsSpent,
      recipientName: e.recipientName,
      recipientPhone: e.recipientPhone,
      recipientAddress: e.recipientAddress,
      raw: e,
    });
  });

  // 打卡奖励
  streakClaims.value.forEach(c => {
    const tier = campTiers.value.find(t => t.id === c.tierId);
    const s = CLAIM_STATUS_MAP[c.status] || { label: c.status, color: '#969799', bg: '#F2F3F5' };
    list.push({
      id: c.id, type: 'streak', typeName: '打卡奖励',
      productName: tier?.name || '未知礼品', productImage: tier?.imageUrl || '',
      date: c.claimDate, status: c.status,
      statusLabel: s.label, statusColor: s.color, statusBg: s.bg,
      deliveryMethod: c.deliveryMethod,
      trackingNumber: c.trackingNumber,
      shipDate: c.shipDate, deliveredAt: c.deliveredAt,
      recipientName: c.recipientName,
      recipientPhone: c.recipientPhone,
      recipientAddress: c.recipientAddress,
      raw: c,
    });
  });

  // 可领取但尚未领取的连续打卡奖励
  claimableStreakTiers.value.forEach(tier => {
    const s = CLAIM_STATUS_MAP['claimable'];
    list.push({
      id: 'claimable_' + tier.id, type: 'streak', typeName: '打卡奖励',
      productName: tier.name, productImage: tier.imageUrl,
      date: new Date().toISOString().substring(0, 10),
      status: 'claimable',
      statusLabel: s.label, statusColor: s.color, statusBg: s.bg,
    });
  });

  // 活动奖励
  activityClaims.value.forEach(c => {
    const tier = campTiers.value.find(t => t.id === c.tierId);
    const s = CLAIM_STATUS_MAP[c.status] || { label: c.status, color: '#969799', bg: '#F2F3F5' };
    list.push({
      id: c.id, type: 'activity', typeName: '活动奖励',
      productName: tier?.name || '未知礼品', productImage: tier?.imageUrl || '',
      date: c.claimDate, status: c.status,
      statusLabel: s.label, statusColor: s.color, statusBg: s.bg,
      deliveryMethod: c.deliveryMethod,
      trackingNumber: c.trackingNumber,
      shipDate: c.shipDate, deliveredAt: c.deliveredAt,
      recipientName: c.recipientName,
      recipientPhone: c.recipientPhone,
      recipientAddress: c.recipientAddress,
      raw: c,
    });
  });

  return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
});

const filteredRecords = computed(() => {
  if (activeTab.value === 'all') return allRecords.value;
  // tab key 'reward' 对应 unified record type 'streak'
  const typeFilter = activeTab.value === 'reward' ? 'streak' : activeTab.value;
  return allRecords.value.filter(r => r.type === typeFilter);
});

const tabCounts = computed(() => ({
  all: allRecords.value.length,
  exchange: allRecords.value.filter(r => r.type === 'exchange').length,
  reward: allRecords.value.filter(r => r.type === 'streak').length,
  activity: allRecords.value.filter(r => r.type === 'activity').length,
}));

// ─── 跳转到领取页面 ───
function goToClaim(record: UnifiedRecord) {
  if (record.type === 'streak') {
    store.setCurrentView('reward');
  } else if (record.type === 'activity') {
    store.setCurrentView('camp-activities');
  }
}

// ─── 取消兑换二次确认 ───
const showCancelModal = ref(false);
const cancelTarget = ref<UnifiedRecord | null>(null);

function openCancelModal(record: UnifiedRecord) {
  cancelTarget.value = record;
  showCancelModal.value = true;
}

function confirmCancel() {
  if (!cancelTarget.value || cancelTarget.value.type !== 'exchange') return;
  const raw = cancelTarget.value.raw as PointExchangeRecord;
  store.cancelExchange(raw.id);
  showCancelModal.value = false;
  cancelTarget.value = null;
  showSuccessToast('已取消兑换，积分已返还');
}

// ─── 工具函数 ───
function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 未读批注
const unreadCount = computed(() => {
  if (store.user?.role !== 'student') return 0;
  const id = store.user.id;
  const diet = campDiet.value.filter((r) => r.studentId === id && r.dietitianComment && !r.commentRead);
  const ex = campEx.value.filter((r) => r.studentId === id && r.coachComment && !r.commentRead);
  const wt = campWt.value.filter((r) => r.studentId === id && r.dietitianComment && !r.commentRead);
  return diet.length + ex.length + wt.length;
});
</script>

<template>
  <div class="flex min-h-full flex-col font-sans relative bg-[#F7F8FA]">
    <VanNavBar left-arrow @click-left="store.setCurrentView('activity-hub')" title="我的奖励" :border="false"
      class="!bg-transparent !pt-[env(safe-area-inset-top)]" />

    <!-- Tab 栏 -->
    <div class="px-5 pt-2 pb-3">
      <div class="flex gap-2 overflow-x-auto">
        <button
          v-for="t in [
            { key: 'all', label: '全部', count: tabCounts.all },
            { key: 'exchange', label: '积分兑换', count: tabCounts.exchange },
            { key: 'reward', label: '打卡奖励', count: tabCounts.reward },
            { key: 'activity', label: '活动奖励', count: tabCounts.activity },
          ]"
          :key="t.key"
          @click="activeTab = t.key as Tab"
          :class="[
            'shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors',
            activeTab === t.key
              ? 'bg-[#FF6B35] text-white'
              : 'bg-white text-gray-500 border border-gray-200'
          ]"
        >
          {{ t.label }}
          <span v-if="t.count > 0" class="ml-0.5">{{ t.count }}</span>
        </button>
      </div>
    </div>

    <!-- 记录列表 -->
    <div class="flex-1 px-5 pb-28">
      <div v-if="filteredRecords.length === 0" class="flex flex-col items-center justify-center py-24">
        <div class="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-3">
          <Package class="w-8 h-8 text-gray-300" />
        </div>
        <p class="text-sm text-gray-400">暂无奖励记录</p>
        <p class="text-[11px] text-gray-400 mt-1">坚持打卡，赢取丰厚奖励</p>
      </div>

      <div v-else class="space-y-3">
        <div v-for="record in filteredRecords" :key="record.id"
          class="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm"
        >
          <div class="flex p-3 gap-3">
            <!-- 商品图 -->
            <div class="w-16 h-16 rounded-xl overflow-hidden bg-gray-50 shrink-0">
              <img :src="record.productImage" class="w-full h-full object-cover" :alt="record.productName" />
            </div>

            <div class="flex-1 min-w-0">
              <div class="flex items-start justify-between gap-2">
                <h3 class="text-sm font-bold text-gray-900 truncate">{{ record.productName }}</h3>
                <span
                  :class="['shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full',
                    record.statusBg, record.statusColor]"
                >
                  {{ record.statusLabel }}
                </span>
              </div>

              <!-- 来源标签 + 积分/日期 -->
              <div class="flex items-center gap-2 mt-1 flex-wrap">
                <span :class="['text-[9px] font-bold px-1.5 py-0.5 rounded-full',
                  record.type === 'exchange' ? 'bg-[#FFF4ED] text-[#FF6B35]' :
                  record.type === 'streak' ? 'bg-[#E8F8EE] text-[#07C160]' :
                  'bg-[#EBF5FF] text-[#1677FF]']">
                  {{ record.typeName }}
                </span>
                <span v-if="record.pointsSpent" class="flex items-center gap-0.5 text-[10px] text-gray-400">
                  <Coins class="w-3 h-3 text-[#FF976A]" />
                  <span class="font-bold text-[#FF6B35]">-{{ record.pointsSpent }}</span>
                </span>
                <span class="text-[10px] text-gray-400">{{ formatDate(record.date) }}</span>
              </div>

              <!-- 配送方式 -->
              <div v-if="record.deliveryMethod" class="mt-1 text-[10px] text-gray-400">
                <Truck class="w-3 h-3 inline mr-0.5" />
                {{ record.deliveryMethod === 'shipped' ? '邮寄' : '线下领取' }}
              </div>

              <!-- 收货地址信息 -->
              <div v-if="record.recipientName && record.recipientAddress && record.recipientAddress !== '线下领取'" class="mt-1.5 bg-gray-50 rounded-lg p-2 text-[10px] text-gray-600 leading-relaxed">
                <div class="flex items-center gap-1 text-gray-400 mb-0.5">
                  <MapPin class="w-3 h-3" /> 收货信息
                </div>
                <div>{{ record.recipientName }} {{ record.recipientPhone }}</div>
                <div class="mt-0.5">{{ record.recipientAddress }}</div>
              </div>

              <!-- 快递单号 -->
              <div v-if="record.trackingNumber" class="mt-2 bg-green-50 rounded-lg p-2 flex items-center justify-between">
                <div class="text-[10px] text-gray-600">
                  <span class="text-gray-400">快递单号：</span>
                  <span class="font-mono font-bold">{{ record.trackingNumber }}</span>
                </div>
              </div>

              <!-- 去领取按钮（待领取状态，streak和activity类型） -->
              <div v-if="(record.type === 'streak' || record.type === 'activity') && (record.status === 'confirmed' || record.status === 'claimable')" class="mt-2">
                <button
                  class="text-[11px] font-bold text-white bg-[#FF6B35] px-3 py-1.5 rounded-full active:scale-95 transition-transform flex items-center gap-1"
                  @click="goToClaim(record)"
                >
                  去领取 <ChevronRight class="w-3 h-3" />
                </button>
              </div>

              <!-- 取消按钮（仅积分兑换+待发货状态） -->
              <div v-if="record.type === 'exchange' && record.status === 'pending'" class="mt-2">
                <button
                  class="text-[11px] font-bold text-gray-500 bg-gray-100 px-3 py-1.5 rounded-full active:scale-95 transition-transform"
                  @click="openCancelModal(record)"
                >
                  取消兑换
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 取消兑换确认弹窗 -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showCancelModal" class="fixed inset-0 z-[999] bg-black/40 flex items-center justify-center p-6" @click="showCancelModal = false">
          <div v-if="cancelTarget" class="bg-white rounded-3xl w-full max-w-[320px] overflow-hidden shadow-xl" @click.stop>
            <div class="p-5 text-center">
              <div class="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
                <AlertTriangle class="w-6 h-6 text-[#FF4444]" />
              </div>
              <h3 class="text-base font-black text-gray-900">确认取消兑换？</h3>
              <p class="text-xs text-gray-500 mt-2 leading-relaxed">
                取消后将在记录中显示为"已取消"，<br>
                消耗的 <span class="font-bold text-[#FF6B35]">{{ cancelTarget.pointsSpent }} 积分</span> 将自动返还。
              </p>
              <div class="mt-3 bg-gray-50 rounded-xl p-2.5 flex items-center gap-2 text-left">
                <div class="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                  <img :src="cancelTarget.productImage" class="w-full h-full object-cover" />
                </div>
                <div class="min-w-0">
                  <div class="text-xs font-bold text-gray-900 truncate">{{ cancelTarget.productName }}</div>
                  <div class="text-[10px] text-gray-400">{{ formatDate(cancelTarget.date) }}</div>
                </div>
              </div>
              <div class="flex gap-3 mt-4">
                <button
                  class="flex-1 py-2.5 rounded-xl text-sm font-bold text-gray-600 bg-gray-100 active:scale-95 transition-transform"
                  @click="showCancelModal = false"
                >
                  再想想
                </button>
                <button
                  class="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-[#FF4444] active:scale-95 transition-transform"
                  @click="confirmCancel"
                >
                  确认取消
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Bottom Nav -->
    <VanTabbar class="custom-tabbar" :model-value="1">
      <VanTabbarItem @click="store.setCurrentView('dashboard')">
        <template #icon><Activity class="h-6 w-6" /></template>
        首页
      </VanTabbarItem>
      <VanTabbarItem @click="store.setCurrentView('activity-hub')">
        <template #icon><Gift class="h-6 w-6" /></template>
        活动
      </VanTabbarItem>
      <VanTabbarItem @click="store.setCurrentView('messages')" :badge="unreadCount > 0 ? unreadCount : undefined">
        <template #icon><Bell class="h-6 w-6" /></template>
        消息
      </VanTabbarItem>
      <VanTabbarItem @click="store.setCurrentView('health-profile')">
        <template #icon><FileText class="h-6 w-6" /></template>
        档案
      </VanTabbarItem>
    </VanTabbar>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
