# AGENT.md — NOME.AI 开发上下文（浓缩版）

> 本文件是给任何接手此项目的 Agent / 开发者的单一上下文入口。
> 完整细节见 `prd/`（PRD + 接口契约）与 `stitch-prompts/`（Stitch 设计稿），本文件只给"立刻能干活"的最小必要信息。

---

## 0. TL;DR

- **产品**：NOME.AI = AI 私教，面向 A-Level / IELTS 备考学生。核心差异：普通 AI 解决"这道题怎么做"，NOME.AI 解决"为什么这个学生没学会，以及怎样让他真正改变"。
- **当前阶段**：**纯前端，无后端**。所有数据由 `frontend/js/mock-data.js` 驱动；后端就绪后只需把数据获取从 Mock 换成 `fetch(/api/v1/...)`，页面代码不动。
- **已实现**：教师端（6 页 + 设置页），含双语（中/EN）、动效、完整交互。**学生端 7 页尚未实现。**
- **技术栈**：原生 HTML/CSS/JS（**无框架、无构建步骤**）。Hash 路由 SPA。CSS 变量设计系统。内联 SVG 图标。手写 SVG 图表。
- **品牌名**：`NOME.AI`（Not Only Me + Know Me 谐音）。中文名未定（"诺米"已注册，"诺墨"备选），**当前只用英文名**，不得翻译品牌名。
- **仓库**：https://github.com/Amory-ZDF/NOME.AI （`Teacher_Frontend/` 目录）

---

## 1. 产品边界与核心概念

**三端形态**（当前只做了 Web 教师端）：
- Web 教师端：备课、数据看板、深度批改主阵地 ← **已实现**
- iPad 学生端：手写做题、笔记标注、沉浸式学习 ← **待实现**
- 手机端：任务提醒、碎片学习、状态查看、情绪支持

**动态学生模型**（贯穿全产品）：基于学生测验/行动特征 + 教师评价，建立带"证据、时间、置信度"的动态标签，不固定人格。标签分四类数据来源（练习行为、作业结果、教师输入、自评/状态）。

**优先级标注**：P0（核心必做）/ P1（重要）/ P2（增强）。Mock 与 UI 中均按此标注。

**错因分类（7 类，贯穿学生端）**：knowledge 知识 / method 方法 / calculation 计算 / reading 审题 / execution 执行 / expression 表达 / habit 习惯。

**渐进式解答（6 层，做题页核心交互）**：
1 确认题意 → 2 提示知识点 → 3 提示方法 → 4 展示关键步骤 → 5 完整过程 → 6 变式题自测。系统记录学生在哪层解决问题，用于判断独立能力。

---

## 2. 技术架构

```
frontend/
├── index.html              # 入口，按序加载 common.js → i18n.js → mock-data.js → 各 page → serve 启动
├── serve.js                # Node 原生 http 静态服务器（无需 npm install）
├── css/
│   ├── design-system.css   # 设计 token、组件样式、动效
│   └── layout.css          # 页面布局、响应式、侧滑/模态
└── js/
    ├── common.js           # App 框架、Router(hash)、SidePanel、Modal、Toast、Icons、$
    ├── i18n.js             # I18n 模块：t(key)、toggle()、current()、持久化 localStorage 'nome-lang'
    ├── mock-data.js        # MockData 对象：所有页面数据来源（与 api-contract.md 同构）
    └── pages/
        ├── dashboard.js    # 工作台
        ├── calendar.js     # 课程日历
        ├── assignments.js  # 作业管理（含批改模态）
        ├── students.js     # 学生列表
        ├── student-profile.js # 学生档案详情
        ├── reports.js      # 数据报告
        ├── settings.js     # 设置（语言切换）
        └── not-found.js
```

**关键约定**：
- 每个页面 = 一个 `Pages.xxx()` 返回 HTML 字符串 + 可选 `Pages.xxx_init()` 绑定事件（router 在渲染后 `setTimeout(0)` 调用）。
- 全局暴露：`App, Router, Icons, Toast, SlidePanel, Modal, $, $$, createElement, t, I18n, MockData`。
- 新增页面三步走：① `pages/xxx.js` 定义 `Pages.xxx`；② `index.html` 加 `<script>`；③ `common.js` 的 `handleRoute` 已用 `Pages[route]` 动态分发，无需改路由表。

---

## 3. 设计系统速查（详见 `prd/DESIGN.md`）

| Token | 值 | 用途 |
|-------|-----|------|
| `--warm-paper` | `#FAFAF8` | 页面背景（暖白，非纯白） |
| `--pure-surface` | `#FFFFFF` | 卡片填充 |
| `--deep-ink` | `#1C1917` | 主文字（暖黑，非 #000） |
| `--warm-stone` | `#78716C` | 次要文字 |
| `--whisper-line` | `rgba(231,229,228,0.6)` | 边框/分割线 |
| `--deep-teal` | `#0D9488` | **唯一强调色**（CTA/active/进度/focus） |
| `--teal-tint` | `#F0FDFA` | 强调色浅底（hover/选中） |
| `--alert-amber` | `#D97706` | 警示/逾期/压力（功能色，仅数据场景） |
| `--success-green` | `#059669` | 正确/完成 |
| `--error-red` | `#DC2626` | 错误/危险 |

- **字体**：英文 Satoshi，中文 MiSans，数字 JetBrains Mono（已通过 `--font-display` 注入）。**禁用 Inter、系统默认字体、衬线体。**
- **动效**：弹簧物理 stiffness 100 / damping 20；仅动画 `transform`/`opacity`；列表 staggered 入场（50ms 间隔）；尊重 `prefers-reduced-motion`。
- **反模式（硬禁）**：纯黑、紫蓝霓虹、渐变文字、3 列等宽卡片、嵌套卡片、emoji（UI 内）、em dash（—）、占位名（用真实中文名如"李明/王雅静"）、整数（用 78%/63% 之类真实数据）。
- **已修 Bug 提醒**：`.card-title svg` 必须显式 `width/height`（现 1.125rem + flex-shrink:0），否则 SVG 撑满容器导致标题文字竖排。

---

## 4. 已实现：教师端页面清单

| 路由(hash) | 文件 | 核心内容 | 关键交互 |
|-----------|------|---------|---------|
| `#dashboard` | dashboard.js | 待处理事件条 + 今日课程 + 作业(待批改N份) + 学生动态预警 | 待处理卡跳转；课程块→侧滑大纲；学生预警→档案 |
| `#calendar` | calendar.js | 周/月视图课程日历 | 周/月切换；课程块→侧滑（大纲/作业/历史） |
| `#assignments` | assignments.js | 按作业/按学生双视图 + 批改模态 | 行点击→60/40 批改界面（AI 纠错标注 + 错因标签 + AI 建议） |
| `#students` | students.js | 学生卡片网格 + 搜索/筛选/排序 | 卡片→`#student/:id` 档案 |
| `#student/:id` | student-profile.js | 压力仪表盘 + 知识图谱 + 动态标签(含置信度) + 短/长期反馈 + AI 建议 | 标签 hover 看证据；建议采纳/忽略；图谱节点点击 |
| `#reports` | reports.js | 成绩趋势 + 错因分布 + 关注列表 | 纯 SVG 图表；Tab 切换 |
| `#settings` | settings.js | 语言切换(中/EN 大卡片) + 通知开关 | 切换调用 `I18n.toggle()` |

顶栏统一含 `App.renderLangToggle()`（中/EN 切换）。语言切换重渲染整个 App（含 sidebar），无刷新。

---

## 5. 待开发：学生端页面清单（见 `prd/student-prd.md`）

| 路由(建议) | 页面 | 核心内容 |
|-----------|------|---------|
| `#s/home` | 主页 | 任务列表(优先级排序) + 笔记/练习/总结/错题 4 模块 + 学习状态 + 知识热力图 |
| `#s/practice/:id` | 做题页 | 60/40 分屏 + 6 层渐进式提示 + 提示使用追踪 |
| `#s/summary/:id` | 学后总结 | 成绩 + 错因分析 + 知识关联 + 错题卡 + 下一步建议 |
| `#s/mistakes` | 错题本 | 状态追踪 + 重做模式(无提示) + 筛选排序 |
| `#s/notes` | 笔记管理 | 三栏(文件夹树/列表/详情) + 富文本 + AI 自动分类 + 一键整理 |
| `#s/bank` | 题库 | 多维筛选 + 智能推荐 + 上传试卷自动拆题 |
| `#s/profile` | 学习档案 | 知识图谱(可交互) + 进步轨迹 + 错误模式 + 成就 + 语气调节(温和↔严格) |

学生端形态：iPad 优先，顶部导航（非左侧栏），单列流，密度更透气（4/10）。

---

## 6. 接口契约（详见 `prd/api-contract.md`）

- **Base URL**: `/api/v1` ｜ 认证 `Authorization: Bearer <token>`（未接）｜ 时间 ISO 8601 ｜ 分页 `?page&pageSize` ｜ 响应 `{ code, message, data }`
- **教师端 15 端点**：dashboard 聚合 / calendar 列表 / outline 生成 / assignments 列表·提交·批改 / students 列表·档案·标签·反馈·建议 / reports 概览·趋势·错因
- **学生端 13 端点**：home 聚合 / tasks / practice(答题·提示解锁·提交) / summary / mistakes(列表·重做·标记) / notes(文件夹·CRUD·上传识别·AI整理) / bank(筛选·推荐·上传) / profile / settings
- 文档末尾附"前端 Mock 对应关系"表，标明每个 Mock 模块对应哪个接口。

---

## 7. 开发约定（接手必读）

1. **文案全部走 i18n**：用 `t('namespace.key')`，中文在 `i18n.js` 的 `zh` 对象，英文在 `en`。**NOME.AI 不翻译**。新增文案两语言都要加。
2. **新增图标用 `Icons.xxx`**（common.js 内联 SVG 库），标题内 SVG 必须显式尺寸。
3. **颜色只用设计 token 变量**，勿硬编码色值。
4. **动效用 CSS 变量 `--duration-*` + transform/opacity`**，勿动画 layout 属性。
5. **Mock 数据在 `mock-data.js`**，结构对齐 api-contract，后端接入时整体替换此文件。
6. **真实中文姓名 + 真实百分比数据**，禁用占位名/整数。

---

## 8. 启动与同步

```bash
cd frontend
node serve.js          # 默认 http://localhost:8765
PORT=8888 node serve.js  # 自定义端口
```
- 本地工作副本：`/Users/amory/WorkBuddy/飞书AI/frontend`
- GitHub（ssh）：`git@github.com:Amory-ZDF/NOME.AI.git`，产物在 `Teacher_Frontend/`

---

## 9. 下一步建议优先级

1. **学生端 7 页**（产品闭环必须，当前最大缺口）
2. **后端接入**：实现 `api-contract.md` 的 28 端点，替换 `mock-data.js`
3. ** charts 升级**：教师端报告页手写 SVG 可换 Recharts/ECharts 增强交互
4. **空/加载态**：骨架屏接入各页面（设计系统已定义 shimmer 规范）
