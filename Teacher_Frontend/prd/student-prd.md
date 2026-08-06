# NOME.AI — 学生端开发 PRD

> Version: 1.0 | Date: 2026-08-05 | Platform: Web (Desktop + iPad 适配)
>
> 本文档面向 Coding Agent，包含所有页面的结构、交互、数据模型和 API 需求。
> 设计系统规范请参考 DESIGN.md（同目录下）。

---

## 0. 全局信息

### 0.1 产品定位
NOME.AI学生端让学生随时知道：
1. 我现在最应该做什么？
2. 我为什么错？
3. 我是否真的在进步？

核心差异化：不是直接给答案，而是渐进式引导学生自己思考。不是冷冰冰的刷题工具，而是"知道我为什么不会"的私教。

### 0.2 技术栈建议
- 前端框架: React 18+ / Next.js 14+
- 样式: Tailwind CSS + CSS Variables
- 动画: Framer Motion（spring physics: stiffness 100, damping 20）
- 图表: Recharts
- 富文本编辑器: Tiptap 或 Slate.js（笔记功能）
- 数学公式渲染: KaTeX 或 MathJax
- 状态管理: Zustand + React Query

### 0.3 路由结构
```
/student
├── /                     # 主页面（首页）
├── /tasks                # 任务列表（完整版）
├── /exercise/:taskId     # 做题页面
├── /summary/:sessionId   # 学后总结
├── /errors               # 错题本
├── /errors/review/:id    # 错题重做
├── /notes                # 笔记管理
├── /notes/:id            # 笔记详情
├── /bank                 # 题库
├── /bank/exercise/:qId   # 题库做题
├── /profile              # 个人学习档案
└── /settings             # 设置
```

### 0.4 全局布局
- 顶部导航栏（非侧边栏），学生端是内容导向的
- 内容区域 `max-width: 800px` 居中（部分页面如笔记、题库可以更宽）
- 页面背景 `#FAFAF8`（Warm Paper）
- 卡片: `#FFFFFF` 背景，1px Whisper Line border，`border-radius: 0.75rem`

### 0.5 顶部导航栏 TopNav
- 高度: 3.5rem，背景 `#FFFFFF`，底部 1px Whisper Line border
- 左侧: "NOME.AI" logo（Satoshi 600, Deep Ink）
- 中间: 导航链接 — 首页 / 任务 / 笔记 / 题库 / 我的
  - active: Deep Teal 底部 2px underline
  - inactive: Warm Stone 文字，hover 变 Deep Ink
- 右侧: 通知铃铛 + 学生头像(32px 圆形)
- 移动端: 中间导航折叠为汉堡菜单

### 0.6 全局动画
- 所有卡片: staggered 入场（50ms 间隔，translateY(8px) + opacity fade）
- 页面切换: 200ms ease-out-quart，opacity + translateY(8px)
- 按钮按下: translateY(-1px) spring physics
- 仅动画 transform 和 opacity，不动 layout 属性

---

## 1. 学生主页面 Homepage `/student`

### 1.1 页面概述
学生登录后的首页，核心是"我现在最应该做什么"。

### 1.2 页面结构

```
┌──────────────────────────────────────────┐
│ TopNav: NOME.AI | 首页 任务 笔记 题库 我的 | 🔔 👤 │
├──────────────────────────────────────────┤
│ 早上好, 张三                               │
│ 今天是8月5日 周二, 你有 3 项待完成任务       │
│ "三角函数的正确率提升了12%, 继续保持"        │
├──────────────────────────────────────────┤
│ [任务列表]                    全部任务 →    │
│ ☐ 数学P3 Ch7复习  45min 截止22:00 王老师  │
│ ☐ IELTS Reading 剑18T2  30min 明天截止   │
│ ☐ 错题复盘 3道    20min  无截止           │
├───────────┬───────────┬─────────┬────────┤
│  📝 笔记   │  📖 课后练习 │  📊 总结 │ 📌错题│
│  28篇     │  本周12题   │  78%   │ 3待复盘│
├───────────┴───────────┴─────────┴────────┤
│ [我的学习]                    完整档案 →    │
│ 掌握度 62%  | 本周12/15  | 薄弱: 三角函数  │
│ [知识热力图 ▓▓░▓▓░░ ░▓▓░▓░░ ▓░▓▓░░░ ░░▓░░░]│
└──────────────────────────────────────────┘
```

### 1.3 模块详情

#### 问候区 Greeting
- "早上好/下午好/晚上好, {name}"（根据时间段变化）
- 日期 + 待完成任务数
- **激励语**: 从 AI 获取一条基于最近学习数据的正面反馈（如"三角函数正确率提升12%"），italic Warm Stone
- 如果没有数据，显示通用鼓励语
- **API**: `GET /api/student/greeting` → `{ message: string, pendingTasks: number }`

#### 任务列表 TaskList（核心模块）
- **位置**: 页面最上方，视觉权重最大
- **卡片标题**: "任务列表" + "全部任务 →" 链接
- **任务项结构**:
  ```
  [checkbox] [标题]                    [科目badge] [优先级badge]
             [预计时间 · 截止时间 · 来源]
             [上次正确率提示(可选)]
  ```
- **排序规则**:
  1. 教师布置的任务优先于 AI 推荐
  2. 同优先级内按截止时间排序（紧急在前）
  3. 逾期任务排在最前，带 Alert Amber "已逾期" badge
- **Checkbox 交互**: 点击标记完成（带 spring 动画），完成后任务变灰 + 删除线，1秒延迟后从列表移除
- **行点击**: 跳转到对应的做题页面 `/student/exercise/{taskId}`
- **"无法完成"反馈**: 长按或右滑任务可标记"无法完成"，系统会向教师发送调整建议
- **空状态**: "今日任务全部完成" + 庆祝图标 + "去题库刷题 →" 链接
- **API**: `GET /api/student/tasks/today` + `PUT /api/student/tasks/{id}/complete` + `POST /api/student/tasks/{id}/cannot-complete`

#### 功能模块卡 ModuleCards
- **布局**: 2x2 网格（移动端 2 列保持）
- **4 张卡片**: 笔记 / 课后练习 / 学后总结 / 错题本
- **卡片结构**: 图标(1.5rem Deep Teal) + 标题(1rem/600) + 描述(0.75rem Warm Stone) + 统计数据(Mono)
- **Hover**: Teal Tint 背景 + cursor pointer
- **点击**: 跳转到对应页面

#### 我的学习 LearningStatus
- **3 列数据**: 知识掌握度(%) | 本周任务完成 | 薄弱知识点
- **知识热力图**: 7列 x 4行的小方块网格
  - 每个方块代表一个知识模块
  - 颜色: Deep Teal(掌握) → 浅 Teal(良好) → Amber(薄弱) → Red(严重不足)
  - Hover 显示具体知识点名称和掌握度
- **点击 "查看完整档案 →"**: 跳转 `/student/profile`
- **API**: `GET /api/student/learning-summary`

### 1.4 数据模型

```typescript
interface HomepageData {
  greeting: {
    message: string;
    pendingTasks: number;
  };
  todayTasks: Task[];
  moduleStats: {
    notesCount: number;
    weeklyExercises: number;
    latestAccuracy: number;
    pendingErrorReview: number;
  };
  learningSummary: {
    overallMastery: number;
    weeklyCompleted: number;
    weeklyTotal: number;
    overdueTasks: number;
    weakTopics: string[];
    knowledgeHeatmap: HeatmapCell[];
  };
}

interface Task {
  id: string;
  title: string;
  type: 'teacher_assigned' | 'ai_recommended' | 'error_review';
  subject: string;
  estimatedMinutes: number;
  dueAt?: string;
  assignedBy?: string; // teacher name
  priority: 'P0' | 'P1' | 'P2';
  lastAccuracy?: number;
  isOverdue: boolean;
  status: 'pending' | 'in_progress' | 'completed';
}

interface HeatmapCell {
  topicId: string;
  topicName: string;
  mastery: number; // 0-100
}
```

---

## 2. 做题页面 Exercise `/student/exercise/:taskId`

### 2.1 页面概述
学生实际做题的页面。核心差异化功能：渐进式 AI 提示系统，学生必须先提交自己的尝试，AI 再逐级提供帮助。

### 2.2 页面结构

```
┌──────────────────────────────────────────┐
│ ← 返回    数学P3-Ch7复习练习    23:45  [提交] │
│ ████████░░░░░░░░ 第3题/共8题              │
│ ●●●○○○○○ (question dots)               │
├─────────────────────────┬────────────────┤
│                         │  AI 辅导        │
│  第3题                   │  Level: ●○○○○○ │
│                         │                │
│  已知 f(x)=2x³-5x²+3x-1 │  "请先尝试自己   │
│  求区间[0,2]上的最大值    │   解答这道题"   │
│  和最小值。              │                │
│                         │  [我做好了,检查] │
│  [知识点:微积分-极值]     │  [我需要提示]   │
│  [难度: ★★★☆☆]          │                │
│                         │  ── 提示使用 ──  │
│  ┌─────────────────┐    │  Q1: █ (独立)   │
│  │                 │    │  Q2: ██ (1层)  │
│  │  作答区域         │    │  Q3: ?         │
│  │  (支持公式输入)   │    │                │
│  │                 │    │                │
│  └─────────────────┘    │                │
│  [手写输入] toggle       │                │
└─────────────────────────┴────────────────┘
```

### 2.3 题目区域（左侧 60%）

- **题目编号**: "第 X 题" (Warm Stone 0.75rem)
- **题目内容**: 完整渲染，数学公式用 KaTeX 渲染
- **元数据**: 知识点 badge（Teal Tint）+ 难度星级（Alert Amber ★）
- **作答区域**:
  - 数学: 大号文本域 + 数学公式输入支持 + "手写输入" toggle（iPad 上激活画布）
  - IELTS Reading: 选择题 radio / 填空题 input / 判断题 toggle
  - IELTS Writing: 富文本编辑器（字数统计）
- **题目导航**: 底部 "上一题" / "下一题" 按钮

### 2.4 AI 辅导面板（右侧 40%）

这是产品的核心差异化功能，不是聊天窗口，而是结构化渐进帮助系统。

#### 状态1: 学生尚未提交
- 消息: "请先尝试自己解答这道题" (italic Warm Stone)
- 按钮: "我做好了, 检查答案" (primary) + "我需要提示" (ghost)

#### 状态2: 提交后答案错误 — 渐进式提示解锁

**六层提示体系**:

| 层级 | 名称 | 内容 | 解锁条件 |
|------|------|------|---------|
| L1 | 确认题意 | "这道题要求你找什么？最大值和最小值分别是什么意思？" | 第一次答错自动解锁 |
| L2 | 相关知识点 | "这道题涉及微积分中的极值求解。回忆一下导数与极值的关系。" | 学生点击"解锁下一层" |
| L3 | 解题方法提示 | "尝试对 f(x) 求导，找到临界点。" | 同上 |
| L4 | 关键步骤 | "f'(x) = 6x² - 10x + 3 = 0，解得 x = ... 然后需要比较端点和临界点的函数值。" | 同上 |
| L5 | 完整解答 | 完整的解题过程展示 | 同上 |
| L6 | 变式题 | "现在做一道类似的题来验证你是否真的掌握了" | 答对后解锁 |

- 未解锁的层级: 内容模糊(blur) + 锁图标
- 当前层级: 正常显示，带展开动画（slide-down 200ms）
- 已解锁的层级: 可以回看
- "解锁下一层提示" 按钮: Deep Teal primary
- **每道题记录**: 学生在哪一层解决问题，用于判断独立完成能力和提示依赖程度

#### 状态3: 答案正确
- 成功动画: 克制的 checkmark 动画（不放烟花，不过度游戏化）
- "回答正确!" (Success Green)
- AI 生成的简短总结: "你用了 2 层提示，在方法选择上遇到了困难。建议复习: 微积分 - 极值求解步骤"
- 如果触发了 L6（变式题），显示 "开始变式题" 按钮
- "下一题 →" 按钮

#### 提示使用追踪器
- 面板底部: "提示使用情况"
- 每道题一个小 bar，显示用了几层提示
- 颜色: 无提示=Success Green, 1-2层=Deep Teal, 3-4层=Alert Amber, 5层以上=Error Red
- 这个数据帮助学生自己看到独立性变化

### 2.5 进度条
- 顶部: 细进度条（2px Deep Teal），"第 X 题 / 共 Y 题"
- 下方: 题目圆点导航，completed=filled Deep Teal, current=ring, unanswered=Whisper Line
- 点击圆点可跳转到对应题目

### 2.6 计时器
- 右上角: "已用 XX:XX" (JetBrains Mono Warm Stone)
- 静默计时，不做倒计时压力
- 数据用于分析学生做题速度

### 2.7 提交流程
1. 学生点击 "我做好了, 检查答案" 或 "提交"
2. **防敷衍机制**: 如果作答内容为空或明显敷衍（如随机字符），提示 "请先认真作答"
3. 提交后 AI 判题:
   - 正确 → 显示状态3
   - 错误 → 显示状态2，自动解锁 L1 提示
4. 学生可以修改答案重新提交
5. 所有题目完成后，"提交" 按钮变为可用
6. 提交整套练习 → 跳转到学后总结页

### 2.8 数据模型

```typescript
interface ExerciseSession {
  taskId: string;
  title: string;
  totalQuestions: number;
  currentQuestion: number;
  timeStarted: string;
  questions: Question[];
}

interface Question {
  id: string;
  order: number;
  content: string; // HTML/markdown with math
  type: 'choice' | 'fill_blank' | 'calculation' | 'proof' | 'reading_comprehension' | 'writing';
  subject: string;
  topic: string; // "微积分 - 极值"
  difficulty: 1 | 2 | 3 | 4 | 5;
  options?: string[]; // for choice type
  correctAnswer: string;
  markScheme?: string; // IELTS marking criteria
  studentAttempts: Attempt[];
  hintsUsed: number; // 0-6
  solvedAtHintLevel: number | null; // which hint level they solved it at
  status: 'unanswered' | 'attempted' | 'correct' | 'wrong';
}

interface Attempt {
  answer: string;
  submittedAt: string;
  isCorrect: boolean;
  aiAnalysis?: {
    errorType: ErrorType;
    errorLocation: string;
    explanation: string;
  };
}

interface HintLevel {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  title: string;
  content: string;
  unlocked: boolean;
}
```

---

## 3. 学后总结 Post-Exercise Summary `/student/summary/:sessionId`

### 3.1 页面概述
练习完成后的结果分析页面。帮学生理解"我为什么错"和"接下来做什么"。

### 3.2 页面结构

```
┌──────────────────────────────────────────┐
│ TopNav                                   │
├──────────────────────────────────────────┤
│         ✓ 练习完成!                       │
│         正确率 78%                        │
│         比上次提升 12% ↑                   │
│    用时32min | 独立完成5/8 | 提示0.8次/题   │
├──────────────────────────────────────────┤
│ [错因分析]                                │
│ ████计算40% ███方法30% ██知识20% █审题10%  │
│ ┌─ 第3题 计算错误: 符号运算失误 ────────┐  │
│ │ 你的做法: ...                        │  │
│ │ 正确做法: ...                        │  │
│ │ 知识点: 微积分-导数运算                │  │
│ │ ⚠️ 第2次出现此错误                    │  │
│ └──────────────────────────────────────┘  │
├──────────────────────────────────────────┤
│ [知识关联]                                │
│  (迷你知识图谱)                           │
│  点击查看详细知识图谱 →                     │
├──────────────────────────────────────────┤
│ [错题卡 2张]                              │
│ ┌──────────┐ ┌──────────┐                │
│ │ 错题卡1   │ │ 错题卡2   │                │
│ │ [加入错题本]│ │ [加入错题本]│                │
│ └──────────┘ └──────────┘                │
├──────────────────────────────────────────┤
│ [接下来]                                  │
│ 建议完成1道变式题验证掌握程度               │
│ [开始变式题]  [加入任务列表]                │
│                                          │
│ [返回首页]      查看完整学习档案 →          │
└──────────────────────────────────────────┘
```

### 3.3 模块详情

#### 结果头部
- 居中文本
- "正确率 XX%" 用非常大的 JetBrains Mono (3rem) Deep Teal
- 与上次对比的变化值（Success Green ↑ 或 Alert Amber ↓）
- 3 个快速统计: 用时 / 独立完成数 / 提示使用频率

#### 错因分析
- **错因分布**: 水平堆叠条形图
  - 颜色: 计算错误(Alert Amber), 方法错误(#0EA5E9), 知识错误(Deep Teal), 审题错误(Warm Stone), 执行错误(#8B5CF6)
  - 每段显示百分比
- **错误详情卡**: 每个错误一张卡
  - 错误类型 badge + 题目引用
  - "你的做法" vs "正确做法" 对比
  - 对应知识点（可点击跳转到知识图谱）
  - 重复错误标记: "第 X 次出现" 用 Alert Amber

#### 知识关联
- 迷你知识图谱（本套题涉及的知识点）
- 节点颜色: 本次练习(Deep Teal ring), 已掌握(Green fill), 薄弱(Amber fill)
- 点击 "查看详细知识图谱 →" 跳转 `/student/profile#knowledge-graph`

#### 错题卡
- 每张卡: 题目摘要 + "我错在哪里" + "为什么会错" + "对应知识点" + "是否重复错误"
- 卡片左侧 3px Alert Amber border
- "加入错题本" 按钮（如果未加入）

#### 下一步建议
- AI 生成的推荐行动:
  - 变式题推荐
  - 需要加强的知识点
  - 建议的后续练习
- "开始变式题" (primary Deep Teal)
- "加入任务列表" (ghost)

### 3.4 数据模型

```typescript
interface SessionSummary {
  sessionId: string;
  taskTitle: string;
  completedAt: string;
  totalQuestions: number;
  correctCount: number;
  accuracy: number;
  accuracyChange: number; // vs last session
  timeSpent: number; // minutes
  independentCount: number; // solved without hints
  avgHintsPerQuestion: number;
  errorAnalysis: ErrorAnalysis;
  knowledgeMapping: KnowledgeNode[];
  errorCards: ErrorCard[];
  recommendations: Recommendation[];
}

interface ErrorAnalysis {
  distribution: Record<ErrorType, number>; // percentages
  details: ErrorDetail[];
}

interface ErrorDetail {
  questionNumber: number;
  errorType: ErrorType;
  description: string;
  studentApproach: string;
  correctApproach: string;
  relatedTopic: string;
  topicId: string;
  isRepeat: boolean;
  repeatCount: number;
}

interface ErrorCard {
  questionId: string;
  questionSummary: string;
  whereWrong: string;
  whyWrong: string;
  relatedTopic: string;
  isRepeat: boolean;
  addedToErrorBook: boolean;
}

interface Recommendation {
  type: 'variant_question' | 'topic_review' | 'practice_set';
  message: string;
  actionUrl?: string;
}
```

---

## 4. 错题本 Error Book `/student/errors`

### 4.1 页面概述
所有错题的集合，支持复盘和追踪掌握状态。

### 4.2 页面结构

```
┌──────────────────────────────────────────┐
│ TopNav                                   │
├──────────────────────────────────────────┤
│ 错题本 共15道  [全部|待复盘|已掌握|反复出错] [科目▼] │
├──────────────────────────────────────────┤
│ 待复盘3 | 复习中5 | 已掌握7  掌握率47%      │
├──────────────────────────────────────────┤
│ ┌ [A-Level数学] [计算错误] 7/30 第2次出错 ┐ │
│ │ 已知f(x)=2x³-5x²+3x-1,求最大值...      │ │
│ │ 错误原因: 符号运算失误, 将负号漏掉       │ │
│ │ 知识点: 微积分-导数运算 →               │ │
│ │ [重新做一遍] [查看解析] [标记已掌握]      │ │
│ │                              [待复盘]   │ │
│ └────────────────────────────────────────┘ │
│ ┌ [IELTS] [审题错误] 7/28 第1次出错      ┐ │
│ │ ...                                    │ │
│ └────────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

### 4.3 错题卡片

- 顶部: 科目 badge + 错误类型 badge + 日期(Mono) + 重复次数
- 题目摘要（截断 2 行）
- 错误分析摘要
- 知识点链接（Deep Teal）
- 操作按钮:
  - "重新做一遍" (primary Deep Teal) — 进入重做模式
  - "查看解析" (ghost) — 展开显示完整解析
  - "标记已掌握" (ghost) — 仅在成功重做后可用
- 状态 badge: 待复盘(Amber) / 复习中(Teal) / 已掌握(Green)

### 4.4 重做模式

- 点击 "重新做一遍" → 进入专注的单题界面
- 布局与做题页相同（60/40 分屏）
- **但不提供 AI 提示**，学生必须独立完成
- 提交后:
  - 正确: 庆祝动画 + "这次做对了!" + 显示与上次错误的对比 + 可以标记"已掌握"
  - 错误: 增加重复计数 + 显示与上次错误的对比 + AI 生成针对性分析
- **API**: `POST /api/student/errors/{id}/redo`

### 4.5 筛选与排序
- 筛选 chips: 全部 / 待复盘 / 已掌握 / 反复出错（重复 2 次以上）
- 科目筛选: dropdown
- 排序: 按时间倒序（默认）/ 按错误类型 / 按重复次数

### 4.6 数据模型

```typescript
interface ErrorBookItem {
  id: string;
  questionId: string;
  questionSummary: string;
  questionContent: string;
  subject: string;
  errorType: ErrorType;
  errorDescription: string;
  relatedTopic: string;
  topicId: string;
  firstOccurredAt: string;
  lastOccurredAt: string;
  repeatCount: number;
  status: 'pending_review' | 'reviewing' | 'mastered';
  studentAnswer: string;
  correctAnswer: string;
  analysis: string;
  redoHistory: RedoAttempt[];
}

interface RedoAttempt {
  attemptedAt: string;
  answer: string;
  isCorrect: boolean;
  timeSpent: number;
}
```

---

## 5. 笔记管理 Notes `/student/notes`

### 5.1 页面概述
上传、整理、查看学习笔记。AI 自动分类和关联知识点。

### 5.2 页面结构

```
┌──────────────────────────────────────────┐
│ TopNav: 笔记  [搜索...] [+新建] [+上传]    │
├────────┬──────────────┬──────────────────┤
│文件夹   │ 笔记列表      │ 笔记详情          │
│        │              │                  │
│全部(28) │ 三角函数公式  │ 三角函数公式推导   │
│最近(5)  │ 7/30 · 三角  │ 7/28创建 7/30编辑 │
│────────│ 二倍角公式    │                  │
│📐数学(12)│ 7/28 · 三角  │ [笔记内容区域]     │
│  Ch6(5) │ 微积分笔记    │ 支持文字/图片/公式 │
│  Ch7(7) │ 7/25 · 微积分│                  │
│📖IELTS(16)│            │ ── 关联错题 ──    │
│  Read(8)│            │  2道相关错题       │
│  Write(5)│            │                  │
│  词汇(3) │            │ ── AI整理建议 ──   │
│        │              │  "建议将二倍角部分   │
│+新建    │              │   拆分为单独笔记"    │
│        │              │  [一键整理]         │
└────────┴──────────────┴──────────────────┘
```

### 5.3 三栏布局

#### 左栏 — 文件夹树 (200px)
- "全部笔记" + 计数
- "最近编辑" + 计数
- 按科目自动分类的文件夹（层级结构）
- 文件夹由 AI 根据内容自动创建和归类
- 支持手动新建文件夹和拖拽归类
- **移动端**: 左栏折叠为顶部 dropdown

#### 中栏 — 笔记列表 (280px)
- 按最后编辑时间排序
- 每条: 标题 + 前2行预览 + 日期 + 关联知识点 + 来源 badge（手写/拍照/打字/AI整理）
- active 笔记: Teal Tint 背景
- **移动端**: 中栏占全宽，选中后跳转详情页

#### 右栏 — 笔记详情
- 标题（可编辑）
- 元数据: 创建/编辑时间 + 关联知识点
- 工具栏: bold / italic / list / image / formula / highlight
- 富文本编辑区: 支持文字、图片、公式(KaTeX)、高亮
- **AI 智能链接**: 笔记中提到的概念如果匹配 syllabus 知识点，自动添加 Deep Teal 下划线，点击可查看相关题目和知识图谱
- 底部 "关联错题" 区域: 显示 2-3 道相关错题（compact view）
- 底部 "AI 整理建议" 面板（可折叠）:
  - 知识点关联建议
  - 笔记拆分建议
  - 相关内容发现
  - "一键整理" 按钮

### 5.4 上传流程

1. 点击 "+ 上传文件" → 打开文件选择器或拖拽区域
2. 支持格式: 照片(手写笔记) / PDF / 截图
3. 上传后 AI 处理:
   - 显示 "正在识别内容..." + 进度条
   - OCR 识别文字内容
   - 自动分类: 检测科目、章节、主题
4. 识别完成:
   - 显示 "已识别为: A-Level数学 - Chapter 7 三角函数"
   - "确认" 或 "修改" 选项
   - 修改: 展示分类树供手动选择
5. 确认后自动创建笔记并关联知识点

### 5.5 数据模型

```typescript
interface Note {
  id: string;
  title: string;
  content: string; // rich text JSON
  folderId: string;
  folderPath: string; // "A-Level数学/Chapter7-三角函数"
  tags: string[];
  linkedTopics: string[]; // syllabus topic ids
  linkedErrors: string[]; // error book item ids
  source: 'typed' | 'handwritten' | 'photo' | 'ai_organized';
  createdAt: string;
  updatedAt: string;
}

interface NoteFolder {
  id: string;
  name: string;
  parentId?: string;
  noteCount: number;
  autoCreated: boolean; // AI自动分类
  children?: NoteFolder[];
}

interface AISuggestion {
  type: 'link_topic' | 'split_note' | 'related_content';
  message: string;
  actionData?: any;
}
```

---

## 6. 题库 Question Bank `/student/bank`

### 6.1 页面概述
浏览和练习题目，支持按知识点、难度、题型筛选，AI 智能推荐。

### 6.2 页面结构

```
┌──────────────────────────────────────────┐
│ TopNav: 题库 共1,247题  [搜索...] [+上传试卷]│
├──────────────────────────────────────────┤
│ [A-Level数学|IELTS Reading|IELTS Writing]  │
│ [知识点▼][难度▼][题型▼][来源▼][状态▼] [智能推荐◯]│
├──────────────────────────────────────────┤
│ ┌ 为你推荐 ────────────────────────────┐  │
│ │ 基于你的薄弱知识点: 微积分-极值求解     │  │
│ │ [推荐题1] [推荐题2] [推荐题3]          │  │
│ └──────────────────────────────────────┘  │
├──────────────────────────────────────────┤
│ ★★★☆☆ [计算题]                           │
│ 已知函数 f(x)=..., 求极值...              │
│ 知识点: 微积分-极值 | 2025年5月真题 | 2341人做过│
│ 正确率 63% ████████████░░░░              │
│                              [开始做题]   │
│──────────────────────────────────────────│
│ ★★☆☆☆ [选择题] ✓已掌握                   │
│ ...                            [重做]     │
└──────────────────────────────────────────┘
```

### 6.3 筛选系统

- **科目 Tab**: A-Level数学 / IELTS Reading / IELTS Writing
- **知识点**: 树形 dropdown，按 syllabus 结构展示
- **难度**: 1-5 星
- **题型**: 选择题 / 计算题 / 证明题 / 阅读理解 / 写作
- **来源**: 真题 / 模拟题 / 教师上传
- **状态**: 未做过 / 已做对 / 已做错
- **智能推荐 toggle**: 开启后按学生薄弱知识点重排序

### 6.4 智能推荐区

- 当 "智能推荐" 开启时显示
- Teal Tint 背景卡片
- "为你推荐" + 推荐理由（基于薄弱知识点）
- 3 道推荐题的 compact 卡片

### 6.5 题目列表

- 单列布局
- 每题: 难度星级 + 题型 badge + 题目预览(2行) + 元数据 + 状态 + 正确率 bar
- 右侧操作按钮根据状态变化:
  - 未做过: "开始做题" (Deep Teal primary)
  - 已做对: ✓ "已掌握" (Success Green) + "再做一次" (ghost)
  - 已做错: ✗ "重做" (Alert Amber)
- 正确率 bar 显示全体学生的答题正确率（社交证明，但不做排名比较）
- 点击题目跳转 `/student/bank/exercise/{questionId}`

### 6.6 上传试卷
- 与笔记上传类似的流程
- AI 自动拆分为单独题目
- 每题自动分类: 科目、章节、主题、难度
- 学生确认或修改 AI 分类

### 6.7 数据模型

```typescript
interface BankQuestion {
  id: string;
  content: string;
  type: 'choice' | 'fill_blank' | 'calculation' | 'proof' | 'reading' | 'writing';
  subject: string;
  topic: string;
  topicId: string;
  chapter: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  source: 'past_exam' | 'mock' | 'teacher_upload';
  sourceDetail?: string; // "2025年5月真题"
  correctRate: number; // global correct rate
  attemptCount: number; // how many students attempted
  studentStatus: 'not_attempted' | 'correct' | 'wrong';
  options?: string[];
  tags: string[];
}

interface BankFilter {
  subject: string;
  topicIds: string[];
  difficulty: number[];
  types: string[];
  sources: string[];
  status: string;
  smartRecommend: boolean;
  search: string;
}
```

---

## 7. 个人学习档案 Profile `/student/profile`

### 7.1 页面概述
学生查看自己的学习数据和进步轨迹。核心: 看到真实能力变化，而不是只看单次分数。

### 7.2 页面结构

```
┌──────────────────────────────────────────┐
│ TopNav: 我的                              │
├──────────────────────────────────────────┤
│ 👤 张三            加入NOME.AI 45天      ⚙️   │
├──────────────────────────────────────────┤
│ [学习概览]                                │
│  当前78%→目标85%  |  4.2h/天  |  🔥7天  | 156题│
├──────────────────────────────────────────┤
│ [知识图谱]          [A-Level数学 ▼]        │
│  (交互式知识图谱)                          │
│  ●代数(绿) ●三角(青) ●微积分(琥珀) ●复数(红) │
├──────────────────────────────────────────┤
│ [进步轨迹]                                │
│  30天折线图                               │
│  "三角函数从不会到熟练用了12天"              │
├──────────────────────────────────────────┤
│ [错误模式]                                │
│  计算错误 ████████ 40%                    │
│  方法错误 ██████ 30%                      │
│  "计算错误是你的主要问题, 建议养成检查习惯"   │
├──────────────────────────────────────────┤
│ [成就]                                    │
│  🔥坚持7天  ⭐首次满分  📌错题复盘x10       │
│  🔒连续30天  🔒全科掌握                    │
└──────────────────────────────────────────┘
```

### 7.3 模块详情

#### 学习概览
- 4 个指标（不等宽 3:2:2:3）:
  - 当前分数 → 目标分数 + 进度条
  - 本周学习时长/天
  - 连续学习天数（火焰图标，克制的 gamification）
  - 总练习量 + 正确率

#### 知识图谱
- **交互式可视化知识图谱**
- 节点 = syllabus 知识模块，大小与考试权重成正比
- 颜色: Green(>80%) / Teal(60-80%) / Amber(40-60%) / Red(<40%)
- 节点标签: 名称 + 百分比
- 节点间连线: 前置知识关系
- **交互**: 
  - 点击节点 → 展开面板显示: 相关笔记、相关错题、该知识点的练习题
  - 拖拽平移，滚轮缩放
- 科目切换器
- **技术建议**: D3.js force-directed graph 或 Cytoscape.js
- **API**: `GET /api/student/knowledge-graph?subject={subject}`

#### 进步轨迹
- 30 天分数线/掌握度折线图
- 关键节点标注: "开始三角函数专项训练" 等事件标记
- 里程碑描述: "三角函数从不会到熟练用了 12 天"
- 展示的是能力变化趋势，不是单次分数波动

#### 错误模式分析
- 水平柱状图展示错误类型分布
- Insight callout: AI 生成的改进建议（Alert Amber 浅色背景）
- 数据用于学生自我认知

#### 成就系统
- Badge 网格（每行 4 个）
- 已获得: 彩色图标
- 未获得: 灰色 + 锁图标
- **原则**: 
  - 奖励有效学习行为（完成复盘、独立做对变式题、主动求助），不只奖励正确率
  - 展示 "这个知识点你从不会到熟练用了 X 天"、"同类错误减少了 X%"
  - 里程碑庆祝有仪式感但不过度游戏化
  - 避免排行榜和同伴比较
- 成就类型:
  - 坚持类: 连续学习 X 天
  - 突破类: 首次满分、知识点从薄弱到掌握
  - 习惯类: 错题复盘 X 次、独立完成 X 题
  - 里程碑类: 总练习量达到 X 题

### 7.4 设置面板

- 从头像区域的齿轮图标进入
- **语气风格**: 滑块 "温和鼓励型 ←→ 严格督学型"
  - 影响 AI 反馈的语气
  - 保存后立即生效
- **每日学习目标**: 输入每天学习 X 小时
- **提醒设置**: 任务提醒 / 错题复盘提醒 / 学习时间提醒
- **账号设置**: 个人信息 / 密码修改
- **API**: `PUT /api/student/settings`

### 7.5 数据模型

```typescript
interface StudentProfilePage {
  user: {
    name: string;
    avatar: string;
    joinedDays: number;
  };
  overview: {
    currentScore: number;
    targetScore: number;
    dailyHours: number;
    streak: number;
    totalQuestions: number;
    overallAccuracy: number;
  };
  knowledgeGraph: KnowledgeNode[];
  progressTimeline: {
    date: string;
    score: number;
    mastery: number;
    event?: string; // "开始三角函数专项训练"
  }[];
  errorPattern: {
    distribution: Record<ErrorType, number>;
    insight: string;
  };
  achievements: Achievement[];
}

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  earned: boolean;
  earnedAt?: string;
  category: 'persistence' | 'breakthrough' | 'habit' | 'milestone';
  progress?: { current: number; target: number };
}
```

---

## 8. API 端点汇总

### 学生端 API

```
# Homepage
GET  /api/student/greeting                    # 问候语和待办数
GET  /api/student/tasks/today                 # 今日任务
PUT  /api/student/tasks/{id}/complete         # 完成任务
POST /api/student/tasks/{id}/cannot-complete  # 反馈无法完成
GET  /api/student/learning-summary            # 学习概览

# Exercise
GET  /api/student/exercise/{taskId}           # 获取练习题目
POST /api/student/exercise/{taskId}/answer    # 提交单题答案
POST /api/student/exercise/{taskId}/hint      # 请求提示（解锁下一层）
POST /api/student/exercise/{taskId}/submit    # 提交整套练习
GET  /api/student/exercise/{taskId}/variant   # 获取变式题

# Summary
GET  /api/student/summary/{sessionId}         # 学后总结
POST /api/student/summary/{sessionId}/add-to-error-book  # 加入错题本

# Error Book
GET  /api/student/errors?status=&subject=&sort=  # 错题列表
GET  /api/student/errors/{id}                 # 错题详情
POST /api/student/errors/{id}/redo            # 重做
PUT  /api/student/errors/{id}/master          # 标记已掌握

# Notes
GET  /api/student/notes/folders               # 文件夹树
GET  /api/student/notes?folder=&search=       # 笔记列表
GET  /api/student/notes/{id}                  # 笔记详情
POST /api/student/notes                       # 新建笔记
PUT  /api/student/notes/{id}                  # 更新笔记
DELETE /api/student/notes/{id}                # 删除笔记
POST /api/student/notes/upload                # 上传文件
POST /api/student/notes/{id}/ai-organize      # AI 一键整理
GET  /api/student/notes/{id}/ai-suggestions   # AI 整理建议

# Question Bank
GET  /api/student/bank?subject=&topic=&difficulty=&type=&source=&status=&search=&recommend=  # 题目列表
GET  /api/student/bank/{questionId}           # 题目详情
POST /api/student/bank/upload                 # 上传试卷
GET  /api/student/bank/recommendations        # 智能推荐

# Profile
GET  /api/student/profile                     # 学习档案
GET  /api/student/knowledge-graph?subject=    # 知识图谱
GET  /api/student/progress-timeline           # 进步轨迹
GET  /api/student/achievements                # 成就列表
PUT  /api/student/settings                    # 更新设置
```

---

## 9. 响应式规则

| 断点 | 行为 |
|------|------|
| ≥1024px | 完整布局，内容区 max-width 居中 |
| 768-1023px | iPad 横屏: 笔记/题库保持多栏，做题页保持 60/40 分屏 |
| <768px | 手机/iPad竖屏: 全部单列，做题页上下堆叠（题目在上，AI面板在下），笔记页折叠为单栏 |

### iPad 特殊适配
- 做题页支持手写输入（激活 canvas 画布）
- 笔记页支持手写批注和圈画
- 触摸目标最小 44px

---

## 10. 边界情况处理

- **首次使用（无数据）**: 各页面显示引导性空状态 + "开始第一个任务" CTA
- **AI 服务不可用**: 提示层降级为静态参考答案，通知 "AI 辅导暂时不可用，稍后再试"
- **网络中断**: 本地保存答题进度，恢复后自动同步
- **题目加载失败**: 骨架屏 → 错误提示 + 重试按钮
- **学生提交空答案**: 前端验证阻止提交，提示 "请先作答"
- **学生反复查看提示不尝试**: 记录行为数据，但不阻止（教师端可以看到提示依赖度）
- **错题本为空**: "太棒了，目前没有待复盘的错题" + "去题库刷题 →"
- **笔记上传格式不支持**: 明确提示支持的格式列表
- **知识图谱数据不足**: 完成至少 3 次练习后才生成图谱

---

## 11. 与教师端的数据联动

学生端和教师端共享同一个学生数据模型。关键联动点：

| 学生端行为 | 教师端可见 |
|-----------|-----------|
| 完成练习 | 作业提交状态更新 + 短期反馈生成 |
| 使用提示层级 | 提示依赖度数据 → 教学建议 |
| 错因分类 | 错因分布更新 → 课堂重点调整 |
| 任务"无法完成"反馈 | 教师收到调整建议通知 |
| 学习压力指标变化 | 压力预警（基于行为数据: 完成时间延长、跳题、中途退出等） |
| 知识图谱更新 | 教师端知识图谱同步更新 |
| 错题重做成功 | 长期反馈中 "重复错误减少" 指标更新 |

### 学生压力指数计算信号（后端逻辑）
- 一周任务量和预计学习时间
- 连续课程和考试密度
- 错误率突然升高
- 完成时间明显延长
- 连续跳题或中途退出
- 拖延和逾期增加
- 学生端主动状态反馈（如果有）
- **注意**: 学生端不显示自己的压力指数，只有教师端可见
