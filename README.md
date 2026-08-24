# 营养减重训练营 H5（Vue 3 + Vant）

28 天营养减重训练营 H5 原型。由原 React 版迁移至 Vue 3，并采用 Vant 4 作为 UI 组件库，布局与交互效果保持一致。

## 在线预览

- **H5 预览**：<https://baoweidong.github.io/versiontwo/>
- **仓库地址**：<https://github.com/BAOWEIDONG/versiontwo>

> 手机浏览器直接打开预览链接即可体验。支持 PWA，可"添加到主屏幕"作为独立应用使用。

## 技术栈

- Vue 3.5（`<script setup>` + TypeScript）
- Vite 6
- Pinia（全局状态，替换原 React Context）
- **Vant 4**（UI 组件库：Button / Field / NavBar / Tabbar / Popup / Checkbox / Radio / ImagePreview / Dialog / Toast 等）
- Tailwind CSS v4（自定义样式 + 覆盖 Vant 默认样式）
- lucide-vue-next（图标）
- date-fns（日期）
- vite-plugin-pwa（PWA 离线缓存 + 可安装）

## 本地运行

```bash
npm install
npm run dev      # 开发服务器 http://localhost:3000
npm run build    # 生产构建
npm run lint     # vue-tsc 类型检查
```

> 注意：
> - 需先安装 Node.js（v18+，本项目用 v22）。
> - **路径不要含中文**（Windows 上中文路径会让 npm 装 esbuild/rollup 时崩溃），解压到纯英文目录再 `npm install`。
> - 如曾在其他环境装过依赖导致平台不匹配，执行 `rm -rf node_modules package-lock.json && npm install` 重装。
> - 沙箱（Linux）安装的 `node_modules` 不能给 macOS 使用（rollup/esbuild 原生二进制平台不匹配），需在目标平台重新安装。

## 部署

项目已配置 GitHub Actions 自动部署（`.github/workflows/deploy.yml`），推送到 `main` 分支即自动构建并发布到 GitHub Pages。

- 构建产物：`dist/`
- Pages Base Path：`/versiontwo/`
- PWA manifest：`public/` 下的 icon-192 / icon-512 / icon-maskable 图标

## 目录结构

```
src/
├─ App.vue              # 视图路由切换（viewMap + <component :is>）+ 全局 VideoPreview
├─ main.ts              # 入口：创建 app、注册 Pinia、v-focus 指令
├─ store/app.ts         # Pinia store（状态 + 动作，接 api 层）
├─ composables/
│  └─ useDateGrouping.ts # 日期分组工具（按天聚类打卡记录，展开/折叠）
├─ lib/
│  ├─ api.ts            # API 层：USE_MOCK 开关 + fetch 封装 + 各模块接口
│  ├─ scoring.ts        # 积分计算与排名（含 JSDoc 业务规则）
│  ├─ streak.ts         # 连续打卡计算（isDayComplete / calculateStreak）
│  ├─ campReport.ts     # 结营报告核心计算引擎（指标变化/打卡统计/成就/营养师聚合）
│  ├─ journey.ts        # 个人历程过程数据引擎（每日打卡/饮食得分/周统计/运动分类）
│  ├─ campActivities.ts # ★ 趣味活动计算引擎（阶梯减重/每周挑战/全勤抽奖）
│  ├─ confetti.ts       # ★ 打卡庆典特效（纯 Canvas，零依赖，6种主题+金箔雨）
│  ├─ exportImage.ts    # ★ 报告导出为 PNG 长图（动态加载 html2canvas）
│  ├─ videoCompress.ts  # ★ 视频压缩（Canvas+MediaRecorder，目标15MB，递归压缩）
│  ├─ medicalData.ts    # 体检指标 mock + 异常检测（isValueOutOfRange）
│  ├─ motivationalQuotes.ts
│  └─ utils.ts          # cn() 类名合并、formatDateTime
├─ mock/data.ts         # mock 学员/饮食/运动/体重/活动/指标数据
├─ types.ts             # 类型定义（含结营报告+积分商城+趣味活动全套类型）
└─ components/
   ├─ ui/               # Button/Input/NavBar/Card/WeightTrendChart/ChartRulePopup/GenderAvatar
   └─ *.vue             # 视图组件（学员/教练/营养师三端）
```

---

## 本期更新内容（对比结营报告版本）

### 一、新增：教练端学员详情（CoachStudentDetailView.vue）

教练端新增学员详情页，4 个 Tab 页签：运动打卡（查看+批注+打分 0/1/2）、体重趋势（SVG 折线图）、基础医疗（体成分指标）、自查问卷。支持营期切换。

> 教练批注功能在结营报告版本中曾被移除，本期恢复并增强。`ExerciseRecord` 恢复 `coachComment` / `coachScore` 字段，营养师端运动 Tab 改为只读。

### 二、新增：趣味活动系统（第二条激励赛道）

独立的打卡激励体系，与积分排名并行运行，不产生积分扣减。计算引擎为 `campActivities.ts`（纯函数）。

- **阶梯减重达标奖**：3% / 5% 两档，对比营期初始体重，以历史最低体重防作弊，达到即锁定
- **每周主题挑战**：8 周模板循环（饮水/步数/早睡/断糖/运动/蔬果/冥想/综合），以学员首次打卡日为起点，可配置起始日期和周数
- **全勤幸运抽奖**：完成率 ≥ 80% 即可参与，分母取营期配置天数

营养师端（ActivityAdminView）按营期独立配置 4 个活动开关，查看全员达标进度。学员端（CampActivitiesView + ActivityHubView）查看活动进度、领取奖励。

### 三、新增：积分商城系统

完整商品管理 + 兑换 + 发货流程。积分从排行榜总积分扣减（`getStudentMallPoints = max(0, 总积分 - 非取消的已消耗积分)`）。营养师端（PointsMallView）增删改商品、库存管理、配送方式（邮寄/线下）。学员兑换后扣积分扣库存，营养师在发货中心（FulfillmentCenterView）统一发货，学员取消时自动恢复库存和积分。

### 四、新增：消息中心（MessagesView.vue）

三类消息聚合：批注消息（营养师/教练批注推送，`commentRead` 已读追踪，点击跳转对应打卡页）、奖励消息（领取/发货/线下发放状态变更）、排名消息（排名变动）。localStorage `camp_msg_seen` 按用户 ID 存储已读状态，支持未读计数徽章、下拉刷新。

### 五、新增：多营期数据隔离

所有打卡记录新增 `campId` 字段，store 提供 `getCamp*` 系列方法按营期精确过滤（`getCampDietRecords` / `getCampExerciseRecords` / `getCampWeightRecords` / `getCampRewardTiers` / `getCampRewardClaims` / `getCampCoachActivities`）。学员端全局营期切换器，切换后所有数据按营期过滤。`getStudentCamps(studentId)` 获取学员参与的所有营期。

### 六、新增：打卡庆典特效（confetti.ts）

纯 Canvas + DOM 零依赖，6 种打卡类型主题（饮食/运动/体重/全勤/连续/达标）+ 奖励金箔主题。5 个爆发点 + 金箔雨 + 礼花炮，含震动反馈（`navigator.vibrate`）。

### 七、新增：报告导出与视频压缩

- **exportImage.ts**：报告页导出为 PNG 长图，动态加载 html2canvas，降级 `window.print()`
- **videoCompress.ts**：视频压缩（Canvas + MediaRecorder），目标 15MB，递归压缩至达标

### 八、新增：运动强度渐变滑块

ExerciseView 运动打卡强度选择器改为 1-5 级渐变滑块（蓝->绿->黄->橙->红），支持点击和滑动两种交互，选中时有粒子迸发动画，各级别有独立的颜色/标签/描述/示例。

### 九、新增：UI 组件

WeightTrendChart（可复用体重趋势 SVG 折线图）、ChartRulePopup（图表计算规则说明弹窗）、GenderAvatar（性别卡通头像）、CampStatsView（营期统计，个体/平均对比）、EnterpriseReportView（企业汇报版匿名聚合报告）。

### 十、新增：登录持久化与账户管理

`restoreAuth()` localStorage 登录态恢复（30 天过期）、`updateUserProfile()` 更新用户资料。Account 类型支持手机号登录 + 多营期 `campIds`。

### 十一、types.ts 关键新增

`Camp`（营期定义）、`Account`（手机号登录+多营期）、`ManualScoreRecord`（营养师手动加减分）、`PointProduct` / `PointExchangeRecord`（积分商城）、`EnterpriseCampReport`（企业汇报版）。所有打卡记录新增 `studentFeedback`（学员反馈）、`commentRead`（已读追踪）。`DietRecord` 新增 `hasStaple` / `hasProtein` / `hasVegetable`（餐次结构标签）。`ExerciseRecord` 恢复 `coachComment` / `coachScore`。`RewardTier` 新增 `campId` / `source` / `activityType` / `deliveryMethods`。

---

## 数据展示与计算逻辑说明

### 1. "完成当天"定义

> **完成当天 = 早餐 ✓ + 午餐 ✓ + 晚餐 ✓ + 运动 ✓（四项缺一不可）**

来源：`streak.ts` → `isDayComplete(date, exerciseRecords, dietRecords)`

- 早餐/午餐/晚餐：当天对应 meal 类型的 DietRecord 存在
- 运动：当天 ExerciseRecord 存在（不限时长）
- 加餐（snack）不计入"完成当天"判定

### 2. 打卡天数 vs 完成天数

| 指标 | 定义 |
|------|------|
| 打卡天数（totalCheckinDays） | 有任意打卡记录（饮食/运动/体重）的不同日期数 |
| 完成天数（completeDays） | 四项全部完成（三餐+运动）的天数 |
| 完成率（completionRate） | completeDays / campDays（campDays 默认 28） |

### 3. 连续打卡天数

| 指标 | 定义 |
|------|------|
| 当前连续（currentStreak） | 从今天往前数，连续"完成当天"的天数 |
| 最长连续（longestStreak） | 整个营期内最长的连续"完成当天"记录 |

来源：`streak.ts` → `calculateStreak()`（当前连续）；`campReport.ts` → `computeCheckinStats()`（最长连续，遍历所有打卡日期计算）

### 4. 体重趋势

- 数据来源：学员的 `WeightRecord` 列表
- 自动按日期排序
- 趋势判断：`decreasing`（末值 < 首值，减重）、`increasing`（增重）、`stable`（变化 < 0.1kg）、`insufficient`（少于 2 条记录）
- 变化百分比 = `(endWeight - startWeight) / |startWeight| * 100`

### 5. 指标改善判定

每个指标有改善方向（`METRIC_DIRECTION` 映射表）：

- `lower`（越低越好）：体重、脂肪量、腰臀比、内脏脂肪面积、肥胖度、浮肿指数、肝功能酶类、肾功能、血脂（除 HDL）、血糖
- `higher`（越高越好）：肌肉量、骨骼肌、基础代谢率、身体细胞量、四肢骨骼肌质量指数、AINST 评分、高密度脂蛋白胆固醇、总蛋白、白蛋白、前白蛋白

改善条件（满足任一）：
1. 变化方向与好方向一致且变化量 ≠ 0
2. 异常 → 正常转化（`turnedNormal`）

异常检测来源：`medicalData.ts` → `isValueOutOfRange(value, range, gender)`，支持性别差异化参考区间。

### 6. 成就系统（14 项，自动判定）

| 成就 ID | 标题 | 解锁条件 |
|---------|------|----------|
| streak_7 | 连续打卡达人 | 最长连续完成 ≥ 7 天 |
| streak_14 | 坚持不懈 | 最长连续完成 ≥ 14 天 |
| streak_28 | 全勤先锋 | 最长连续完成 ≥ 28 天 |
| weight_loss_3 | 减重之星 | 体重减少 ≥ 3 kg |
| weight_loss_5 | 减重冠军 | 体重减少 ≥ 5 kg |
| fat_loss | 燃脂勇士 | 脂肪量减少 ≥ 2 kg |
| muscle_gain | 肌肉增强 | 肌肉量增加 |
| bmr_up | 代谢提升 | 基础代谢率提升 |
| visceral_fat | 内脏脂肪改善 | 内脏脂肪面积下降 |
| abnormal_improved | 健康改善 | 异常指标数量减少 |
| abnormal_cleared | 全部达标 | 所有异常指标恢复正常 |
| exercise_800 | 运动健将 | 累计运动时长 ≥ 800 分钟 |
| diet_90 | 饮食自律 | 完成率 ≥ 90% |
| perfect_transform | 完美蜕变 | 体重下降 + 脂肪下降 + 肌肉增长 |

成就解锁状态在 `generateStudentReport()` 中根据数据自动判定，无需手动设置。

### 7. 有效人数（营养师端统计）

> **有效学员 = 至少有一项"身体测量数据"分类的指标同时有 beforeValue 和 afterValue（均为数值型）**

所有平均值（平均体重变化、平均完成率、平均打卡天数、平均异常改善数）均以有效人数为分母。未录入前后体成分数据的学员不参与聚合统计，但仍在学员列表中展示（无"有效"徽章）。

### 8. 每周打卡完成率（个人历程）

- 按自然周分组（周一至周日，`date-fns` 的 `startOfWeek` / `endOfWeek`）
- 分母 = 该周在营期内的实际天数（非打卡天数）
- 分子 = 该周内"完成当天"的天数
- 例如：某周只有 3 天在营期内，其中 2 天完成 → 完成率 = 2/3 = 67%

### 9. 每日饮食得分

- 数据来源：DietRecord 中的 `dietitianScore` 字段（-1 / 0 / 1）
- 每日得分 = min(Σ 当日所有饮食记录的 dietitianScore, 3)
- 每日封顶 3 分，最低不限
- 未被营养师批注的记录默认 dietitianScore = 1
- 来源：`scoring.ts` → `calculateDietScore(dietRecords)`

### 10. 打卡热力图

- 范围：从学员首次打卡日期到今天
- 每日完成项数（0-4）：早餐 + 午餐 + 晚餐 + 运动
- 颜色分级：0 项（灰色）、1 项（浅绿）、2 项（中绿）、3 项（深绿）、4 项（最深绿）

---

## 三端数据连通性

### 数据流向图

```
学员打卡                    营养师批注                    学员查看
────────                    ──────────                    ─────────
DietRecord ──────────────→ dietitianComment              DietView（历史打卡与批注）
  (饮食打卡)               dietitianScore (-1/0/1)        CalendarView（日历详情）
                           dietitianName                  PointsDetailView（积分明细）
                           dietitianCommentDate           DietitianStudentDetailView

ExerciseRecord ──────────→ 教练批注（coachComment/coachScore）       ExerciseView（运动打卡）
  (运动打卡)                                              CalendarView
                                                          PointsDetailView
                                                          DietitianStudentDetailView

WeightRecord ────────────→ （营养师只读查看）              WeightCheckinView
  (体重打卡)                                              DietitianStudentDetailView

教练发布                    学员浏览
──────────                  ─────────
CoachActivityRecord ─────→ ActivitiesListView → ActivityCard
  (锻炼活动)                StudentDashboard（锻炼活动入口）
```

### 角色职责

| 角色 | 可创建 | 可查看 |
|------|--------|--------|
| 学员 | DietRecord、ExerciseRecord、WeightRecord | 自己的所有打卡记录、营养师批注、教练发布的活动、结营报告、个人历程 |
| 营养师 | DietRecord 的批注/打分、MetricConfig 配置、奖励配置 | 所有学员的打卡记录（只读）、学员档案、结营统计 |
| 教练 | CoachActivityRecord（锻炼活动）、ExerciseRecord 批注/打分 | 自己发布的活动列表、学员运动/体重/医疗/问卷 |

### 注意事项

- 营养师和教练之间无直接数据交互。教练可对运动记录批注打分，营养师端运动 Tab 为只读。
- 学员数据通过 `studentId` 字段关联（DietRecord、ExerciseRecord、WeightRecord 均有 `studentId` 可选字段）。
- 结营报告和个人历程的所有统计数据均从原始打卡记录实时计算（computed 属性），不依赖预存结果。
- `MOCK_STUDENT_METRIC_VALUES` 提供了 4 名学员（s1-s4）的体成分前后数据，用于营养师端结营统计演示。

---

## API 层（前后端联调）

`src/lib/api.ts` 统一封装所有接口，`USE_MOCK=true` 时返回本地 mock（原型可独立运行，无需后端）。

### 联调配置

- 当前：`USE_MOCK = true`，使用 `src/mock/data.ts` 的 mock 数据
- 接后端：把 `USE_MOCK` 改为 `false`，在 `API_BASE` 填后端地址（如 `'/api'`），所有 `get*/create*/update*` 会真实 fetch
- store 在 `App.vue onMounted` 调 `init()` 拉取数据；写操作（打卡/批注等）乐观更新本地 + 后台调 `api.create*/update*`
- 上传（运动/饮食/医疗报告/活动图片视频）走 `api.uploadFile`，mock 模式返回 blob URL，真实模式上传到 `/api/upload`

### 接口清单

#### 学员打卡相关

| 方法 | 接口 | 说明 |
|------|------|------|
| GET | `/diet-records?studentId={id}` | 获取学员饮食记录 |
| POST | `/diet-records` | 创建饮食打卡 |
| PATCH | `/diet-records/{id}` | 更新饮食记录（营养师批注/打分） |
| GET | `/exercise-records?studentId={id}` | 获取学员运动记录 |
| POST | `/exercise-records` | 创建运动打卡 |
| GET | `/weight-records?studentId={id}` | 获取学员体重记录 |
| POST | `/weight-records` | 创建体重打卡 |

#### 营养师批注相关

| 方法 | 接口 | 说明 |
|------|------|------|
| PATCH | `/diet-records/{id}` | 营养师批注（dietitianComment / dietitianScore / dietitianName / dietitianCommentDate） |

#### 教练活动相关

| 方法 | 接口 | 说明 |
|------|------|------|
| GET | `/coach-activities` | 获取所有锻炼活动列表 |
| POST | `/coach-activities` | 教练发布锻炼活动 |

#### 结营报告相关（前后端对接说明）

结营报告的数据计算逻辑已封装在 `src/lib/campReport.ts` 和 `src/lib/journey.ts` 中。后端实现时可选择以下两种方式：

**方式 A（推荐）：后端返回原始数据，前端计算**
- 后端实现上述打卡记录接口，返回 DietRecord / ExerciseRecord / WeightRecord 列表
- 前端调用 `generateStudentReport()` / `generateDietitianSummary()` / `generatePersonalJourney()` 实时计算
- 优点：计算逻辑唯一，前后端一致

**方式 B：后端直接返回计算结果**
- 后端实现 `GET /camp/student-report?studentId={id}` 返回 `StudentCampReport` 结构
- 后端实现 `GET /camp/summary` 返回 `DietitianCampSummary` 结构
- 后端实现 `GET /camp/journey?studentId={id}` 返回 `PersonalJourneyData` 结构
- 计算逻辑应与 `campReport.ts` / `journey.ts` 保持一致

#### 奖励配置相关

| 方法 | 接口 | 说明 |
|------|------|------|
| GET | `/reward-tiers` | 获取奖励阶梯列表 |
| POST | `/reward-tiers` | 创建奖励阶梯 |
| PATCH | `/reward-tiers/{id}` | 更新奖励阶梯 |
| DELETE | `/reward-tiers/{id}` | 删除奖励阶梯 |
| GET | `/reward-claims` | 获取领取记录 |
| POST | `/reward-claims` | 创建领取记录 |
| PATCH | `/reward-claims/{id}` | 更新领取记录（发货/填快递单号） |

#### 配置相关

| 方法 | 接口 | 说明 |
|------|------|------|
| GET | `/meal-time-config` | 获取用餐时间配置 |
| PUT | `/meal-time-config` | 更新用餐时间配置 |

#### 文件上传

| 方法 | 接口 | 说明 |
|------|------|------|
| POST | `/upload` | 上传图片/视频（multipart/form-data） |

---

## 角色与主要流程

- **学员**：登录 → 自查问卷 → 首页（打卡任务、排名、营期回顾与指导）→ 运动/饮食/体重打卡 → 日历 → 健康档案（体成分/化验指标/结营报告）→ 个人历程 → 奖励
- **教练**：工作台 -> 发布锻炼活动（图片/视频）-> 学员详情（运动批注/体重趋势/医疗/问卷）-> 查看历史发布
- **营养师**：工作台 → 待批注饮食 → 学员档案（饮食批注打分 / 运动查看 / 基础医疗维护 / 问卷）→ 积分排名与导出 → 结营统计 → 配置管理（指标/用餐时间/奖励）

## Vant 样式覆盖说明

Vant 全量 CSS 在 `src/index.css` 用 `@import "vant/lib/index.css" layer(base)` 引入（**必须放进 `base` 层**，否则无层 CSS 会压过 Tailwind v4 的工具类，导致按钮文字变深色等问题）。各 Vant 组件通过 `.custom-button / .custom-input / .custom-nav / .custom-tabbar / .custom-popup / .custom-checkbox / .custom-radio` 等类覆盖样式，贴近现有设计。

## 注意事项

1. **计算逻辑封装**：`campReport.ts` 和 `journey.ts` 中的所有函数为纯函数，输入原始数据即可得到计算结果，前后端可直接调用，无需修改计算逻辑。
2. **实时计算**：结营报告和个人历程的统计数据均为 computed 属性实时计算，随打卡数据动态变化，不依赖预存结果。
3. **有效人数**：营养师端结营统计的所有平均值均以"有效人数"（有前后体成分数据的学员）为分母，非参营总人数。
4. **自然周统计**：每周打卡完成率按自然周（周一至周日）分组，分母为该周在营期内的实际天数。
5. **PDF 导出**：通过 `window.print()` + `@media print` CSS 实现，导出时会隐藏导航栏、按钮等非内容元素。
6. **教练角色**：教练可发布锻炼活动，也可查看学员详情并对运动记录批注打分（0/1/2）。营养师端运动 Tab 为只读。
7. **mock 数据**：`MOCK_STUDENT_METRIC_VALUES` 提供了 4 名学员（s1-s4）的体成分前后数据，s2/s3/s4 另有历史打卡记录，用于结营统计和个人历程的完整演示。

## 备注

本项目由 React 版迁移而来，现为 Vue 3 + Vant 实现。依赖已清理（移除了原 AI Studio 模板残留的 express/dotenv/autoprefixer/tsx 等）。
