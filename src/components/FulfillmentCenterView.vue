<script setup lang="ts">
import { ref, computed, type Component } from 'vue';
import { useAppStore } from '../store/app';
import { NavBar, Card } from './ui';
import { Popup as VanPopup, showToast } from 'vant';
import {
  Truck, Coins, Clock, CheckCircle2,
  AlertCircle, ClipboardCheck, Eye,
} from 'lucide-vue-next';
import type { RewardClaim, PointExchangeRecord } from '../types';
import { computeWeightMilestones, computeWeeklyChallenges, computeLuckyDraw } from '../lib/campActivities';

const store = useAppStore();

// ─── 顶层模块Tab（平铺，无home页） ───
type Module = 'audit' | 'shipping' | 'exchange';
const activeModule = ref<Module>('shipping');

// ─── 子Tab ───
type AuditTab = 'pending' | 'confirmed';
type ShipTab = 'pending' | 'shipped';
const auditTab = ref<AuditTab>('pending');
const shipTab = ref<ShipTab>('pending');

// ─── 全部营期数据 ───
const allRewardTiers = computed(() => store.rewardTiers);
const allRewardClaims = computed(() => store.rewardClaims);
const allExchanges = computed(() =>
  [...store.pointExchanges].sort((a, b) => b.exchangeDate.localeCompare(a.exchangeDate))
);

/** 是否还有趣味活动奖品（阶梯/每周/全勤）——没有则发放中心隐藏「审核」模块 */
const hasActivityTiers = computed(() => allRewardTiers.value.some(t => t.source === 'activity' && t.stock > 0));

// ─── 跨营期计算待审核 ───
const crossCampPendingAudit = computed(() => {
  const list: {
    studentId: string; studentName: string;
    activityType: 'milestone' | 'weekly' | 'lucky';
    activityLabel: string; subLabel: string;
    campName: string; campId: string;
    threshold?: number;
  }[] = [];

  for (const camp of store.camps) {
    const cfg = store.getActivityConfig(camp.id);
    const dietRecords = store.getCampDietRecords(camp.id);
    const exerciseRecords = store.getCampExerciseRecords(camp.id);
    const weightRecords = store.getCampWeightRecords(camp.id);
    const students = store.getStudentsByCamp(camp.id);
    const claims = store.getCampRewardClaims(camp.id);
    const tiers = store.getCampRewardTiers(camp.id);

    const getStudentActivityClaims = (studentId: string, activityType: string) =>
      claims.filter(c => {
        const tier = tiers.find(t => t.id === c.tierId);
        return c.studentId === studentId && tier?.source === 'activity' && tier?.activityType === activityType;
      });

    // 按阈值百分比匹配里程碑对应的奖品层级（与 CampActivitiesView 逻辑一致）
    const findMilestoneTier = (threshold: number) => {
      const percent = Math.round(threshold * 100);
      return tiers.find(t =>
        t.source === 'activity' && t.activityType === 'milestone' &&
        t.description?.includes(`${percent}%`)
      );
    };
    // 检查某个具体里程碑档位是否已被领取（避免 3% 已领后 5% 不再显示）
    const isMilestoneClaimed = (studentId: string, threshold: number) => {
      const tier = findMilestoneTier(threshold);
      if (!tier) return false;
      return claims.some(c => c.studentId === studentId && c.tierId === tier.id);
    };

    for (const s of students) {
      const weights = weightRecords
        .filter(w => w.studentId === s.id)
        .sort((a, b) => a.date.localeCompare(b.date));
      const startW = weights.length > 0 ? weights[0].weight : null;
      const milestones = computeWeightMilestones(weights, startW);
      const latestW = weights.length > 0 ? weights[weights.length - 1].weight : null;

      const challenges = computeWeeklyChallenges(dietRecords, exerciseRecords, weightRecords, s.id, {
        challengeStartDate: cfg.weeklyChallengeStartDate,
        challengeWeeks: cfg.weeklyChallengeWeeks,
        campStartDate: camp.startDate,
      });
      const luckyDraw = computeLuckyDraw(dietRecords, exerciseRecords, weightRecords, s.id);

      // 所有已达标且未被领取的里程碑，各档位独立显示
      const pendingMilestones = milestones
        .filter(m => m.achieved && !isMilestoneClaimed(s.id, m.threshold))
        .sort((a, b) => a.threshold - b.threshold);

      if (cfg.weightMilestone) {
        for (const m of pendingMilestones) {
          list.push({
            studentId: s.id, studentName: s.name,
            activityType: 'milestone',
            activityLabel: m.label || '阶梯减重达标',
            subLabel: `减重 ${startW && latestW ? +(startW - latestW).toFixed(1) : 0}kg`,
            campName: camp.name,
            campId: camp.id,
            threshold: m.threshold,
          });
        }
      }
      if (cfg.weeklyChallenge) {
        const totalWeeks = cfg.weeklyChallengeWeeks || 4;
        const completedCount = challenges.filter(c => c.completed).length;
        if (completedCount >= totalWeeks && getStudentActivityClaims(s.id, 'weekly').length === 0) {
          list.push({
            studentId: s.id, studentName: s.name,
            activityType: 'weekly',
            activityLabel: '每周挑战完成',
            subLabel: `已完成 ${completedCount}/${totalWeeks} 周`,
            campName: camp.name,
            campId: camp.id,
          });
        }
      }
      if (cfg.luckyDraw && luckyDraw.eligible && getStudentActivityClaims(s.id, 'lucky').length === 0) {
        list.push({
          studentId: s.id, studentName: s.name,
          activityType: 'lucky',
          activityLabel: '全勤幸运抽奖',
          subLabel: `完成率 ${Math.round(luckyDraw.completionRate * 100)}%`,
          campName: camp.name,
          campId: camp.id,
        });
      }
    }
  }
  return list;
});

// ─── 已审核（待领取）的claims ───
const confirmedClaims = computed(() =>
  allRewardClaims.value
    .filter(c => c.status === 'confirmed')
    .sort((a, b) => new Date(b.claimDate).getTime() - new Date(a.claimDate).getTime())
);

// ─── 统一发货列表 ───
interface ShipItem {
  id: string;
  type: 'claim' | 'exchange';
  studentName: string;
  productName: string;
  productImage: string;
  date: string;
  deliveryMethod?: 'shipped' | 'in-person';
  recipientName?: string;
  recipientPhone?: string;
  recipientAddress?: string;
  trackingNumber?: string;
  shipDate?: string;
  deliveredAt?: string;
  rawClaim?: RewardClaim;
  rawExchange?: PointExchangeRecord;
}

const pendingShipItems = computed<ShipItem[]>(() => {
  const claimItems: ShipItem[] = allRewardClaims.value
    .filter(c => c.status === 'pending')
    .map(c => {
      const tier = allRewardTiers.value.find(t => t.id === c.tierId);
      return {
        id: c.id, type: 'claim' as const,
        studentName: c.studentName,
        productName: tier?.name || '未知礼品',
        productImage: tier?.imageUrl || '',
        date: c.claimDate,
        deliveryMethod: c.deliveryMethod,
        recipientName: c.recipientName,
        recipientPhone: c.recipientPhone,
        recipientAddress: c.recipientAddress,
        rawClaim: c,
      };
    });

  const exchangeItems: ShipItem[] = allExchanges.value
    .filter(e => e.status === 'pending')
    .map(e => ({
      id: e.id, type: 'exchange' as const,
      studentName: e.studentName,
      productName: e.productName,
      productImage: e.productImage,
      date: e.exchangeDate,
      deliveryMethod: e.deliveryMethod,
      recipientName: e.recipientName,
      recipientPhone: e.recipientPhone,
      recipientAddress: e.recipientAddress,
      rawExchange: e,
    }));

  return [...claimItems, ...exchangeItems]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
});

const shippedItems = computed<ShipItem[]>(() => {
  const claimItems: ShipItem[] = allRewardClaims.value
    .filter(c => c.status === 'shipped' || c.status === 'in-person')
    .map(c => {
      const tier = allRewardTiers.value.find(t => t.id === c.tierId);
      return {
        id: c.id, type: 'claim' as const,
        studentName: c.studentName,
        productName: tier?.name || '未知礼品',
        productImage: tier?.imageUrl || '',
        date: c.shipDate || c.deliveredAt || c.claimDate,
        deliveryMethod: c.deliveryMethod,
        recipientName: c.recipientName,
        recipientPhone: c.recipientPhone,
        recipientAddress: c.recipientAddress,
        trackingNumber: c.trackingNumber,
        shipDate: c.shipDate,
        deliveredAt: c.deliveredAt,
        rawClaim: c,
      };
    });

  const exchangeItems: ShipItem[] = allExchanges.value
    .filter(e => e.status === 'fulfilled')
    .map(e => ({
      id: e.id, type: 'exchange' as const,
      studentName: e.studentName,
      productName: e.productName,
      productImage: e.productImage,
      date: e.shipDate || e.deliveredAt || e.exchangeDate,
      deliveryMethod: e.deliveryMethod,
      recipientName: e.recipientName,
      recipientPhone: e.recipientPhone,
      recipientAddress: e.recipientAddress,
      trackingNumber: e.trackingNumber,
      shipDate: e.shipDate,
      deliveredAt: e.deliveredAt,
      rawExchange: e,
    }));

  return [...claimItems, ...exchangeItems]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
});

// ─── 审核弹窗 ───
const showAuditModal = ref(false);
const auditTarget = ref<{ studentId: string; studentName: string; activityType: 'milestone' | 'weekly' | 'lucky'; activityLabel: string; campId: string; threshold?: number } | null>(null);
const selectedTierId = ref('');
const auditError = ref('');

const activityTiers = computed(() => allRewardTiers.value.filter(t => t.source === 'activity'));
const availableTiers = computed(() => {
  if (!auditTarget.value) return [];
  return activityTiers.value.filter(t => t.activityType === auditTarget.value!.activityType && t.stock > 0);
});

function openAuditModal(studentId: string, studentName: string, activityType: 'milestone' | 'weekly' | 'lucky', activityLabel: string, campId: string, threshold?: number) {
  auditTarget.value = { studentId, studentName, activityType, activityLabel, campId, threshold };
  // 里程碑：按阈值百分比自动选中对应奖品层级
  if (activityType === 'milestone' && threshold !== undefined) {
    const percent = Math.round(threshold * 100);
    const tier = allRewardTiers.value.find(t =>
      t.source === 'activity' && t.activityType === 'milestone' &&
      t.description?.includes(`${percent}%`) && t.stock > 0
    );
    selectedTierId.value = tier?.id || '';
  } else {
    selectedTierId.value = '';
  }
  auditError.value = '';
  showAuditModal.value = true;
}

function submitAudit() {
  if (!auditTarget.value) return;
  if (!selectedTierId.value) { auditError.value = '请选择奖品'; return; }
  const tier = allRewardTiers.value.find(t => t.id === selectedTierId.value);
  if (!tier) { auditError.value = '奖品不存在'; return; }
  if (tier.stock <= 0) { auditError.value = '该奖品库存不足'; return; }

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  const claim: RewardClaim = {
    id: `rc_${Date.now()}`,
    tierId: tier.id,
    studentId: auditTarget.value.studentId,
    studentName: auditTarget.value.studentName,
    recipientName: '', recipientPhone: '', recipientAddress: '',
    claimDate: dateStr,
    status: 'confirmed',
    activityType: auditTarget.value.activityType,
    campId: auditTarget.value.campId,
    deliveryMethod: tier.deliveryMethods?.[0] || 'shipped',
  };
  store.addRewardClaim(claim);
  store.updateRewardTier(tier.id, { stock: tier.stock - 1 });
  showAuditModal.value = false;
  showToast(`已审核通过：${auditTarget.value.studentName} - ${tier.name}`);
}

// ─── 查看学员体重打卡（跳转到学员详情页体重Tab） ───
function viewStudentWeight(studentId: string, campId?: string) {
  store.setSelectedStudentId(studentId);
  if (campId) store.selectedCampId = campId;
  store.setPendingAnnotation('weight', null);
  store.setCurrentView('dietitian-student-detail');
}

// ─── 发货弹窗 ───
const showShipModal = ref(false);
const shipTarget = ref<ShipItem | null>(null);
const trackingNumber = ref('');
const shipError = ref('');
const showInPersonModal = ref(false);

function handleShipClick(item: ShipItem) {
  shipTarget.value = item;
  trackingNumber.value = '';
  shipError.value = '';
  showShipModal.value = true;
}

function handleInPersonClick(item: ShipItem) {
  shipTarget.value = item;
  showInPersonModal.value = true;
}

function submitShipping() {
  if (!trackingNumber.value.trim()) { shipError.value = '请输入快递单号'; return; }
  if (!shipTarget.value) return;
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  if (shipTarget.value.type === 'claim' && shipTarget.value.rawClaim) {
    store.updateRewardClaim(shipTarget.value.rawClaim.id, {
      status: 'shipped',
      trackingNumber: trackingNumber.value.trim(),
      shipDate: dateStr,
    });
  } else if (shipTarget.value.type === 'exchange' && shipTarget.value.rawExchange) {
    store.shipExchange(shipTarget.value.rawExchange.id, trackingNumber.value.trim(), 'shipped');
  }
  showShipModal.value = false;
  showToast('发货成功');
}

function submitInPerson() {
  if (!shipTarget.value) return;
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  if (shipTarget.value.type === 'claim' && shipTarget.value.rawClaim) {
    store.updateRewardClaim(shipTarget.value.rawClaim.id, {
      status: 'in-person',
      deliveredAt: dateStr,
    });
  } else if (shipTarget.value.type === 'exchange' && shipTarget.value.rawExchange) {
    store.shipExchange(shipTarget.value.rawExchange.id, '', 'in-person');
  }
  showInPersonModal.value = false;
  showToast('线下发放已确认');
}

// ─── 工具函数 ───
function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function copyToClipboard(text: string, label = '单号') {
  // 优先使用 Clipboard API（需 HTTPS / 安全上下文）
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text)
      .then(() => showToast(`已复制${label}`))
      .catch(() => fallbackCopy(text, label));
    return;
  }
  fallbackCopy(text, label);
}

function fallbackCopy(text: string, label: string) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
    showToast(`已复制${label}`);
  } catch {
    showToast('复制失败，请手动长按选择');
  }
  document.body.removeChild(textarea);
}

function copyShippingInfo(item: ShipItem) {
  const text = `收件人：${item.recipientName}\n电话：${item.recipientPhone}\n地址：${item.recipientAddress}`;
  copyToClipboard(text, '收货信息');
}

// ─── 状态标签 ───
const CLAIM_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  confirmed: { label: '待领取', color: '#FF976A', bg: '#FFF4ED' },
  pending: { label: '待发货', color: '#1677FF', bg: '#EBF5FF' },
  shipped: { label: '已发货', color: '#07C160', bg: '#E8F8EE' },
  'in-person': { label: '线下发放', color: '#07C160', bg: '#E8F8EE' },
};

const EXCHANGE_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: '待发货', color: '#1677FF', bg: '#EBF5FF' },
  fulfilled: { label: '已发货', color: '#07C160', bg: '#E8F8EE' },
  cancelled: { label: '已取消', color: '#969799', bg: '#F2F3F5' },
};

// ─── 顶层Tab数据（带条数） ───
const moduleTabs = computed(() => {
  const tabs: { key: Module; label: string; icon: Component; count: number }[] = [
    {
      key: 'shipping' as Module,
      label: '发货',
      icon: Truck,
      count: pendingShipItems.value.length,
    },
    {
      key: 'exchange' as Module,
      label: '兑换记录',
      icon: Coins,
      count: allExchanges.value.length,
    },
  ];
  // 「审核」仅依赖趣味活动奖品（阶梯/每周/全勤）；没有趣味活动时隐藏该模块
  if (hasActivityTiers.value) {
    tabs.unshift({
      key: 'audit' as Module,
      label: '审核',
      icon: ClipboardCheck,
      count: crossCampPendingAudit.value.length + confirmedClaims.value.length,
    });
  }
  return tabs;
});

// 切换模块时重置子Tab
function switchModule(m: Module) {
  activeModule.value = m;
  if (m === 'audit') auditTab.value = 'pending';
  if (m === 'shipping') shipTab.value = 'pending';
}
</script>

<template>
  <div class="flex min-h-full flex-col bg-[#F7F8FA] relative">
    <NavBar title="发放中心" :on-back="store.goBack" />

    <!-- 顶层模块Tab（平铺，带条数） -->
    <div class="bg-white px-2 border-b border-gray-100 sticky top-0 z-10">
      <div class="flex">
        <button
          v-for="tab in moduleTabs"
          :key="tab.key"
          @click="switchModule(tab.key)"
          :class="[
            'flex-1 flex items-center justify-center gap-1.5 py-3 relative transition-colors',
            activeModule === tab.key ? 'text-[#FF976A]' : 'text-gray-400'
          ]"
        >
          <component :is="tab.icon" class="w-4 h-4" />
          <span class="text-sm font-bold">{{ tab.label }}</span>
          <span v-if="tab.count > 0" :class="[
            'text-[9px] px-1.5 py-0.5 rounded-full font-bold',
            activeModule === tab.key ? 'bg-[#FF976A] text-white' : 'bg-gray-100 text-gray-500'
          ]">{{ tab.count }}</span>
          <div v-if="activeModule === tab.key" class="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#FF976A] rounded-full"></div>
        </button>
      </div>
    </div>

    <!-- 内容区 -->
    <div class="flex-1 pb-24">

      <!-- ═══ 审核中心 ═══ -->
      <div v-if="activeModule === 'audit'">
        <!-- 子Tab -->
        <div class="bg-white px-4 border-b border-gray-50">
          <div class="flex gap-4">
            <button
              @click="auditTab = 'pending'"
              :class="['py-2.5 text-sm font-bold relative transition-colors', auditTab === 'pending' ? 'text-[#FF976A]' : 'text-gray-400']"
            >
              待审核
              <span v-if="crossCampPendingAudit.length > 0" class="ml-1 text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                :class="auditTab === 'pending' ? 'bg-[#FF976A] text-white' : 'bg-gray-100 text-gray-500'">{{ crossCampPendingAudit.length }}</span>
              <div v-if="auditTab === 'pending'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-[#FF976A] rounded-full"></div>
            </button>
            <button
              @click="auditTab = 'confirmed'"
              :class="['py-2.5 text-sm font-bold relative transition-colors', auditTab === 'confirmed' ? 'text-[#FF976A]' : 'text-gray-400']"
            >
              已审核
              <span v-if="confirmedClaims.length > 0" class="ml-1 text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                :class="auditTab === 'confirmed' ? 'bg-[#FF976A] text-white' : 'bg-gray-100 text-gray-500'">{{ confirmedClaims.length }}</span>
              <div v-if="auditTab === 'confirmed'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-[#FF976A] rounded-full"></div>
            </button>
          </div>
        </div>

        <!-- 待审核列表 -->
        <div v-if="auditTab === 'pending'" class="p-4 space-y-3">
          <div v-if="crossCampPendingAudit.length === 0" class="flex flex-col items-center py-16">
            <AlertCircle class="w-10 h-10 text-gray-200 mb-2" />
            <p class="text-sm text-gray-400">暂无待审核记录</p>
            <p class="text-[11px] text-gray-400 mt-1">学员达成活动目标后会显示在这里</p>
          </div>
          <Card v-for="item in crossCampPendingAudit" :key="`${item.studentId}-${item.activityType}-${item.threshold ?? ''}`" class="p-4">
            <div class="flex items-start justify-between gap-3">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <h3 class="text-sm font-bold text-gray-900">{{ item.studentName }}</h3>
                  <span class="text-[10px] text-white bg-[#FF976A] px-1.5 py-0.5 rounded-full font-bold">{{ item.activityLabel }}</span>
                  <span class="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded-full">{{ item.campName }}</span>
                </div>
                <div class="text-[11px] text-gray-500 mt-1">{{ item.subLabel }}</div>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <button
                  class="text-[11px] font-bold text-[#FF976A] border border-[#FF976A]/30 bg-[#FFF4ED] px-3 py-1.5 rounded-full active:scale-95 transition-transform flex items-center gap-1"
                  @click="viewStudentWeight(item.studentId, item.campId)"
                >
                  <Eye class="w-3 h-3" /> 查看
                </button>
                <button
                  class="text-[11px] font-bold text-white bg-[#FF976A] px-3 py-1.5 rounded-full active:scale-95 transition-transform"
                  @click="openAuditModal(item.studentId, item.studentName, item.activityType, item.activityLabel, item.campId, item.threshold)"
                >审核</button>
              </div>
            </div>
          </Card>
        </div>

        <!-- 已审核列表 -->
        <div v-else class="p-4 space-y-3">
          <div v-if="confirmedClaims.length === 0" class="flex flex-col items-center py-16">
            <Clock class="w-10 h-10 text-gray-200 mb-2" />
            <p class="text-sm text-gray-400">暂无已审核记录</p>
            <p class="text-[11px] text-gray-400 mt-1">审核通过后，学员可在此领取奖品</p>
          </div>
          <Card v-for="claim in confirmedClaims" :key="claim.id" class="p-4">
            <div class="flex items-start gap-3">
              <div class="w-14 h-14 rounded-xl bg-gray-100 shrink-0 overflow-hidden">
                <img :src="allRewardTiers.find(t => t.id === claim.tierId)?.imageUrl" class="w-full h-full object-cover" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between gap-2">
                  <h3 class="text-sm font-bold text-gray-900 truncate">{{ allRewardTiers.find(t => t.id === claim.tierId)?.name || '未知礼品' }}</h3>
                  <span class="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full" :class="CLAIM_STATUS[claim.status]?.bg, CLAIM_STATUS[claim.status]?.color">
                    {{ CLAIM_STATUS[claim.status]?.label }}
                  </span>
                </div>
                <div class="flex items-center gap-2 mt-1 text-[10px] text-gray-400">
                  <span>{{ claim.studentName }}</span>
                  <span>·</span>
                  <span>{{ formatDate(claim.claimDate) }}</span>
                </div>
                <div class="text-[10px] text-gray-500 mt-1">已审核确认，等待学员选择领取方式</div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <!-- ═══ 发货中心 ═══ -->
      <div v-if="activeModule === 'shipping'">
        <!-- 子Tab -->
        <div class="bg-white px-4 border-b border-gray-50">
          <div class="flex gap-4">
            <button
              @click="shipTab = 'pending'"
              :class="['py-2.5 text-sm font-bold relative transition-colors', shipTab === 'pending' ? 'text-[#1677FF]' : 'text-gray-400']"
            >
              待发货
              <span v-if="pendingShipItems.length > 0" class="ml-1 text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                :class="shipTab === 'pending' ? 'bg-[#1677FF] text-white' : 'bg-gray-100 text-gray-500'">{{ pendingShipItems.length }}</span>
              <div v-if="shipTab === 'pending'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1677FF] rounded-full"></div>
            </button>
            <button
              @click="shipTab = 'shipped'"
              :class="['py-2.5 text-sm font-bold relative transition-colors', shipTab === 'shipped' ? 'text-[#1677FF]' : 'text-gray-400']"
            >
              已发货
              <span v-if="shippedItems.length > 0" class="ml-1 text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                :class="shipTab === 'shipped' ? 'bg-[#1677FF] text-white' : 'bg-gray-100 text-gray-500'">{{ shippedItems.length }}</span>
              <div v-if="shipTab === 'shipped'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1677FF] rounded-full"></div>
            </button>
          </div>
        </div>

        <!-- 待发货 -->
        <div v-if="shipTab === 'pending'" class="p-4 space-y-3">
          <div v-if="pendingShipItems.length === 0" class="flex flex-col items-center py-16">
            <Truck class="w-10 h-10 text-gray-200 mb-2" />
            <p class="text-sm text-gray-400">暂无待发货订单</p>
          </div>
          <Card v-for="item in pendingShipItems" :key="item.id" class="p-4">
            <div class="flex items-start gap-3">
              <div class="w-14 h-14 rounded-xl bg-gray-100 shrink-0 overflow-hidden">
                <img :src="item.productImage" class="w-full h-full object-cover" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between gap-2">
                  <h3 class="text-sm font-bold text-gray-900 truncate">{{ item.productName }}</h3>
                  <div class="flex items-center gap-1 shrink-0">
                    <span v-if="item.type === 'exchange'" class="text-[9px] text-[#FF6B35] bg-[#FFF4ED] px-1.5 py-0.5 rounded-full font-bold">兑换</span>
                    <span v-else class="text-[9px] text-[#1677FF] bg-[#EBF5FF] px-1.5 py-0.5 rounded-full font-bold">活动</span>
                  </div>
                </div>
                <div class="flex items-center gap-2 mt-1 text-[10px] text-gray-400">
                  <span>{{ item.studentName }}</span>
                  <span v-if="item.deliveryMethod">·</span>
                  <span v-if="item.deliveryMethod">{{ item.deliveryMethod === 'shipped' ? '邮寄' : '线下领取' }}</span>
                  <span>·</span>
                  <span>{{ formatDate(item.date) }}</span>
                </div>
                <!-- 收件信息（邮寄类，claim和exchange通用） -->
                <div v-if="item.recipientName && item.recipientAddress && item.recipientAddress !== '线下领取'" class="mt-2 bg-gray-50 rounded-lg p-2 text-[10px] text-gray-600 leading-relaxed">
                  <div>收件人：{{ item.recipientName }} {{ item.recipientPhone }}</div>
                  <div class="mt-0.5">地址：{{ item.recipientAddress }}</div>
                  <button class="mt-1 text-[#1677FF] font-bold active:scale-95" @click="copyShippingInfo(item)">复制全部信息</button>
                </div>
                <div v-if="(!item.recipientName || !item.recipientAddress || item.recipientAddress === '线下领取') && item.deliveryMethod !== 'in-person'" class="mt-1 text-[10px] text-orange-500">
                  {{ item.type === 'exchange' ? '积分兑换商品' : '活动奖励' }} · 待补充收货信息
                </div>
                <!-- 操作按钮：根据学员选择的领取方式显示 -->
                <div class="flex gap-2 mt-3">
                  <button
                    v-if="item.deliveryMethod !== 'in-person'"
                    class="text-[11px] font-bold text-white bg-[#1677FF] px-3 py-1.5 rounded-full active:scale-95 transition-transform flex items-center gap-1"
                    @click="handleShipClick(item)"
                  >
                    <Truck class="w-3 h-3" /> 填单发货
                  </button>
                  <button
                    v-if="item.deliveryMethod === 'in-person'"
                    class="text-[11px] font-bold text-white bg-[#07C160] px-3 py-1.5 rounded-full active:scale-95 transition-transform flex items-center gap-1"
                    @click="handleInPersonClick(item)"
                  >
                    <CheckCircle2 class="w-3 h-3" /> 确认线下发放
                  </button>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <!-- 已发货 -->
        <div v-else class="p-4 space-y-3">
          <div v-if="shippedItems.length === 0" class="flex flex-col items-center py-16">
            <CheckCircle2 class="w-10 h-10 text-gray-200 mb-2" />
            <p class="text-sm text-gray-400">暂无发货记录</p>
          </div>
          <Card v-for="item in shippedItems" :key="item.id" class="p-4">
            <div class="flex items-start gap-3">
              <div class="w-14 h-14 rounded-xl bg-gray-100 shrink-0 overflow-hidden">
                <img :src="item.productImage" class="w-full h-full object-cover" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between gap-2">
                  <h3 class="text-sm font-bold text-gray-900 truncate">{{ item.productName }}</h3>
                  <div class="flex items-center gap-1 shrink-0">
                    <span v-if="item.type === 'exchange'" class="text-[9px] text-[#FF6B35] bg-[#FFF4ED] px-1.5 py-0.5 rounded-full font-bold">兑换</span>
                    <span v-else class="text-[9px] text-[#1677FF] bg-[#EBF5FF] px-1.5 py-0.5 rounded-full font-bold">活动</span>
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E8F8EE] text-[#07C160]">
                      {{ item.deliveryMethod === 'in-person' ? '线下' : '已发货' }}
                    </span>
                  </div>
                </div>
                <div class="flex items-center gap-2 mt-1 text-[10px] text-gray-400">
                  <span>{{ item.studentName }}</span>
                  <span>·</span>
                  <span>{{ formatDate(item.date) }}</span>
                </div>
                <!-- 收件信息（邮寄类） -->
                <div v-if="item.recipientName && item.recipientAddress && item.recipientAddress !== '线下领取'" class="mt-2 bg-gray-50 rounded-lg p-2 text-[10px] text-gray-600 leading-relaxed">
                  <div>收件人：{{ item.recipientName }} {{ item.recipientPhone }}</div>
                  <div class="mt-0.5">地址：{{ item.recipientAddress }}</div>
                  <button class="mt-1 text-[#1677FF] font-bold active:scale-95" @click="copyShippingInfo(item)">复制全部信息</button>
                </div>
                <div v-if="item.trackingNumber" class="mt-2 bg-green-50 rounded-lg p-2 flex items-center justify-between">
                  <div class="text-[10px] text-gray-600">
                    <span class="text-gray-400">单号：</span>
                    <span class="font-mono font-bold">{{ item.trackingNumber }}</span>
                  </div>
                  <button class="text-[10px] text-[#07C160] font-bold active:scale-95" @click="copyToClipboard(item.trackingNumber!)">复制</button>
                </div>
                <div v-if="item.deliveryMethod === 'in-person' && item.deliveredAt" class="mt-2 text-[10px] text-gray-500">
                  线下发放于 {{ formatDate(item.deliveredAt) }}
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <!-- ═══ 兑换记录（纯查看） ═══ -->
      <div v-if="activeModule === 'exchange'" class="p-4 space-y-3">
        <div v-if="allExchanges.length === 0" class="flex flex-col items-center py-16">
          <Coins class="w-10 h-10 text-gray-200 mb-2" />
          <p class="text-sm text-gray-400">暂无兑换记录</p>
        </div>
        <Card v-for="record in allExchanges" :key="record.id" class="p-3">
          <div class="flex items-start gap-3">
            <div class="w-12 h-12 rounded-lg bg-gray-100 shrink-0 overflow-hidden">
              <img :src="record.productImage" :alt="record.productName" class="w-full h-full object-cover" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2">
                <h4 class="text-sm font-bold text-gray-900 truncate">{{ record.productName }}</h4>
                <span class="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full" :class="EXCHANGE_STATUS[record.status]?.bg, EXCHANGE_STATUS[record.status]?.color">
                  {{ EXCHANGE_STATUS[record.status]?.label }}
                </span>
              </div>
              <div class="flex items-center gap-2 mt-1 text-[10px] text-gray-400">
                <span>{{ record.studentName }}</span>
                <span>·</span>
                <span class="text-[#FF6B35] font-bold">-{{ record.pointsSpent }} 积分</span>
                <span>·</span>
                <span>{{ formatDate(record.exchangeDate) }}</span>
              </div>
              <div v-if="record.trackingNumber" class="mt-2 bg-green-50 rounded-lg p-2 flex items-center justify-between">
                <div class="text-[10px] text-gray-600">
                  <span class="text-gray-400">单号：</span>
                  <span class="font-mono font-bold">{{ record.trackingNumber }}</span>
                </div>
                <button class="text-[10px] text-[#07C160] font-bold active:scale-95" @click="copyToClipboard(record.trackingNumber!)">复制</button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>

    <!-- 审核弹窗 -->
    <VanPopup v-model:show="showAuditModal" position="bottom" round>
      <div class="p-5" v-if="auditTarget">
        <h3 class="text-lg font-bold text-gray-900 mb-1">审核确认</h3>
        <p class="text-xs text-gray-500 mb-4">{{ auditTarget.studentName }} · {{ auditTarget.activityLabel }}</p>
        <div v-if="availableTiers.length === 0" class="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-700">
          该活动类型暂无可用奖品（库存为0或未配置），请在奖励配置中添加。
        </div>
        <div v-else class="space-y-2 mb-4">
          <label class="text-sm font-medium text-gray-700 block mb-1">选择奖品 <span class="text-red-500">*</span></label>
          <button
            v-for="tier in availableTiers" :key="tier.id"
            :class="['w-full flex items-center gap-3 p-3 rounded-xl border transition-colors text-left',
              selectedTierId === tier.id ? 'border-[#FF976A] bg-orange-50' : 'border-gray-200 bg-white active:bg-gray-50']"
            @click="selectedTierId = tier.id; auditError = ''"
          >
            <div class="w-10 h-10 rounded-lg bg-gray-100 shrink-0 overflow-hidden">
              <img :src="tier.imageUrl" class="w-full h-full object-cover" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-bold text-gray-900 truncate">{{ tier.name }}</div>
              <div class="text-[10px] text-gray-400">库存 {{ tier.stock }} 件</div>
            </div>
            <div v-if="selectedTierId === tier.id" class="w-5 h-5 rounded-full bg-[#FF976A] flex items-center justify-center shrink-0">
              <CheckCircle2 class="w-3 h-3 text-white" />
            </div>
          </button>
        </div>
        <div v-if="auditError" class="text-red-500 text-xs font-medium text-center mb-3">{{ auditError }}</div>
        <div class="flex gap-3">
          <button class="flex-1 py-3 rounded-xl bg-gray-100 text-gray-600 font-bold active:scale-95 transition-transform" @click="showAuditModal = false">取消</button>
          <button :disabled="availableTiers.length === 0" :class="['flex-1 py-3 rounded-xl font-bold transition-transform', availableTiers.length === 0 ? 'bg-gray-200 text-gray-400' : 'bg-[#FF976A] text-white active:scale-95']" @click="submitAudit">确认审核</button>
        </div>
      </div>
    </VanPopup>

    <!-- 发货弹窗 -->
    <VanPopup v-model:show="showShipModal" position="bottom" round>
      <div class="p-5" v-if="shipTarget">
        <h3 class="text-lg font-bold text-gray-900 mb-4">填写快递单号</h3>
        <div class="mb-4">
          <div class="text-xs text-gray-500 mb-1">商品</div>
          <div class="text-sm font-bold text-gray-900">{{ shipTarget.productName }}</div>
          <div class="text-xs text-gray-500 mt-1">学员：{{ shipTarget.studentName }}</div>
          <div v-if="shipTarget.recipientName" class="text-xs text-gray-500 mt-1">
            收件人：{{ shipTarget.recipientName }} {{ shipTarget.recipientPhone }}
          </div>
          <div v-if="shipTarget.recipientAddress" class="text-xs text-gray-500">
            地址：{{ shipTarget.recipientAddress }}
          </div>
        </div>
        <div class="mb-4">
          <label class="text-sm font-medium text-gray-700 block mb-1">快递单号 <span class="text-red-500">*</span></label>
          <input type="text" placeholder="请输入快递单号" v-model="trackingNumber"
            class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#1677FF] text-sm"
            @input="shipError = ''" />
          <div v-if="shipError" class="text-red-500 text-xs mt-1">{{ shipError }}</div>
        </div>
        <div class="flex gap-3">
          <button class="flex-1 py-3 rounded-xl bg-gray-100 text-gray-600 font-bold active:scale-95 transition-transform" @click="showShipModal = false">取消</button>
          <button class="flex-1 py-3 rounded-xl bg-[#1677FF] text-white font-bold active:scale-95 transition-transform" @click="submitShipping">确认发货</button>
        </div>
      </div>
    </VanPopup>

    <!-- 线下发放确认 -->
    <VanPopup v-model:show="showInPersonModal" position="bottom" round>
      <div class="p-5" v-if="shipTarget">
        <h3 class="text-lg font-bold text-gray-900 mb-4">确认线下发放</h3>
        <div class="bg-gray-50 rounded-xl p-3 mb-4">
          <div class="text-sm font-bold text-gray-900">{{ shipTarget.productName }}</div>
          <div class="text-xs text-gray-500 mt-1">学员：{{ shipTarget.studentName }}</div>
        </div>
        <p class="text-xs text-gray-400 mb-4">确认后将在发货记录中显示为"线下发放"</p>
        <div class="flex gap-3">
          <button class="flex-1 py-3 rounded-xl bg-gray-100 text-gray-600 font-bold active:scale-95 transition-transform" @click="showInPersonModal = false">取消</button>
          <button class="flex-1 py-3 rounded-xl bg-[#07C160] text-white font-bold active:scale-95 transition-transform" @click="submitInPerson">确认发放</button>
        </div>
      </div>
    </VanPopup>
  </div>
</template>
