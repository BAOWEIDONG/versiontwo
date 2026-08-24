# 代码 Review 报告 - 本期更新审查

> 审查范围：教练端学员详情、趣味活动系统、积分商城、消息中心、多营期隔离、confetti/exportImage/videoCompress
> 审查日期：2026-08-04

---

## 一、上期问题修复状态

| # | 上期问题 | 状态 | 说明 |
|---|---------|------|------|
| 1.1 | FulfillmentCenterView 中 RewardClaim campId 为空 | **已修复** | 奖励领取现在携带 campId，按营期过滤正确 |
| 1.2 | 积分商城无 API 层 | **未修复** | Store 方法仍只改本地状态，`USE_MOCK=false` 后数据不持久 |
| 1.3 | 活动配置/结营寄语无 API 持久化 | **未修复** | `activityConfigByCamp`、`campMessages` 仍硬编码在 store |
| 1.4 | 日期格式不一致 | **未修复** | `new Date().toISOString()` 与 `yyyy-MM-dd HH:mm:ss` 混用 |
| 2.1 | reward-manage / point-exchange-history 死代码 | **待确认** | 需检查是否已清理 |
| 2.5 | api.ts 中体重记录 JSDoc 被截断 | **待确认** | 需检查注释是否修复 |

---

## 二、本期新增功能审查

### 2.1 教练端学员详情（CoachStudentDetailView.vue）

**功能正确性**：教练可查看学员运动/体重/医疗/问卷四个维度，对运动记录批注打分（0/1/2），支持营期切换。

**注意事项**：
- `ExerciseRecord` 恢复了 `coachComment` / `coachScore` 字段，与结营报告版本"移除教练批注"的决策相反。这是有意的需求变更，非回归。
- 营养师端运动 Tab 已改为只读，不再有批注入口，与教练端职责分离清晰。
- 教练批注目前无 API 持久化（与营养师批注同样的 mock 模式限制），联调时需补充 `PATCH /exercise-records/:id` 接口。

### 2.2 趣味活动系统（campActivities.ts）

**功能正确性**：阶梯减重、每周挑战、全勤抽奖三个活动均为纯函数计算，不产生副作用，不读写积分。活动进度实时计算，打卡后自动更新。

**注意事项**：
- 阶梯减重使用"历史最低体重"防作弊，逻辑正确。
- 每周挑战以学员首次打卡日为起点，8 周模板循环。`computeWeeklyChallenges` 的周数计算依赖 `startOfWeek`，跨年场景需验证。
- 全勤抽奖分母取营期配置天数（`campDays`），而非固定 28 天，正确。
- `activityConfigByCamp` 硬编码在 store 初始值中，`init()` 不加载，联调时需补充 `GET/PUT /activity-config/:campId`。

### 2.3 积分商城

**功能正确性**：兑换流程（扣积分+扣库存）、取消流程（恢复积分+恢复库存）、发货流程逻辑正确。积分来源 `getStudentMallPoints = max(0, 总积分 - 非取消的已消耗积分)` 计算正确。

**注意事项**：
- `PointProduct` 无 `campId` 字段，商品全局共享。这是设计决策（注释已标注），如需按营期配置商品后续需加字段。
- `exchangePointProduct` 未在 Store 层校验 `deliveryMethod` 是否被商品 `deliveryOptions` 支持，依赖组件层校验。建议 Store 层加防御性校验。
- 全程无 API 调用，`USE_MOCK=false` 后数据不持久（上期问题 1.2 未修复）。

### 2.4 消息中心（MessagesView.vue）

**功能正确性**：三类消息（批注/奖励/排名）聚合展示，localStorage `camp_msg_seen` 按用户 ID 存储已读状态，支持未读计数和点击跳转。

**注意事项**：
- `commentRead` 字段在打卡记录上标记已读，但消息中心的已读状态使用独立 localStorage，两套已读机制并行。建议明确：`commentRead` 是"学员是否看过批注"，`camp_msg_seen` 是"消息是否在消息中心展示为已读"，语义不同，当前设计合理。
- 排名消息需要与上次排名对比，"上次"的数据来源需确认（localStorage 或 store 缓存）。

### 2.5 多营期数据隔离

**功能正确性**：所有打卡记录新增 `campId`，store 的 `getCamp*` 系列方法按营期精确过滤。学员端全局营期切换器工作正常。

**注意事项**：
- `getCampRewardTiers(campId)` 的过滤逻辑 `!t.campId || t.campId === campId` 仍允许无 campId 的 tier 出现在所有营期中（上期问题 2.4 未修复）。如这是"全局奖品"设计意图，建议改为显式 `campId: 'global'`。
- `getStudentCamps(studentId)` 返回学员参与的所有营期，数据来源需确认（Account.campIds 还是打卡记录中的 campId 去重）。

### 2.6 打卡庆典特效（confetti.ts）

**功能正确性**：纯 Canvas + DOM 实现，零依赖。6 种打卡主题 + 奖励金箔主题，5 个爆发点 + 金箔雨 + 礼花炮。

**注意事项**：
- 低端设备上 Canvas 动画可能卡顿，建议加 `requestAnimationFrame` 帧率限制或降级策略。
- `navigator.vibrate` 在 iOS Safari 上不支持，已做兼容处理（try-catch），正确。

### 2.7 报告导出（exportImage.ts）与视频压缩（videoCompress.ts）

**功能正确性**：报告导出动态加载 html2canvas，降级 `window.print()`。视频压缩使用 Canvas + MediaRecorder，递归压缩至 15MB。

**注意事项**：
- `html2canvas` 通过动态 `import()` 加载，需确保 `package.json` 中有该依赖（或使用 CDN）。
- `videoCompress.ts` 的 `MediaRecorder` 在部分浏览器（如 iOS Safari < 14.3）不支持，需加兼容检测。

---

## 三、数据流转链路审查

### 3.1 教练批注链路（新增）

```
教练查看学员运动记录 (CoachStudentDetailView)
  -> 批注 + 打分 (coachComment / coachScore)
  -> ExerciseRecord 更新
  -> 学员运动打卡页展示教练批注 (ExerciseView)
  -> 消息中心推送批注消息 (MessagesView)
```

**逻辑正确**：批注数据写入 ExerciseRecord，学员端可查看。消息中心通过 `commentRead` 追踪已读。

### 3.2 趣味活动奖励链路（新增）

```
学员达标(自动计算)
  -> 学员领取奖励 (CampActivitiesView.submitClaim)
    -> 创建 RewardClaim { campId, activityType }
  -> 营养师发货 (FulfillmentCenterView)
    -> 更新 RewardClaim { status: 'shipped'/'in-person' }
```

**逻辑正确**：campId 已正确传入，营期隔离正确。与积分商城共用 FulfillmentCenterView 发货。

### 3.3 积分兑换链路（上期已审查，逻辑不变）

```
学员兑换 -> 扣积分+扣库存 -> 营养师发货/学员取消(恢复积分+库存)
```

**逻辑正确**，**缺失 API 持久化**。

---

## 四、待修复问题汇总

| # | 问题 | 文件 | 优先级 | 状态 |
|---|------|------|--------|------|
| 1 | 积分商城 API 层（6个接口） | lib/api.ts + store/app.ts | P0 | 未修复（上期遗留） |
| 2 | 活动配置/寄语 API 持久化 | lib/api.ts + store/app.ts | P1 | 未修复（上期遗留） |
| 3 | 日期格式统一为 yyyy-MM-dd HH:mm:ss | store/app.ts | P1 | 未修复（上期遗留） |
| 4 | init() 补充加载 pointProducts/exchanges | store/app.ts | P1 | 未修复（上期遗留） |
| 5 | mealTimeConfig API 传 campId | lib/api.ts + store/app.ts | P1 | 未修复（上期遗留） |
| 6 | getCampRewardTiers 全局 tier 过滤逻辑 | store/app.ts | P2 | 未修复（上期遗留） |
| 7 | Store 层 deliveryMethod 防御校验 | store/app.ts | P2 | 未修复（上期遗留） |
| 8 | 教练批注 API 持久化 | lib/api.ts | P1 | 新增 |
| 9 | confetti 帧率限制/降级 | confetti.ts | P3 | 新增 |
| 10 | videoCompress MediaRecorder 兼容检测 | videoCompress.ts | P3 | 新增 |

---

## 五、架构评价

本期新增功能在架构上延续了纯函数计算引擎 + Store 管理状态 + API 层开关的设计模式，与结营报告系统保持一致。主要亮点：

- **多营期隔离**：campId 全链路贯穿，store 的 `getCamp*` 方法统一过滤，组件层无需重复处理。
- **趣味活动与积分并行**：两条激励赛道独立运行，互不干扰，活动不产生积分扣减。
- **教练/营养师职责分离**：教练管运动批注，营养师管饮食批注，各端只读对方数据。
- **纯函数计算引擎**：campActivities.ts 与 campReport.ts / journey.ts 风格一致，前后端可直接调用。

主要待改进项是 API 层的完整性——积分商城、活动配置、教练批注等新功能均缺 API 持久化，`USE_MOCK=false` 后数据不持久。建议在前后端联调阶段统一补充。

---

*Report generated on 2026-08-04*
