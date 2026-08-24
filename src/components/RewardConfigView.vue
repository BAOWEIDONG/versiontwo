<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAppStore } from '../store/app';
import { NavBar, Card } from './ui';
import { Popup as VanPopup, showToast, showConfirmDialog } from 'vant';
import { Plus, Trash2, Edit3, Camera, AlertTriangle, Gift, Zap, ChevronDown, Coins, Package, Clock, CheckCircle, XCircle } from 'lucide-vue-next';
import { uploadFile } from '../lib/api';
import type { RewardTier, PointProduct, PointExchangeRecord } from '../types';

const store = useAppStore();

// ─── 营期切换 ───
const selectedCampId = ref<string>(store.camps[0]?.id || '');
const showCampPicker = ref(false);
const selectedCamp = computed(() => store.camps.find((c) => c.id === selectedCampId.value));

// 按营期过滤奖励层级和领取记录
const campRewardTiers = computed(() => store.getCampRewardTiers(selectedCampId.value));
const campRewardClaims = computed(() => store.getCampRewardClaims(selectedCampId.value));

const showEditModal = ref(false);
const editingTier = ref<Partial<RewardTier> | null>(null);
const formError = ref('');
const photoInputRef = ref<HTMLInputElement | null>(null);

const getClaimCount = (tierId: string) => campRewardClaims.value.filter(c => c.tierId === tierId).length;

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  milestone: '阶梯达标奖',
  weekly: '每周主题挑战',
  lucky: '全勤幸运抽奖',
};

const handleEdit = (tier?: RewardTier, source: 'streak' | 'activity' = 'streak') => {
  editingTier.value = tier
    ? { ...tier }
    : { name: '', requiredDays: source === 'streak' ? 1 : 0, imageUrl: '', stock: 10, source, activityType: source === 'activity' ? 'milestone' : undefined, deliveryMethods: ['shipped', 'in-person'], campId: selectedCampId.value };
  formError.value = '';
  showEditModal.value = true;
};

const handlePhotoSelect = async (e: Event) => {
  const files = (e.target as HTMLInputElement).files;
  if (!files || files.length === 0) return;
  const url = await uploadFile(files[0]);
  if (editingTier.value) editingTier.value.imageUrl = url;
  (e.target as HTMLInputElement).value = '';
};

const handleDelete = (id: string) => {
  const claimCount = getClaimCount(id);
  if (claimCount > 0) {
    showToast(`该奖励已有 ${claimCount} 名学员领取，无法删除`);
    return;
  }
  showConfirmDialog({ title: '提示', message: '确定删除此奖励？' }).then(() => store.deleteRewardTier(id));
};

const toggleDeliveryMethod = (method: 'shipped' | 'in-person') => {
  if (!editingTier.value) return;
  const methods = editingTier.value.deliveryMethods || [];
  if (methods.includes(method)) {
    editingTier.value.deliveryMethods = methods.filter(m => m !== method);
  } else {
    editingTier.value.deliveryMethods = [...methods, method];
  }
  formError.value = '';
};

const DELIVERY_LABELS: Record<string, string> = {
  shipped: '邮寄',
  'in-person': '线下领取',
};

const saveTier = () => {
  if (!editingTier.value) return;
  if (!editingTier.value.name?.trim()) { formError.value = '请输入礼品名称'; return; }
  if (!editingTier.value.imageUrl) { formError.value = '请上传礼品图片'; return; }
  if (editingTier.value.stock === undefined || editingTier.value.stock < 0) { formError.value = '请输入有效的库存'; return; }
  if (!editingTier.value.deliveryMethods || editingTier.value.deliveryMethods.length === 0) { formError.value = '请至少选择一种领取方式'; return; }

  const isStreak = editingTier.value.source !== 'activity';
  if (isStreak) {
    if (!editingTier.value.requiredDays || editingTier.value.requiredDays <= 0) { formError.value = '请输入有效的天数'; return; }
    const dup = campRewardTiers.value.find(t => t.source !== 'activity' && t.requiredDays === editingTier.value!.requiredDays && t.id !== editingTier.value!.id);
    if (dup) { formError.value = `已存在连续打卡 ${editingTier.value.requiredDays} 天的奖励（${dup.name}），请设置不同天数`; return; }
  }

  if (editingTier.value.id) {
    store.updateRewardTier(editingTier.value.id, editingTier.value);
  } else {
    store.addRewardTier({
      id: `t_${Date.now()}`,
      name: editingTier.value.name.trim(),
      requiredDays: isStreak ? editingTier.value.requiredDays! : 0,
      imageUrl: editingTier.value.imageUrl,
      stock: editingTier.value.stock,
      source: editingTier.value.source || (isStreak ? 'streak' : 'activity'),
      activityType: !isStreak ? editingTier.value.activityType : undefined,
      description: editingTier.value.description,
      deliveryMethods: editingTier.value.deliveryMethods,
      campId: selectedCampId.value,
    });
  }
  showEditModal.value = false;
};

const streakTiers = computed(() =>
  [...campRewardTiers.value.filter(t => t.source !== 'activity')]
    .sort((a, b) => a.requiredDays - b.requiredDays)
);
const activityTiers = computed(() =>
  campRewardTiers.value.filter(t => t.source === 'activity')
);

// ─── 积分商城商品管理 ───
const allMallProducts = computed(() => store.pointProducts);
const allExchanges = computed(() =>
  [...store.pointExchanges].sort((a, b) => b.exchangeDate.localeCompare(a.exchangeDate))
);

const showProductModal = ref(false);
const editingProduct = ref<Partial<PointProduct> | null>(null);
const productFormError = ref('');
const productPhotoInputRef = ref<HTMLInputElement | null>(null);

const handleProductPhotoSelect = async (e: Event) => {
  const files = (e.target as HTMLInputElement).files;
  if (!files || files.length === 0) return;
  const url = await uploadFile(files[0]);
  if (editingProduct.value) editingProduct.value.imageUrl = url;
  (e.target as HTMLInputElement).value = '';
};

const handleEditProduct = (product?: PointProduct) => {
  editingProduct.value = product
    ? { ...product }
    : { name: '', imageUrl: '', description: '', pointsRequired: 100, stock: 50, active: true, deliveryOptions: ['shipped', 'in-person'] };
  productFormError.value = '';
  showProductModal.value = true;
};

const handleDeleteProduct = (id: string) => {
  const hasExchanges = allExchanges.value.some(e => e.productId === id && e.status !== 'cancelled');
  if (hasExchanges) {
    showToast('该商品已有兑换记录，无法删除');
    return;
  }
  showConfirmDialog({ title: '提示', message: '确定删除此商品？' }).then(() => store.deletePointProduct(id));
};

const saveProduct = () => {
  if (!editingProduct.value) return;
  if (!editingProduct.value.name?.trim()) { productFormError.value = '请输入商品名称'; return; }
  if (!editingProduct.value.imageUrl) { productFormError.value = '请上传商品图片'; return; }
  if (!editingProduct.value.pointsRequired || editingProduct.value.pointsRequired <= 0) { productFormError.value = '请输入有效的积分'; return; }
  if (editingProduct.value.stock === undefined || editingProduct.value.stock < 0) { productFormError.value = '请输入有效的库存'; return; }

  if (editingProduct.value.id) {
    store.updatePointProduct(editingProduct.value.id, editingProduct.value);
  } else {
    store.addPointProduct({
      id: `pp_${Date.now()}`,
      name: editingProduct.value.name.trim(),
      imageUrl: editingProduct.value.imageUrl,
      description: editingProduct.value.description || '',
      pointsRequired: editingProduct.value.pointsRequired,
      stock: editingProduct.value.stock,
      active: true,
      deliveryOptions: editingProduct.value.deliveryOptions || ['shipped', 'in-person'],
    });
  }
  showProductModal.value = false;
};

const toggleProductActive = (product: PointProduct) => {
  store.updatePointProduct(product.id, { active: !product.active });
};

function toggleDeliveryOption(option: 'shipped' | 'in-person') {
  if (!editingProduct.value) return;
  const current = editingProduct.value.deliveryOptions || [];
  if (current.includes(option)) {
    // 至少保留一个
    if (current.length > 1) {
      editingProduct.value.deliveryOptions = current.filter(o => o !== option);
    }
  } else {
    editingProduct.value.deliveryOptions = [...current, option];
  }
}

// 兑换记录状态管理
const EXCHANGE_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: '待发放', color: '#FF976A', bg: '#FFF4ED' },
  fulfilled: { label: '已发放', color: '#07C160', bg: '#E8F8EE' },
  cancelled: { label: '已取消', color: '#969799', bg: '#F2F3F5' },
};

const handleExchangeStatus = (id: string, status: PointExchangeRecord['status']) => {
  store.updateExchangeStatus(id, status);
  showToast(status === 'fulfilled' ? '已标记为发放' : status === 'cancelled' ? '已取消兑换' : '已更新状态');
};

function formatExchangeDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
</script>

<template>
  <div class="flex min-h-full flex-col bg-[#F7F8FA] relative">
    <NavBar title="奖励配置" :on-back="store.goBack" />

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

    <div class="flex-1 p-4 space-y-6 pb-24">
      <!-- 打卡奖励 -->
      <div>
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-bold text-gray-900 flex items-center gap-1.5">
            <div class="w-1.5 h-4 bg-[#1677FF] rounded-full"></div>
            连续打卡奖励
          </h3>
          <button @click="handleEdit(undefined, 'streak')" class="text-xs font-bold text-[#1677FF] flex items-center gap-0.5">
            <Plus class="w-3.5 h-3.5" /> 添加
          </button>
        </div>
        <div v-if="streakTiers.length === 0" class="text-center py-8 text-gray-400 text-xs bg-white rounded-xl border border-gray-100">暂无打卡奖励，请添加</div>
        <div class="space-y-3">
          <Card v-for="tier in streakTiers" :key="tier.id" class="p-4 flex gap-4">
            <div class="w-20 h-20 rounded-xl bg-gray-100 shrink-0 overflow-hidden border border-gray-50 cursor-pointer" @click="store.openImagePreview([tier.imageUrl], 0)">
              <img :src="tier.imageUrl" :alt="tier.name" class="w-full h-full object-cover" />
            </div>
            <div class="flex-1 flex flex-col justify-between min-w-0">
              <div>
                <div class="flex justify-between items-start">
                  <h3 class="font-bold text-gray-900 text-base truncate pr-2">{{ tier.name }}</h3>
                  <div class="flex gap-2 shrink-0">
                    <button @click="handleEdit(tier)" class="text-blue-500 p-1"><Edit3 class="w-4 h-4" /></button>
                    <button @click="handleDelete(tier.id)" :class="['p-1', getClaimCount(tier.id) > 0 ? 'text-gray-300 cursor-not-allowed' : 'text-red-500']"><Trash2 class="w-4 h-4" /></button>
                  </div>
                </div>
                <div class="text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded inline-block mt-1">连续打卡 {{ tier.requiredDays }} 天</div>
                <div class="flex flex-wrap gap-1 mt-1">
                  <span v-for="m in (tier.deliveryMethods || ['shipped'])" :key="m" class="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{{ DELIVERY_LABELS[m] }}</span>
                </div>
                <div v-if="getClaimCount(tier.id) > 0" class="text-[10px] text-gray-500 mt-1">已有 {{ getClaimCount(tier.id) }} 人领取</div>
              </div>
              <div class="text-xs text-gray-500 font-medium">库存: <span :class="tier.stock > 0 ? 'text-gray-900' : 'text-red-500'">{{ tier.stock }}</span> 件</div>
            </div>
          </Card>
        </div>
      </div>

      <!-- 趣味活动奖品 -->
      <div>
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-bold text-gray-900 flex items-center gap-1.5">
            <div class="w-1.5 h-4 bg-[#FF976A] rounded-full"></div>
            趣味活动奖品
          </h3>
          <button @click="handleEdit(undefined, 'activity')" class="text-xs font-bold text-[#FF976A] flex items-center gap-0.5">
            <Plus class="w-3.5 h-3.5" /> 添加
          </button>
        </div>
        <div v-if="activityTiers.length === 0" class="text-center py-8 text-gray-400 text-xs bg-white rounded-xl border border-gray-100">暂无活动奖品，请添加</div>
        <div class="space-y-3">
          <Card v-for="tier in activityTiers" :key="tier.id" class="p-4 flex gap-4">
            <div class="w-20 h-20 rounded-xl bg-gray-100 shrink-0 overflow-hidden border border-gray-50 cursor-pointer" @click="store.openImagePreview([tier.imageUrl], 0)">
              <img :src="tier.imageUrl" :alt="tier.name" class="w-full h-full object-cover" />
            </div>
            <div class="flex-1 flex flex-col justify-between min-w-0">
              <div>
                <div class="flex justify-between items-start">
                  <h3 class="font-bold text-gray-900 text-base truncate pr-2">{{ tier.name }}</h3>
                  <div class="flex gap-2 shrink-0">
                    <button @click="handleEdit(tier)" class="text-blue-500 p-1"><Edit3 class="w-4 h-4" /></button>
                    <button @click="handleDelete(tier.id)" :class="['p-1', getClaimCount(tier.id) > 0 ? 'text-gray-300 cursor-not-allowed' : 'text-red-500']"><Trash2 class="w-4 h-4" /></button>
                  </div>
                </div>
                <div class="flex items-center gap-1.5 mt-1">
                  <span class="text-xs text-[#FF976A] bg-orange-50 px-2 py-0.5 rounded">{{ ACTIVITY_TYPE_LABELS[tier.activityType || ''] || '活动奖品' }}</span>
                </div>
                <div v-if="tier.description" class="text-[10px] text-gray-500 mt-1">{{ tier.description }}</div>
                <div class="flex flex-wrap gap-1 mt-1">
                  <span v-for="m in (tier.deliveryMethods || ['shipped'])" :key="m" class="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{{ DELIVERY_LABELS[m] }}</span>
                </div>
                <div v-if="getClaimCount(tier.id) > 0" class="text-[10px] text-gray-500 mt-1">已有 {{ getClaimCount(tier.id) }} 人领取</div>
              </div>
              <div class="text-xs text-gray-500 font-medium">库存: <span :class="tier.stock > 0 ? 'text-gray-900' : 'text-red-500'">{{ tier.stock }}</span> 件</div>
            </div>
          </Card>
        </div>
      </div>

      <!-- 积分商城商品（全局，不按营期过滤） -->
      <div>
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-bold text-gray-900 flex items-center gap-1.5">
            <div class="w-1.5 h-4 bg-[#FF976A] rounded-full"></div>
            积分商城商品
          </h3>
          <button @click="handleEditProduct()" class="text-xs font-bold text-[#FF976A] flex items-center gap-0.5">
            <Plus class="w-3.5 h-3.5" /> 添加
          </button>
        </div>
        <p class="text-[10px] text-gray-400 mb-3">商城商品为全局配置，所有营期共用。学员通过打卡累积积分兑换。</p>
        <div v-if="allMallProducts.length === 0" class="text-center py-8 text-gray-400 text-xs bg-white rounded-xl border border-gray-100">暂无商品，请添加</div>
        <div class="space-y-3">
          <Card v-for="product in allMallProducts" :key="product.id" class="p-4 flex gap-4">
            <div class="w-20 h-20 rounded-xl bg-gray-100 shrink-0 overflow-hidden border border-gray-50 cursor-pointer" @click="store.openImagePreview([product.imageUrl], 0)">
              <img :src="product.imageUrl" :alt="product.name" class="w-full h-full object-cover" />
            </div>
            <div class="flex-1 flex flex-col justify-between min-w-0">
              <div>
                <div class="flex justify-between items-start">
                  <h3 class="font-bold text-gray-900 text-base truncate pr-2">{{ product.name }}</h3>
                  <div class="flex gap-2 shrink-0">
                    <button @click="handleEditProduct(product)" class="text-blue-500 p-1"><Edit3 class="w-4 h-4" /></button>
                    <button @click="handleDeleteProduct(product.id)" :class="['p-1', allExchanges.some(e => e.productId === product.id && e.status !== 'cancelled') ? 'text-gray-300 cursor-not-allowed' : 'text-red-500']"><Trash2 class="w-4 h-4" /></button>
                  </div>
                </div>
                <div class="flex items-center gap-1 mt-1">
                  <Coins class="w-3.5 h-3.5 text-[#FF976A]" />
                  <span class="text-xs font-black text-[#FF6B35]">{{ product.pointsRequired }}</span>
                  <span class="text-[10px] text-gray-400">积分</span>
                </div>
                <div v-if="product.description" class="text-[10px] text-gray-500 mt-1 truncate">{{ product.description }}</div>
              </div>
              <div class="flex items-center justify-between">
                <div class="text-xs text-gray-500 font-medium">库存: <span :class="product.stock > 0 ? 'text-gray-900' : 'text-red-500'">{{ product.stock }}</span> 件</div>
                <button
                  :class="['text-[10px] px-2 py-0.5 rounded-full font-bold', product.active ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400']"
                  @click="toggleProductActive(product)"
                >{{ product.active ? '上架中' : '已下架' }}</button>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <!-- 兑换记录入口 -->
      <div>
        <button class="w-full flex items-center justify-between bg-white rounded-2xl border border-gray-100 p-4 active:bg-gray-50 transition-colors" @click="store.setCurrentView('fulfillment-center')">
          <div class="flex items-center gap-2">
            <div class="w-1.5 h-4 bg-[#07C160] rounded-full"></div>
            <div class="text-left">
              <div class="text-sm font-bold text-gray-900">兑换记录与发货管理</div>
              <div class="text-[10px] text-gray-400">查看兑换记录、奖励发货、发放记录</div>
            </div>
          </div>
          <ChevronRight class="w-5 h-5 text-gray-300" />
        </button>
      </div>
    </div>

    <!-- Edit popup -->
    <VanPopup v-model:show="showEditModal" position="bottom" round :style="{ maxHeight: '90%' }">
      <div class="p-5" v-if="editingTier">
        <h3 class="text-lg font-bold text-gray-900 mb-5">{{ editingTier.id ? '编辑奖励' : '新增奖励' }}</h3>
        <!-- 已有领取记录警告 -->
        <div v-if="editingTier.id && getClaimCount(editingTier.id) > 0" class="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
          <AlertTriangle class="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div class="text-xs text-amber-700">
            <div class="font-bold mb-0.5">该奖励已有 {{ getClaimCount(editingTier.id) }} 人领取</div>
            <div>修改会影响学员的进度计算，请谨慎操作。礼品名称和库存可安全修改。</div>
          </div>
        </div>
        <div class="space-y-4 mb-6">
          <!-- 奖品来源 -->
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-2">奖品来源</label>
            <div class="flex gap-2">
              <button
                :class="['flex-1 py-2 rounded-lg text-xs font-bold border transition-colors', editingTier.source !== 'activity' ? 'border-[#1677FF] bg-[#1677FF]/5 text-[#1677FF]' : 'border-gray-200 text-gray-500']"
                @click="editingTier.source = 'streak'; editingTier.activityType = undefined; editingTier.requiredDays = editingTier.requiredDays || 1"
              >
                <Gift class="w-4 h-4 inline mr-1" />连续打卡
              </button>
              <button
                :class="['flex-1 py-2 rounded-lg text-xs font-bold border transition-colors', editingTier.source === 'activity' ? 'border-[#FF976A] bg-[#FF976A]/5 text-[#FF976A]' : 'border-gray-200 text-gray-500']"
                @click="editingTier.source = 'activity'; editingTier.activityType = editingTier.activityType || 'milestone'; editingTier.requiredDays = 0"
              >
                <Zap class="w-4 h-4 inline mr-1" />趣味活动
              </button>
            </div>
          </div>

          <!-- 活动类型（source=activity 时） -->
          <div v-if="editingTier.source === 'activity'">
            <label class="text-sm font-medium text-gray-700 block mb-2">活动类型</label>
            <div class="flex gap-2">
              <button
                v-for="(label, key) in ACTIVITY_TYPE_LABELS"
                :key="key"
                :class="['flex-1 py-2 rounded-lg text-[10px] font-bold border transition-colors', editingTier.activityType === key ? 'border-[#FF976A] bg-[#FF976A]/5 text-[#FF976A]' : 'border-gray-200 text-gray-500']"
                @click="editingTier.activityType = key as any"
              >{{ label }}</button>
            </div>
          </div>

          <div>
            <label class="text-sm font-medium text-gray-700 block mb-2">礼品图片 <span class="text-red-500">*</span></label>
            <input ref="photoInputRef" type="file" accept="image/*" class="hidden" @change="handlePhotoSelect" />
            <div class="w-24 h-24 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-100 overflow-hidden" @click="photoInputRef?.click()">
              <img v-if="editingTier.imageUrl" :src="editingTier.imageUrl" class="w-full h-full object-cover" />
              <template v-else><Camera class="w-6 h-6 text-gray-400 mb-1" /><span class="text-[10px] text-gray-400">上传图片</span></template>
            </div>
          </div>
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-1">礼品名称 <span class="text-red-500">*</span></label>
            <input type="text" placeholder="如：运动水杯" class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#1677FF] text-sm" v-model="editingTier.name" @input="formError = ''" />
          </div>
          <div v-if="editingTier.source !== 'activity'">
            <label class="text-sm font-medium text-gray-700 block mb-1">解锁条件 (连续打卡天数) <span class="text-red-500">*</span></label>
            <input type="number" inputmode="numeric" placeholder="如：10" min="1" class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#1677FF] text-sm" :value="editingTier.requiredDays" @input="editingTier.requiredDays = parseInt(($event.target as HTMLInputElement).value) || 0; formError = ''" />
          </div>
          <div v-if="editingTier.source === 'activity'">
            <label class="text-sm font-medium text-gray-700 block mb-1">发放说明</label>
            <input type="text" placeholder="如：减重达 3% 发放" class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF976A] text-sm" v-model="editingTier.description" />
          </div>
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-1">库存数量 <span class="text-red-500">*</span></label>
            <input type="number" inputmode="numeric" placeholder="如：50" min="0" class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#1677FF] text-sm" :value="editingTier.stock" @input="editingTier.stock = parseInt(($event.target as HTMLInputElement).value) || 0; formError = ''" />
          </div>
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-2">领取方式 <span class="text-red-500">*</span></label>
            <p class="text-[10px] text-gray-400 mb-2">学员领取时从中选择，可多选</p>
            <div class="flex gap-2">
              <button
                :class="['flex-1 py-2.5 rounded-lg text-xs font-bold border transition-colors', editingTier.deliveryMethods?.includes('shipped') ? 'border-[#1677FF] bg-[#1677FF]/5 text-[#1677FF]' : 'border-gray-200 text-gray-500']"
                @click="toggleDeliveryMethod('shipped')"
              >邮寄</button>
              <button
                :class="['flex-1 py-2.5 rounded-lg text-xs font-bold border transition-colors', editingTier.deliveryMethods?.includes('in-person') ? 'border-[#FF976A] bg-[#FF976A]/5 text-[#FF976A]' : 'border-gray-200 text-gray-500']"
                @click="toggleDeliveryMethod('in-person')"
              >线下领取</button>
            </div>
          </div>
          <div v-if="formError" class="text-red-500 text-xs font-medium text-center">{{ formError }}</div>
        </div>
        <button class="w-full py-3 rounded-xl bg-[#1677FF] text-white font-bold" @click="saveTier">保存配置</button>
      </div>
    </VanPopup>

    <!-- 商品编辑弹窗 -->
    <VanPopup v-model:show="showProductModal" position="bottom" round :style="{ maxHeight: '90%' }">
      <div class="p-5" v-if="editingProduct">
        <h3 class="text-lg font-bold text-gray-900 mb-5">{{ editingProduct.id ? '编辑商品' : '新增商品' }}</h3>
        <div class="space-y-4 mb-6">
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-2">商品图片 <span class="text-red-500">*</span></label>
            <input ref="productPhotoInputRef" type="file" accept="image/*" class="hidden" @change="handleProductPhotoSelect" />
            <div class="w-24 h-24 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-100 overflow-hidden" @click="productPhotoInputRef?.click()">
              <img v-if="editingProduct.imageUrl" :src="editingProduct.imageUrl" class="w-full h-full object-cover" />
              <template v-else><Camera class="w-6 h-6 text-gray-400 mb-1" /><span class="text-[10px] text-gray-400">上传图片</span></template>
            </div>
          </div>
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-1">商品名称 <span class="text-red-500">*</span></label>
            <input type="text" placeholder="如：运动水杯" class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF976A] text-sm" v-model="editingProduct.name" @input="productFormError = ''" />
          </div>
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-1">商品描述</label>
            <textarea placeholder="简要描述商品特点" rows="2" class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF976A] text-sm resize-none" v-model="editingProduct.description"></textarea>
          </div>
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-1">所需积分 <span class="text-red-500">*</span></label>
            <input type="number" inputmode="numeric" placeholder="如：200" min="1" class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF976A] text-sm" :value="editingProduct.pointsRequired" @input="editingProduct.pointsRequired = parseInt(($event.target as HTMLInputElement).value) || 0; productFormError = ''" />
          </div>
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-1">库存数量 <span class="text-red-500">*</span></label>
            <input type="number" inputmode="numeric" placeholder="如：50" min="0" class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF976A] text-sm" :value="editingProduct.stock" @input="editingProduct.stock = parseInt(($event.target as HTMLInputElement).value) || 0; productFormError = ''" />
          </div>
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-2">配送方式</label>
            <div class="flex gap-2">
              <button
                @click="toggleDeliveryOption('shipped')"
                :class="['flex-1 py-2 rounded-lg text-xs font-bold border transition-colors',
                  editingProduct.deliveryOptions?.includes('shipped') ? 'border-[#FF976A] bg-orange-50 text-[#FF976A]' : 'border-gray-200 text-gray-400']"
              >邮寄</button>
              <button
                @click="toggleDeliveryOption('in-person')"
                :class="['flex-1 py-2 rounded-lg text-xs font-bold border transition-colors',
                  editingProduct.deliveryOptions?.includes('in-person') ? 'border-[#07C160] bg-green-50 text-[#07C160]' : 'border-gray-200 text-gray-400']"
              >线下领取</button>
            </div>
          </div>
          <div v-if="productFormError" class="text-red-500 text-xs font-medium text-center">{{ productFormError }}</div>
        </div>
        <div class="flex gap-3">
          <button class="flex-1 py-3 rounded-xl bg-gray-100 text-gray-600 font-bold active:scale-95 transition-transform" @click="showProductModal = false">取消</button>
          <button class="flex-1 py-3 rounded-xl bg-[#FF976A] text-white font-bold active:scale-95 transition-transform" @click="saveProduct">保存</button>
        </div>
      </div>
    </VanPopup>

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
            <span class="font-medium">{{ camp.name }}</span>
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
