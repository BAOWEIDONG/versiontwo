# 健康训练营 H5 系统 · versiontwo

> 第二版本在线演示：https://baoweidong.github.io/versiontwo/
> 本文档为技术接入说明，重点说明 **versiontwo 相对 versionone 的新增与变更**，以及如何本地运行、测试与部署。

---

## 1. 技术栈

Vue 3（`<script setup lang="ts">`）· TypeScript · Pinia · Vant 4 · Tailwind CSS v4 · Vite · PWA（Service Worker）

| 关键依赖 | 用途 |
|---|---|
| `vant` | 移动端 UI（Popup / Toast / ImagePreview / Tabbar） |
| `pinia` | 状态管理（`src/store/app.ts` 为单一 store） |
| `html2canvas-pro` | 报告 DOM 截图（**注意是 pro 版**，原版 html2canvas 不支持 Tailwind v4 的 `oklch` 颜色会抛错） |
| `jspdf` | 报告导出 PDF（A4 分页） |
| `date-fns` | 日期处理 |
| `lucide-vue-next` | 图标 |

---

## 2. 本地运行

```bash
npm install          # 安装依赖
npm run dev          # 启动开发服务器 → http://localhost:3000
npm run build        # 生产构建 → dist/（配合 GitHub Actions 自动部署）
npm run lint         # vue-tsc 类型检查（构建前建议跑，确保类型零错误）
```

> 前置：Node.js ≥ 18 + npm。若在 macOS 开发、在 Linux/CI 构建，`node_modules` 需重新 `npm install`（esbuild/rollup 原生二进制平台不通用）。

---

## 3. 测试账号（种子数据，`src/mock/data.ts`）

| 角色 | 手机号 | 姓名 | 说明 |
|---|---|---|---|
| 营养师（主） | `18888888888` | 管理员 | 全部营期可见 |
| 营养师 | `13900000001` / `13900000002` | 王营养师 / 李营养师 | — |
| 教练 | `13700000001` / `13700000002` / `13700000003` | 李教练 / 王教练 / 张教练 | 李教练=营期1；王教练=营期1/2；张教练=全部 |
| 学员 s1–s11 | `13800000001`–`13800000011` | 李明/王丽/张伟/赵静/周杰/吴磊/郑爽/王强/刘梅/孙悟空/钱多多 | 分属 camp1/camp2/camp3，可多期 |

营期：camp1 / camp2 / camp3，各自独立 `startDate`/`endDate`。

---

## 4. versiontwo 相对 versionone 的新增与变更

### 4.1 核心架构：多营期隔离

versionone 为单期概念；versiontwo 引入多营期，**所有数据按 `campId` 全链路过滤**（录入→存储→计算→三端展示均隔离，已做跨营期串扰审计）。

受影响的实体都新增 `campId` 字段：`WeightRecord` / `DietRecord` / `ExerciseRecord` / `RewardTier` / `RewardClaim` / `PointProduct` / `PointExchangeRecord` / `ManualScoreRecord`，另有按营期独立存取的 `MealTimeConfig` 与 `ActivityConfig`。

- 营期切换器：三端顶部下拉切换（营养师在配置页各页、教练在首页、学员在打卡页），默认选中最新营期。
- 最新营期定义（`lib/camps.ts#latestCamp`）：已开营中开营时间最晚者；全未开营取距今天最近者。
- 营期天数（`campDaysOf`）：由 `startDate`/`endDate` 计算 `end - start`，缺日期回退 28 天。不再硬编码 28 天。

### 4.2 账户与登录增强

`Account` 新增字段：`campIds`（多营期绑定，同一学员可参与多期）、`active`（启用/禁用，`false` 后该手机号无法登录且从排行榜/学员列表排除）。

### 4.3 从 v1 注释代码恢复并改造的模块

以下模块在 v1 中被注释未交付，v2 恢复并依 v2 口径改造：

- **营养师配置中心**（账户/营期/指标/奖品/商城/活动/餐次分页）
- **首页活动入口板块** + 底部 Tabbar 活动 tab
- **日历连续打卡奖励**（连续打卡解锁奖品，弹窗只弹一次 once-per-tier）
- **消息中心**（分类未读数、tab 滑动）
- **运动趋势图**（`DailyExerciseTrend`）
- **个人历程** + 长图分享
- **结营报告** → 更名「**个人营期报告**」，由数据指标自动生成、随时可看
- **结营统计**（营养师端聚合）

### 4.4 全新模块（v1 完全没有）

| 模块 | 说明 | 关键文件 |
|---|---|---|
| **积分商城** | 商品 CRUD、兑换（限兑次数/库存/积分）、按营期绑定、下架二次确认、兑换记录 | `PointsMallView` / `PointsDetailView` |
| **发放中心** | 发货（收件人面单式）+ 兑换记录台账（账本流水行），合并积分兑换+连续打卡领取 | `FulfillmentCenterView` |
| **企业汇报版** | 匿名聚合数据报告，可直接发 HR | `EnterpriseReportView` |
| **PDF 导出** | `exportReport()`：普通浏览器 PDF、微信内长图长按保存；3x 高清自适应 | `lib/exportPDF.ts` |
| **教练运动批注** | `coachComment/coachName/coachScore`（v1 运动批注字段为 dietitian*，v2 改为教练维度） | `ExerciseRecord` |
| **手动加减分** | 营养师补录线下打卡积分 | `ManualScoreRecord` |
| **活动配置开关** | 开关联动学员端入口显隐 | `getHasActivity` |

### 4.5 核心交互机制变更

- **批注人身份**：三条打卡记录（体重/运动/饮食）的批注均记录批注人姓名（`dietitianName`/`coachName`），学员端展示不重复加「营养师/」前缀（种子姓名已含角色词）。
- **已读机制**（`commentRead`）：学员**看到**批注才置为已读（展开日期分组时标记），未展开不算已读；反馈按钮同时置已读。
- **学员反馈**（`studentFeedback`：`received`/`helpful`）。
- **RewardClaim** 新增 `deliveryMethod`（`shipped`/`in-person`）与 `addressEdited`（仅未发货前可编辑一次收货地址）。
- **`PointExchangeRecord`** 新增 `cancelledAt`（取消时间，取消时可追溯）。
- **`PointProduct`** 新增 `maxExchange`（每人限兑次数，0/未设置=不限）与 `campId`（未设置=全局共享）。
- **`CoachActivityRecord`** 新增 `campIds`（空=全部营期可见）。
- **积分/库存口径**：商城 `stock` = 剩余可发量（领取减/取消加/发货不动）；`pointsSpent` 为消耗积分，兑换记录/积分明细都展示扣分。

### 4.6 状态机

- **RewardClaim.status**：`confirmed`（仅活动奖励，营养师审核通过）→ `pending`（学员领取待发货）→ `shipped`（已发货，含单号）/ `in-person`（已线下发放）。
- **PointExchangeRecord.status**：`pending` → `fulfilled` / `cancelled`（取消写入 `cancelledAt`，返还积分与库存）。

### 4.7 报告导出（三端四处统一）

个人历程 / 个人营期报告 / 结营统计 / 企业汇报版。同一入口 `exportReport(el, filename)` 自动适配：
- 普通浏览器（非微信 UA）：html2canvas-pro 截图 → jsPDF A4 分页 → 文件下载。
- 微信内置浏览器（`/MicroMessenger/i`）：生成 PNG 长图全屏预览，提示长按保存到相册（微信无法触发 `a[download]`，但 `<img>` 长按保存两端可用）。
- 高清化：目标 3x 缩放；报告面积超 iOS Safari 画布上限（~1600 万像素）时按 `sqrt` 自适应下调（最低 2x），防 canvas 创建失败白屏。

---

## 5. 关键目录

```
src/
  components/   # 各端页面组件（student/dietitian/coach 及共用）
    FulfillmentCenterView.vue  # 发放中心（营养师端核心）
    DietitianCampSummaryView.vue
    EnterpriseReportView.vue
    CampReportView.vue          # 个人营期报告
    PersonalJourneyView.vue     # 个人历程
  lib/
    exportPDF.ts                # 报告导出（PDF/微信长图双通道）
    camps.ts                    # 营期工具（latestCamp/campDaysOf/campDateRange）
    useTabSwipe.ts              # Tab 左右滑动共享逻辑
    dietitianCounts.ts          # 营养师端 badge 共享 composable
    campReport.ts               # 结营报告/统计/企业报告生成
  store/app.ts                  # 单一 Pinia store（全部数据操作走这里）
  mock/data.ts                  # 种子数据（含 campId 隔离）
  types.ts                      # 全部类型定义（数据字典）
```

> 完整字段字典、接口清单与三端交互流程详见配套 PRD（versiontwo-PRD.docx）。

---

## 6. 部署

- 仓库 `github.com/BAOWEIDONG/versiontwo`，`push main` 触发 `.github/workflows/` 自动 build + GitHub Pages 部署。
- 线上 URL：`https://baoweidong.github.io/versiontwo/`（base path `/versiontwo/`）。
- PWA：`registerSW` + Service Worker 预缓存静态资产。

---

## 7. 已知限制 / 后端对接注意

| 项 | 说明 | 前端现状 |
|---|---|---|
| 数据持久化 | 当前用 `localStorage`（mock/api.ts） | 生产需替换为真实后端接口 |
| 体测数据 | `MOCK_STUDENT_METRIC_VALUES` 按学员静态、不区分营期（v14 决策） | 后端实现时体测数据应按营期归属 |
| 体重双源 | 每日记录体重 vs 体成分数据可能不一致（用户选择不处理） | — |
| 商城资金操作 | 前端走单一咽喉 `exchangePointProduct` + 状态机，但不保证并发原子性 | 生产需服务端原子+幂等+审计 |