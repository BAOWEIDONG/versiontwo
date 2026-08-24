import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { showImagePreview } from 'vant';
import type { User, WeightRecord, ExerciseRecord, DietRecord, CoachActivityRecord, RewardTier, RewardClaim, MealTimeConfig, MetricConfig, Camp, Account, PointProduct, PointExchangeRecord, ManualScoreRecord } from '../types';
import {
  MOCK_REWARD_TIERS,
  MOCK_REWARD_CLAIMS,
  DEFAULT_MEAL_TIME_CONFIG,
  MOCK_DIET_RECORDS,
  MOCK_WEIGHT_RECORDS,
  MOCK_EXERCISE_RECORDS,
  MOCK_COACH_ACTIVITIES,
  DEFAULT_METRIC_CONFIGS,
  MOCK_STUDENTS,
  MOCK_CAMPS,
  MOCK_ACCOUNTS,
  MOCK_POINT_PRODUCTS,
  MOCK_POINT_EXCHANGES,
  MOCK_MANUAL_SCORES,
} from '../mock/data';
import * as api from '../lib/api';
import { calculateTotalScore } from '../lib/scoring';
import { latestOrFirstId } from '../lib/camps';

/** 生成 yyyy-MM-dd HH:mm:ss 格式的当前时间字符串（全站统一格式） */
function formatDateTimeStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export type View =
  | 'login'
  | 'register'
  | 'questionnaire'
  | 'dashboard'
  | 'upload'
  | 'health-profile'
  | 'exercise'
  | 'diet'
  | 'weight-checkin'
  | 'calendar'
  | 'coach-dashboard'
  | 'coach-student-detail'
  | 'activity-upload'
  | 'dietitian-dashboard'
  | 'dietitian-student-detail'
  | 'dietitian-unannotated-list'
  | 'activities-list'
  | 'video-player'
  | 'camp-summary'
  | 'camp-report'
  | 'enterprise-report'
  | 'camp-activities'
  | 'personal-journey'
  | 'ranking'
  | 'pointsDetail'
  | 'reward'
  | 'reward-config'
  | 'meal-time-config'
  | 'metric-config'
  | 'activity-admin'
  | 'messages'
  | 'account-manage'
  | 'dietitian-config'
  | 'activity-hub'
  | 'points-mall'
  | 'fulfillment-center'
  | 'my-rewards';

/** 趣味活动配置（营养师端可切换开关；学员端按此展示） */
export interface ActivityConfig {
  /** 阶梯达标奖 */
  weightMilestone: boolean;
  /** 每周主题挑战 */
  weeklyChallenge: boolean;
  /** 全勤幸运抽奖 */
  luckyDraw: boolean;
  /** 积分商城开关 */
  pointsMall: boolean;
  /** 连续打卡奖励开关（学员端首页「连续打卡」活动入口按此显示） */
  checkinStreak: boolean;
  /** 每周挑战独立配置：开始日期（不填则用营期开营日） */
  weeklyChallengeStartDate?: string;
  /** 每周挑战独立配置：总周数（默认4周） */
  weeklyChallengeWeeks?: number;
}

export const useAppStore = defineStore('app', () => {
  const user = ref<User | null>(null);
  /** 营养师写给学员的结营寄语 { [`${campId}_${studentId}`]: text } */
  const campMessages = ref<Record<string, string>>({
    'camp1_s1': '坚持下来很不容易，你的自律大家都看在眼里。这段时间养成的饮食和运动习惯是最好的收获，继续保持，健康是一辈子的事！',
  });

  /** 趣味活动开关（按营期独立配置，营养师端配置，学员端按此展示） */
  /** 每周挑战默认关闭：需营养师先设置开始日期，再手动开启 */
  const activityConfigByCamp = ref<Record<string, ActivityConfig>>({
    camp1: { weightMilestone: true, weeklyChallenge: false, luckyDraw: true, pointsMall: true, checkinStreak: true, weeklyChallengeWeeks: 4 },
    camp2: { weightMilestone: true, weeklyChallenge: false, luckyDraw: true, pointsMall: true, checkinStreak: true, weeklyChallengeWeeks: 4 },
    camp3: { weightMilestone: false, weeklyChallenge: false, luckyDraw: false, pointsMall: false, checkinStreak: false, weeklyChallengeWeeks: 4 },
  });

  /** 获取指定营期的活动配置（无配置时返回全关默认值） */
  function getActivityConfig(campId: string | null | undefined): ActivityConfig {
    if (!campId) return { weightMilestone: false, weeklyChallenge: false, luckyDraw: false, pointsMall: false, checkinStreak: false, weeklyChallengeWeeks: 4 };
    return activityConfigByCamp.value[campId] || { weightMilestone: false, weeklyChallenge: false, luckyDraw: false, pointsMall: false, checkinStreak: false, weeklyChallengeWeeks: 4 };
  }

  /** 该营期是否有「实际可见」的活动（判定口径与学员端活动页空态完全一致）：
   *  积分商城开启，或 连续打卡奖励开启且存在对应奖品档(streak tier)，任一即算有活动。
   *  决定学员端底部菜单是否显示「活动」tab：无活动则隐藏，仅留 首页/消息/档案（三等分）。 */
  function getHasActivity(campId: string | null | undefined): boolean {
    const cfg = getActivityConfig(campId);
    if (cfg.pointsMall) return true;
    if (cfg.checkinStreak) {
      const tiers = campId
        ? rewardTiers.value.filter((t) => !t.campId || t.campId === campId)
        : rewardTiers.value;
      if (tiers.some((t) => t.source === 'streak')) return true;
    }
    return false;
  }

  /** 更新指定营期的活动配置 */
  function updateActivityConfig(campId: string, updates: Partial<ActivityConfig>) {
    const current = getActivityConfig(campId);
    const merged = { ...current, ...updates };
    activityConfigByCamp.value = {
      ...activityConfigByCamp.value,
      [campId]: merged,
    };
    api.updateActivityConfigApi(campId, merged as Record<string, unknown>).catch(() => {});
  }

  function setCampMessage(campId: string, studentId: string, text: string) {
    const key = `${campId}_${studentId}`;
    if (text.trim()) campMessages.value = { ...campMessages.value, [key]: text.trim() };
    else {
      const next = { ...campMessages.value };
      delete next[key];
      campMessages.value = next;
    }
    api.saveCampMessage(campId, studentId, text).catch(() => {});
  }

  function getCampMessage(campId: string, studentId: string): string {
    return campMessages.value[`${campId}_${studentId}`] || '';
  }
  const viewHistory = ref<View[]>(['login']);
  const currentView = computed<View>(() => viewHistory.value[viewHistory.value.length - 1]);

  const questionnaireAnswered = ref(false);
  const students = ref<typeof MOCK_STUDENTS>([...MOCK_STUDENTS]);
  const weightRecords = ref<WeightRecord[]>([...MOCK_WEIGHT_RECORDS]);
  const exerciseRecords = ref<ExerciseRecord[]>([...MOCK_EXERCISE_RECORDS]);
  const dietRecords = ref<DietRecord[]>([...MOCK_DIET_RECORDS]);
  const coachActivities = ref<CoachActivityRecord[]>([...MOCK_COACH_ACTIVITIES]);
  // 正在编辑的教练活动（from coach dashboard → activity-upload 编辑模式）
  const editingActivity = ref<CoachActivityRecord | null>(null);
  // 教练端首页当前激活 Tab（持久化，返回/编辑发布后回到对应 Tab，而非重置到「未运动」）
  const coachDashboardTab = ref<'incomplete' | 'completed' | 'activities'>('incomplete');
  const rewardTiers = ref<RewardTier[]>([...MOCK_REWARD_TIERS]);
  const rewardClaims = ref<RewardClaim[]>([...MOCK_REWARD_CLAIMS]);
  const mealTimeConfigByCamp = ref<Record<string, MealTimeConfig>>({});
  const metricConfigs = ref<MetricConfig[]>([...DEFAULT_METRIC_CONFIGS]);

  /** 营期列表 */
  const camps = ref<Camp[]>([...MOCK_CAMPS]);
  /** 账户列表（手机号=登录凭证） */
  const accounts = ref<Account[]>([...MOCK_ACCOUNTS]);

  const selectedStudentId = ref<string | null>(null);
  const selectedDateStr = ref<string | null>(null);


  /** 学员端当前选中的营期 ID（多期学员可切换；null 时自动取第一个 active 营期） */
  const selectedCampId = ref<string | null>(null);

  /** 学员详情（营养师/教练查看某学员档案）流内的营期上下文，独立于全局 selectedCampId，不影响首页营期 */
  const detailSelectedCampId = ref<string | null>(null);

  /** 刚完成打卡标记（用于返回首页时触发成就/里程碑检测） */
  const justCheckedIn = ref(false);

  /** 待批注列表点击跳转时携带的目标记录信息（用于营养师端自动切 Tab + 滚动定位） */
  const pendingRecordType = ref<'diet' | 'weight' | 'exercise' | null>(null);
  const pendingRecordId = ref<string | null>(null);

  function setPendingAnnotation(type: 'diet' | 'weight' | 'exercise' | null, recordId: string | null = null) {
    pendingRecordType.value = type;
    pendingRecordId.value = recordId;
  }

  const videoPreview = ref<{ url: string } | null>(null);

  // 联调加载：USE_MOCK=true 时返回同一份 mock（无副作用）；USE_MOCK=false 时从后端拉取
  async function init() {
    try {
      const [studentList, diet, exercise, weight, activities, tiers, claims, metricCfgs, campList, accountList, products, exchanges] = await Promise.all([
        api.getStudents(),
        api.getDietRecords(),
        api.getExerciseRecords(),
        api.getWeightRecords(),
        api.getCoachActivities(),
        api.getRewardTiers(),
        api.getRewardClaims(),
        api.getMetricConfigs(),
        api.getCamps(),
        api.getAccounts(),
        api.getPointProducts(),
        api.getPointExchanges(),
      ]);
      students.value = studentList;
      dietRecords.value = diet;
      exerciseRecords.value = exercise;
      weightRecords.value = weight;
      coachActivities.value = activities;
      rewardTiers.value = tiers;
      rewardClaims.value = claims;
      metricConfigs.value = metricCfgs;
      camps.value = campList;
      accounts.value = accountList;
      pointProducts.value = products;
      pointExchanges.value = exchanges;

      // 按营期加载活动配置和餐时配置
      for (const camp of campList) {
        try {
          const [actCfg, mealCfg] = await Promise.all([
            api.getActivityConfig(camp.id),
            api.getMealTimeConfigByCamp(camp.id),
          ]);
          if (actCfg && Object.keys(actCfg).length > 0) {
            activityConfigByCamp.value = { ...activityConfigByCamp.value, [camp.id]: actCfg as unknown as ActivityConfig };
          }
          if (mealCfg) {
            mealTimeConfigByCamp.value = { ...mealTimeConfigByCamp.value, [camp.id]: mealCfg };
          }
        } catch {
          // 单个营期配置加载失败不影响整体
        }
      }
    } catch (e) {
      // 联调失败保留 mock 初值
    }
  }

  /** 默认展示最新营期：学员取本人所属期中最新的，教练取其负责期中最新的，营养师取全局最新的 */
  function applyLatestCampDefault() {
    if (!user.value) return;
    let pool: Camp[];
    if (user.value.role === 'student') {
      pool = getStudentCamps(user.value.id);
    } else if (user.value.role === 'coach') {
      pool = getCoachCamps();
    } else {
      pool = camps.value;
    }
    const latestId = latestOrFirstId(pool);
    if (latestId) selectedCampId.value = latestId;
  }

  function setUser(u: User | null) {
    user.value = u;
    if (u) {
      // 默认展示最新营期（学员取本人所属期中最新的，营养师/教练取全局最新的）
      applyLatestCampDefault();
      // 持久化登录态到 localStorage，实现保活
      const authData = {
        user: u,
        timestamp: Date.now(),
      };
      localStorage.setItem('camp_auth', JSON.stringify(authData));
    } else {
      localStorage.removeItem('camp_auth');
    }
  }

  /** 更新当前登录用户的个人信息（姓名/性别等），同步到 user + accounts + students + localStorage */
  function updateUserProfile(updates: Partial<User>) {
    if (!user.value) return;
    user.value = { ...user.value, ...updates };
    // 同步 name/gender/age 到 students 列表
    if (updates.name !== undefined || updates.gender !== undefined || updates.age !== undefined) {
      students.value = students.value.map((s) =>
        s.id === user.value!.id
          ? { ...s, name: updates.name ?? s.name, gender: updates.gender ?? s.gender, age: updates.age ?? s.age }
          : s,
      );
    }
    // 同步 name 到 accounts 列表（营养师端账号管理可见）
    if (updates.name !== undefined) {
      accounts.value = accounts.value.map((a) =>
        a.id === user.value!.id ? { ...a, name: updates.name! } : a,
      );
    }
    // 重新持久化
    const authData = { user: user.value, timestamp: Date.now() };
    localStorage.setItem('camp_auth', JSON.stringify(authData));
  }

  /** 从 localStorage 恢复登录态（页面刷新/重新打开时自动登录） */
  function restoreAuth(): boolean {
    try {
      const raw = localStorage.getItem('camp_auth');
      if (!raw) return false;
      const data = JSON.parse(raw);
      // 30 天过期
      const maxAge = 30 * 24 * 60 * 60 * 1000;
      if (Date.now() - data.timestamp > maxAge) {
        localStorage.removeItem('camp_auth');
        return false;
      }
      if (data.user && data.user.role) {
        user.value = data.user;
        // 默认展示最新营期
        applyLatestCampDefault();
        // 恢复问卷状态
        const qSaved = localStorage.getItem('submitted_questionnaire');
        questionnaireAnswered.value = !!qSaved;
        // 根据角色和问卷状态跳转到对应首页
        if (data.user.role === 'coach') {
          viewHistory.value = ['coach-dashboard'];
        } else if (data.user.role === 'dietitian') {
          viewHistory.value = ['dietitian-dashboard'];
        } else {
          // 学员：已填问卷 -> 首页，未填 -> 问卷页
          viewHistory.value = [qSaved ? 'dashboard' : 'questionnaire'];
        }
        return true;
      }
    } catch (e) {
      // JSON 解析失败，清除无效数据
      localStorage.removeItem('camp_auth');
    }
    return false;
  }

  /** 退出登录 */
  function logout() {
    user.value = null;
    selectedCampId.value = null;
    localStorage.removeItem('camp_auth');
    viewHistory.value = ['login'];
  }

  /** 底部 Tab 根页面（切换时去重，避免历史栈无限增长） */
  // 首期上线版：学员端底部Tab为 首页/档案（移除活动/消息）
  const TAB_ROOTS: View[] = ['dashboard', 'health-profile', 'coach-dashboard', 'dietitian-dashboard', 'dietitian-unannotated-list', 'dietitian-config'];

  /** 学员详情流视图：在此流内继承 detailSelectedCampId，离开则清空（不污染全局 selectedCampId） */
  const DETAIL_FLOW_VIEWS: View[] = ['dietitian-student-detail', 'coach-student-detail', 'pointsDetail'];

  function setCurrentView(view: View) {
    const current = viewHistory.value[viewHistory.value.length - 1];
    if (current === view) return;

    // Tab 根页面切换：若目标根页已在历史栈中，截断到该位置（模拟原生 Tab 行为）；
    // 尚未进入过历史栈时（如登录/首次切换该根页），必须 push，否则无法跳转。
    if (TAB_ROOTS.includes(view)) {
      const idx = viewHistory.value.lastIndexOf(view);
      if (idx >= 0) {
        viewHistory.value = viewHistory.value.slice(0, idx + 1);
        // 回到根页面时清空详情流营期上下文
        detailSelectedCampId.value = null;
        return;
      }
    }

    viewHistory.value.push(view);
    // 离开详情流时清空详情营期上下文
    if (!DETAIL_FLOW_VIEWS.includes(view)) detailSelectedCampId.value = null;
  }

  function goBack() {
    if (viewHistory.value.length > 1) {
      viewHistory.value.pop();
      if (!DETAIL_FLOW_VIEWS.includes(currentView.value)) detailSelectedCampId.value = null;
    }
  }

  function setQuestionnaireAnswered(v: boolean) {
    questionnaireAnswered.value = v;
  }

  function addWeightRecord(record: WeightRecord) {
    weightRecords.value.push(record);
    api.createWeightRecord(record).catch(() => {});
  }

  /** 更新体重记录（营养师批注使用） */
  function updateWeightRecord(id: string, updates: Partial<WeightRecord>) {
    weightRecords.value = weightRecords.value.map((r) => (r.id === id ? { ...r, ...updates } : r));
    api.updateWeightRecord(id, updates).catch(() => {});
  }

  function addExerciseRecord(record: ExerciseRecord) {
    exerciseRecords.value.push(record);
    api.createExerciseRecord(record).catch(() => {});
  }

  /** 更新运动记录（营养师批注使用） */
  function updateExerciseRecord(id: string, updates: Partial<ExerciseRecord>) {
    exerciseRecords.value = exerciseRecords.value.map((r) => (r.id === id ? { ...r, ...updates } : r));
    api.updateExerciseRecord(id, updates).catch(() => {});
  }

  function addDietRecord(record: DietRecord) {
    dietRecords.value.push(record);
    api.createDietRecord(record).catch(() => {});
  }

  function updateDietRecord(id: string, updates: Partial<DietRecord>) {
    dietRecords.value = dietRecords.value.map((r) => (r.id === id ? { ...r, ...updates } : r));
    api.updateDietRecord(id, updates).catch(() => {});
  }


  function addCoachActivity(record: CoachActivityRecord) {
    coachActivities.value.push(record);
    api.createCoachActivity(record).catch(() => {});
  }

  function updateCoachActivity(id: string, updates: Partial<CoachActivityRecord>) {
    const idx = coachActivities.value.findIndex((a) => a.id === id);
    if (idx >= 0) coachActivities.value[idx] = { ...coachActivities.value[idx], ...updates, id };
    api.updateCoachActivity(id, updates).catch(() => {});
  }

  function deleteCoachActivity(id: string) {
    coachActivities.value = coachActivities.value.filter((a) => a.id !== id);
    api.deleteCoachActivity(id).catch(() => {});
  }

  function setEditingActivity(record: CoachActivityRecord | null) {
    editingActivity.value = record;
  }

  function setSelectedStudentId(id: string | null) {
    selectedStudentId.value = id;
  }

  function setSelectedDateStr(date: string | null) {
    selectedDateStr.value = date;
  }

  function openImagePreview(urls: string[], index: number = 0) {
    if (urls.length > 0) {
      showImagePreview({ images: urls, startPosition: index, closeable: true });
    }
  }

  function openVideoPreview(url: string) {
    videoPreview.value = { url };
  }

  function addRewardTier(tier: RewardTier) {
    rewardTiers.value.push(tier);
    api.createRewardTier(tier).catch(() => {});
  }

  function updateRewardTier(id: string, updates: Partial<RewardTier>) {
    rewardTiers.value = rewardTiers.value.map((t) => (t.id === id ? { ...t, ...updates } : t));
    api.updateRewardTier(id, updates).catch(() => {});
  }

  function deleteRewardTier(id: string) {
    rewardTiers.value = rewardTiers.value.filter((t) => t.id !== id);
    api.deleteRewardTier(id).catch(() => {});
  }

  function addRewardClaim(claim: RewardClaim) {
    rewardClaims.value.push(claim);
    api.createRewardClaim(claim).catch(() => {});
  }

  function updateRewardClaim(id: string, updates: Partial<RewardClaim>) {
    rewardClaims.value = rewardClaims.value.map((c) => (c.id === id ? { ...c, ...updates } : c));
    api.updateRewardClaim(id, updates).catch(() => {});
  }

  // ─── 积分商城 ──────────────────────────────────────────
  /** 积分商城商品。可绑定营期(campId)；未绑定则全局共享。兑换记录按 exchange.campId 营期隔离。 */
  const pointProducts = ref<PointProduct[]>([...MOCK_POINT_PRODUCTS]);
  /** 积分兑换记录 */
  const pointExchanges = ref<PointExchangeRecord[]>([...MOCK_POINT_EXCHANGES]);
  /** 营养师手动加减分记录 */
  const manualScoreRecords = ref<ManualScoreRecord[]>([...MOCK_MANUAL_SCORES]);

  /** 获取上架商品；campId 传入时按营期过滤（未绑定 campId 的商品视为全局共享，与 RewardTier 口径一致） */
  function getPointProducts(campId?: string | null) {
    return pointProducts.value.filter((p) => p.active && (!campId || !p.campId || p.campId === campId));
  }

  function addPointProduct(product: PointProduct) {
    pointProducts.value.push(product);
    api.createPointProduct(product).catch(() => {});
  }

  function updatePointProduct(id: string, updates: Partial<PointProduct>) {
    pointProducts.value = pointProducts.value.map((p) => (p.id === id ? { ...p, ...updates } : p));
    api.updatePointProduct(id, updates).catch(() => {});
  }

  function deletePointProduct(id: string) {
    pointProducts.value = pointProducts.value.filter((p) => p.id !== id);
    api.deletePointProduct(id).catch(() => {});
  }

  /** 计算学员的积分商城可用积分（排行榜总积分 - 已消耗积分，不可为负）
   *  campId 传入时按营期过滤（与排行榜一致），不传则汇总全部营期
   */
  function getStudentMallPoints(studentId: string, campId?: string): number {
    const earned = getStudentTotalEarnedPoints(studentId, campId);
    // 已消费也按营期过滤，与 earned 同口径：避免多营期学员在一营期的兑换侵蚀另一营期的可用积分/重复抵扣
    const spent = pointExchanges.value
      .filter((e) => e.studentId === studentId && e.status !== 'cancelled' && (!campId || !e.campId || e.campId === campId))
      .reduce((sum, e) => sum + e.pointsSpent, 0);
    return Math.max(0, earned - spent);
  }

  /** 学员总获得积分（饮食分+运动分+手动加减分）
   *  campId 传入时按营期过滤（与排行榜一致），不传则汇总全部营期
   */
  function getStudentTotalEarnedPoints(studentId: string, campId?: string): number {
    const diet = (campId ? getCampDietRecords(campId) : dietRecords.value).filter((r) => r.studentId === studentId);
    const exercise = (campId ? getCampExerciseRecords(campId) : exerciseRecords.value).filter((r) => r.studentId === studentId);
    const manual = (campId ? getCampManualScoreRecords(campId) : manualScoreRecords.value).filter((r) => r.studentId === studentId);
    return calculateTotalScore(diet, exercise, manual);
  }

  /** 营养师手动加减分 */
  function addManualScoreRecord(record: ManualScoreRecord) {
    manualScoreRecords.value.push(record);
  }
  function deleteManualScoreRecord(id: string) {
    manualScoreRecords.value = manualScoreRecords.value.filter((r) => r.id !== id);
  }

  /** 兑换商品 */
  function exchangePointProduct(
    studentId: string,
    studentName: string,
    product: PointProduct,
    deliveryInfo?: { recipientName: string; recipientPhone: string; recipientAddress: string; deliveryMethod: 'shipped' | 'in-person' },
    campId?: string,
  ): PointExchangeRecord | null {
    // 实时重读商品，避免调用方传入的快照过期（已下架 / 库存已被其它兑换占用）。真实上线须由服务端做权威校验。
    const fresh = pointProducts.value.find((p) => p.id === product.id);
    if (!fresh || !fresh.active) return null;
    const available = getStudentMallPoints(studentId, campId);
    if (available < fresh.pointsRequired) return null;
    if (fresh.stock <= 0) return null;
    // 防御性校验：每人限兑换次数（maxExchange；0/未设置=不限）
    if (fresh.maxExchange) {
      const used = pointExchanges.value.filter((e) => e.studentId === studentId && e.productId === product.id && e.status !== 'cancelled').length;
      if (used >= fresh.maxExchange) return null;
    }
    // 防御性校验：deliveryMethod 必须被商品支持
    if (deliveryInfo && !fresh.deliveryOptions.includes(deliveryInfo.deliveryMethod)) return null;

    const now = formatDateTimeStr();
    const record: PointExchangeRecord = {
      id: `pe_${Date.now()}`,
      studentId,
      studentName,
      productId: fresh.id,
      productName: fresh.name,
      productImage: fresh.imageUrl,
      pointsSpent: fresh.pointsRequired,
      exchangeDate: now,
      status: 'pending',
      deliveryMethod: deliveryInfo?.deliveryMethod,
      recipientName: deliveryInfo?.recipientName,
      recipientPhone: deliveryInfo?.recipientPhone,
      recipientAddress: deliveryInfo?.recipientAddress,
      campId,
    };
    pointExchanges.value.push(record);
    // 扣减库存（剩余可发量语义：领取减 / 取消加 / 发货不动）
    updatePointProduct(fresh.id, { stock: fresh.stock - 1 });
    api.createPointExchange(record).catch(() => {});
    return record;
  }

  /** 获取学员兑换记录 */
  function getStudentExchanges(studentId: string): PointExchangeRecord[] {
    return pointExchanges.value
      .filter((e) => e.studentId === studentId)
      .sort((a, b) => b.exchangeDate.localeCompare(a.exchangeDate));
  }

  /** 更新兑换状态 */
  function updateExchangeStatus(id: string, status: PointExchangeRecord['status']) {
    const exchange = pointExchanges.value.find(e => e.id === id);
    if (!exchange) return;
    // 状态机校验：只允许 pending -> fulfilled/cancelled
    if (exchange.status !== 'pending') return;
    // 如果取消兑换，恢复库存
    if (status === 'cancelled') {
      const product = pointProducts.value.find(p => p.id === exchange.productId);
      if (product) {
        updatePointProduct(product.id, { stock: product.stock + 1 });
      }
    }
    pointExchanges.value = pointExchanges.value.map((e) => (e.id === id ? { ...e, status } : e));
    api.updatePointExchange(id, { status }).catch(() => {});
  }

  /** 学员取消兑换（发货前可取消，积分自动返还） */
  function cancelExchange(id: string) {
    updateExchangeStatus(id, 'cancelled');
  }

  /** 营养师发货兑换商品 */
  function shipExchange(id: string, trackingNumber: string, method: 'shipped' | 'in-person') {
    const exchange = pointExchanges.value.find(e => e.id === id);
    if (!exchange || exchange.status !== 'pending') return;
    const now = formatDateTimeStr();
    const updates: Partial<PointExchangeRecord> = {
      status: 'fulfilled',
      deliveryMethod: method,
      trackingNumber: method === 'shipped' ? trackingNumber : undefined,
      shipDate: method === 'shipped' ? now : undefined,
      deliveredAt: method === 'in-person' ? now : undefined,
    };
    pointExchanges.value = pointExchanges.value.map((e) => (e.id === id ? { ...e, ...updates } : e));
    api.updatePointExchange(id, updates).catch(() => {});
  }

  function getMealTimeConfig(campId: string): MealTimeConfig {
    return mealTimeConfigByCamp.value[campId] || { ...DEFAULT_MEAL_TIME_CONFIG };
  }

  function updateMealTimeConfig(campId: string, config: MealTimeConfig) {
    mealTimeConfigByCamp.value = { ...mealTimeConfigByCamp.value, [campId]: { ...config } };
    api.updateMealTimeConfigByCamp(campId, config).catch(() => {});
  }

  function addMetricConfig(config: MetricConfig) {
    metricConfigs.value.push(config);
    api.createMetricConfig(config).catch(() => {});
  }

  function updateMetricConfig(id: string, updates: Partial<MetricConfig>) {
    metricConfigs.value = metricConfigs.value.map((c) => (c.id === id ? { ...c, ...updates } : c));
    api.updateMetricConfig(id, updates).catch(() => {});
  }

  function deleteMetricConfig(id: string) {
    metricConfigs.value = metricConfigs.value.filter((c) => c.id !== id);
    api.deleteMetricConfig(id).catch(() => {});
  }

  function closeVideoPreview() {
    videoPreview.value = null;
  }

  // ─── 营期管理 ───
  function addCamp(camp: Camp) {
    camps.value.push(camp);
    api.createCamp(camp).catch(() => {});
  }
  function updateCamp(id: string, updates: Partial<Camp>) {
    camps.value = camps.value.map((c) => (c.id === id ? { ...c, ...updates } : c));
    api.updateCamp(id, updates).catch(() => {});
  }
  function deleteCamp(id: string) {
    camps.value = camps.value.filter((c) => c.id !== id);
    api.deleteCamp(id).catch(() => {});
  }

  // ─── 账户管理 ───
  function addAccount(account: Account) {
    accounts.value.push(account);
    api.createAccount(account).catch(() => {});
  }
  function updateAccount(id: string, updates: Partial<Account>) {
    accounts.value = accounts.value.map((a) => (a.id === id ? { ...a, ...updates } : a));
    api.updateAccount(id, updates).catch(() => {});
  }
  function deleteAccount(id: string) {
    accounts.value = accounts.value.filter((a) => a.id !== id);
    api.deleteAccount(id).catch(() => {});
  }

  /** 获取学员的所有营期列表 */
  function getStudentCamps(studentId: string): Camp[] {
    const account = accounts.value.find((a) => a.id === studentId);
    if (!account?.campIds || account.campIds.length === 0) return [];
    return camps.value.filter((c) => account.campIds!.includes(c.id));
  }

  /** 获取学员当前营期（详情流优先 detailSelectedCampId，其次全局 selectedCampId，否则取第一个 active） */
  function getStudentCamp(studentId: string): Camp | null {
    const studentCamps = getStudentCamps(studentId);
    if (studentCamps.length === 0) return null;
    // 详情流上下文营期（学员档案内独立切换，不影响全局）优先
    if (detailSelectedCampId.value && studentCamps.some((c) => c.id === detailSelectedCampId.value)) {
      return studentCamps.find((c) => c.id === detailSelectedCampId.value) || null;
    }
    // 优先使用学员选中的营期（且该营期属于此学员）
    if (selectedCampId.value && studentCamps.some((c) => c.id === selectedCampId.value)) {
      return studentCamps.find((c) => c.id === selectedCampId.value) || null;
    }
    // 自动选择：优先 active，其次 ended，最后 upcoming
    const active = studentCamps.find((c) => c.status === 'active');
    const ended = studentCamps.find((c) => c.status === 'ended');
    const upcoming = studentCamps.find((c) => c.status === 'upcoming');
    return active || ended || upcoming || studentCamps[0];
  }

  /** 获取营期天数（从 start/end 日期计算；无日期则返回默认 28 天） */
  function getCampDays(studentId: string): number {
    const camp = getStudentCamp(studentId);
    if (camp?.startDate && camp?.endDate) {
      const start = new Date(camp.startDate);
      const end = new Date(camp.endDate);
      const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      return diff > 0 ? diff : 28;
    }
    return 28;
  }

  /** 结营报告是否可查看（营期已结束，即当前日期 > 结营日期） */
  function canViewCampReport(studentId: string): boolean {
    const camp = getStudentCamp(studentId);
    if (!camp) return false;
    if (camp.status === 'ended') return true;
    if (camp.endDate) {
      const end = new Date(camp.endDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return today > end;
    }
    return false;
  }

  /** 营期是否已开营（当前日期 >= 开营日期；status 优先，无 status 时按 startDate 判断） */
  function isCampStarted(camp: Camp | null | undefined): boolean {
    if (!camp) return true; // 无营期信息时不限制
    if (camp.status === 'upcoming') return false;
    if (camp.status === 'active' || camp.status === 'ended') return true;
    if (camp.startDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const start = new Date(camp.startDate);
      start.setHours(0, 0, 0, 0);
      return today >= start;
    }
    return true;
  }

  /** 学员当前营期是否已开营（学员能否打卡） */
  function canStudentCheckIn(studentId: string): boolean {
    return isCampStarted(getStudentCamp(studentId));
  }

  // ─── 按营期过滤打卡记录（campId 精确匹配，不靠日期范围猜测） ──────
  function getCampDietRecords(campId: string) {
    return dietRecords.value.filter((r) => r.campId === campId);
  }
  function getCampExerciseRecords(campId: string) {
    return exerciseRecords.value.filter((r) => r.campId === campId);
  }
  function getCampManualScoreRecords(campId: string) {
    return manualScoreRecords.value.filter((r) => !r.campId || r.campId === campId);
  }
  function getCampWeightRecords(campId: string) {
    return weightRecords.value.filter((r) => r.campId === campId);
  }
  function getCampRewardTiers(campId: string) {
    return rewardTiers.value.filter((t) => !t.campId || t.campId === campId);
  }
  function getCampRewardClaims(campId: string) {
    return rewardClaims.value.filter((c) => !c.campId || c.campId === campId);
  }
  function getCampCoachActivities(campId: string) {
    return coachActivities.value.filter((a) => !a.campIds || a.campIds.length === 0 || a.campIds.includes(campId));
  }

  /** 获取教练负责的营期列表（从 coach account.campIds 获取） */
  function getCoachCamps(): Camp[] {
    if (!user.value || user.value.role !== 'coach') return [];
    const account = accounts.value.find(a => a.id === user.value!.id || a.phone === user.value!.phone);
    if (!account?.campIds || account.campIds.length === 0) return camps.value.filter(c => c.status === 'active');
    return camps.value.filter(c => account.campIds.includes(c.id));
  }

  /** 获取教练负责的学员列表（按教练营期过滤） */
  function getCoachStudents(): { id: string; name: string; phone: string; gender?: 'male' | 'female'; age?: number }[] {
    const coachCamps = getCoachCamps();
    if (coachCamps.length === 0) return [];
    const campIds = coachCamps.map(c => c.id);
    return accounts.value
      .filter(a => a.role === 'student' && a.active && a.campIds?.some(id => campIds.includes(id)))
      .map(a => {
        const studentInfo = students.value.find(s => s.id === a.id);
        return {
          id: a.id,
          name: a.name,
          phone: a.phone,
          gender: studentInfo?.gender,
          age: studentInfo?.age,
        };
      });
  }

  /** 获取指定营期的学员列表（从 accounts 中筛选 campIds 包含该营期且 active 的学员） */
  function getStudentsByCamp(campId: string): { id: string; name: string; phone: string; gender?: 'male' | 'female'; age?: number }[] {
    return accounts.value
      .filter((a) => a.role === 'student' && a.active && a.campIds?.includes(campId))
      .map((a) => {
        // 从 students 列表补充 gender/age 信息
        const studentInfo = students.value.find((s) => s.id === a.id);
        return {
          id: a.id,
          name: a.name,
          phone: a.phone,
          gender: studentInfo?.gender,
          age: studentInfo?.age,
        };
      });
  }

  /** 获取所有活跃学员（不限营期） */
  function getAllStudents(): { id: string; name: string; phone: string; gender?: 'male' | 'female'; age?: number }[] {
    return accounts.value
      .filter((a) => a.role === 'student' && a.active)
      .map((a) => {
        const studentInfo = students.value.find((s) => s.id === a.id);
        return {
          id: a.id,
          name: a.name,
          phone: a.phone,
          gender: studentInfo?.gender,
          age: studentInfo?.age,
        };
      });
  }

  /** 获取学员的当前营期 ID（优先 active，其次 ended） */
  function getStudentCampId(studentId: string): string | null {
    const camp = getStudentCamp(studentId);
    return camp?.id || null;
  }

  return {
    user,
    campMessages,
    setCampMessage,
    getCampMessage,
    activityConfigByCamp,
    getActivityConfig,
    getHasActivity,
    updateActivityConfig,
    currentView,
    init,
    questionnaireAnswered,
    students,
    weightRecords,
    exerciseRecords,
    dietRecords,
    coachActivities,
    getCampCoachActivities,
    selectedStudentId,
    selectedDateStr,
    selectedCampId,
    detailSelectedCampId,
    justCheckedIn,
    pendingRecordType,
    pendingRecordId,
    setPendingAnnotation,
    videoPreview,
    setUser,
    updateUserProfile,
    restoreAuth,
    logout,
    setCurrentView,
    goBack,
    setQuestionnaireAnswered,
    addWeightRecord,
    updateWeightRecord,
    addExerciseRecord,
    updateExerciseRecord,
    addDietRecord,
    updateDietRecord,
    addCoachActivity,
    updateCoachActivity,
    deleteCoachActivity,
    setEditingActivity,
    editingActivity,
    coachDashboardTab,
    setSelectedStudentId,
    setSelectedDateStr,
    rewardTiers,
    rewardClaims,
    addRewardTier,
    updateRewardTier,
    deleteRewardTier,
    addRewardClaim,
    updateRewardClaim,
    getPointProducts,
    addPointProduct,
    updatePointProduct,
    deletePointProduct,
    getStudentMallPoints,
    getStudentTotalEarnedPoints,
    exchangePointProduct,
    getStudentExchanges,
    updateExchangeStatus,
    cancelExchange,
    shipExchange,
    pointProducts,
    pointExchanges,
    manualScoreRecords,
    addManualScoreRecord,
    deleteManualScoreRecord,
    getCampDietRecords,
    getCampExerciseRecords,
    getCampManualScoreRecords,
    getCampWeightRecords,
    getCampRewardTiers,
    getCampRewardClaims,
    mealTimeConfigByCamp,
    getMealTimeConfig,
    updateMealTimeConfig,
    metricConfigs,
    addMetricConfig,
    updateMetricConfig,
    deleteMetricConfig,
    openImagePreview,
    openVideoPreview,
    closeVideoPreview,
    camps,
    accounts,
    addCamp,
    updateCamp,
    deleteCamp,
    addAccount,
    updateAccount,
    deleteAccount,
    getStudentCamp,
    getCampDays,
    canViewCampReport,
    isCampStarted,
    canStudentCheckIn,
    getStudentsByCamp,
    getAllStudents,
    getCoachCamps,
    getCoachStudents,
    getStudentCampId,
    getStudentCamps,
  };
});
