# NOME.AI — 教师端开发 PRD

> Version: 1.0 | Date: 2026-08-05 | Platform: Web (Desktop-first)
> 
> 本文档面向 Coding Agent，包含所有页面的结构、交互、数据模型和 API 需求。
> 设计系统规范请参考 DESIGN.md（同目录下）。

---

## 0. 全局信息

### 0.1 产品定位
NOME.AI是一个 AI 私教平台，服务 A-Level 和 IELTS 备考学生。教师端帮助老师回答三个核心问题：
1. 这个学生最近发生了什么？
2. 下一节课应该重点解决什么？
3. 哪些学生现在需要人工介入？

### 0.2 技术栈建议
- 前端框架: React 18+ / Next.js 14+
- 样式: Tailwind CSS + CSS Variables（匹配 DESIGN.md 色彩系统）
- 动画: Framer Motion（spring physics: stiffness 100, damping 20）
- 图表: Recharts 或 D3.js
- 状态管理: Zustand 或 React Query + Context

### 0.3 路由结构
```
/teacher
├── /dashboard          # 教学工作台（首页）
├── /calendar           # 课程日历
├── /assignments        # 作业管理
├── /students           # 学生列表
├── /students/:id       # 学生档案
├── /reports            # 数据报告
└── /settings           # 设置
```

### 0.4 全局布局
- 左侧固定侧边栏 240px（可折叠为 64px 图标模式）
- 内容区域 `max-width: 1320px`，居中
- 页面背景 `#FAFAF8`（Warm Paper）
- 卡片背景 `#FFFFFF`（Pure Surface）
- 卡片样式：1px `rgba(231,229,228,0.6)` border，`border-radius: 0.75rem`，`padding: 1.5rem`

### 0.5 全局组件

#### 侧边栏 Sidebar
- 背景: `#1C1917`（Deep Ink）
- Logo "NOME.AI" 白色 Satoshi 600
- 导航项: 白色文字 0.875rem，active 项有 3px Deep Teal (#0D9488) 左侧指示条
- 导航项列表: 工作台 / 课程日历 / 学生档案 / 作业管理 / 数据报告
- 底部: 教师头像(32px) + 姓名 + 设置图标
- 折叠状态: 只显示图标，hover 展开 tooltip

#### 页面顶栏 TopBar
- 背景: `#FFFFFF`，底部 1px Whisper Line 边框
- 左侧: 页面标题 (Satoshi 1.5rem/600, Deep Ink)
- 右侧: 日期显示 + 通知铃铛（有未读时显示 Deep Teal 小圆点 badge）+ 筛选器

#### 卡片进入动画
所有卡片使用 staggered 入场动画：
```css
/* Framer Motion variants */
const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } }
}
const item = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 100, damping: 20 } }
}
```

---

## 1. 教学工作台 Dashboard `/teacher/dashboard`

### 1.1 页面概述
教师登录后的首页，快速了解今天需要处理的所有事项。

### 1.2 页面结构

```
┌──────────────────────────────────────────────┐
│ TopBar: "教学工作台" | 日期 | 🔔 | 班级筛选     │
├──────────────────────────────────────────────┤
│ [待处理事件] (full-width card)                │
│   待批改作业 5份 | 压力风险 2人                 │
│   长期停滞 1人   | 异常作业 2份                 │
├──────────────────────────────────────────────┤
│ [课程] (full-width card)                      │
│   今日3节 · 本周12节         查看完整日历 →     │
│   [迷你周日历 strip]                           │
│   10:00 张三 A-Level数学P3                     │
│   14:00 高二A班 IELTS Reading                  │
│   16:00 李四 A-Level数学P4                     │
├────────────────────────┬─────────────────────┤
│ [作业] (60%)            │ [学生动态] (40%)     │
│   待批改5份 · 已布置23份  │   ⚡王五 正确率↓15%  │
│   张三 数学P3 等待3天    │   ⚡张三 计算错误×3   │
│   李四 IELTS 昨天提交    │   ⚡赵六 压力升高     │
│   王五 数学P4 今天提交   │                     │
│              作业管理 →  │          全部学生 → │
└────────────────────────┴─────────────────────┘
```

### 1.3 模块详情

#### 模块1: 待处理事件 PendingTasks
- **位置**: 页面最顶部，full-width
- **卡片标题**: "待处理事件" + count badge（Alert Amber 背景）
- **布局**: 2x2 grid，每个 item 是水平行
- **Item 结构**:
  ```
  [colored dot] [label] [count in Mono] [description in Warm Stone]
  ```
- **4种类型**:
  | 类型 | 圆点颜色 | 数据来源 |
  |------|---------|---------|
  | 待批改作业 | Alert Amber | `GET /api/teacher/pending-grading` |
  | 压力风险学生 | Error Red | `GET /api/teacher/stress-alerts` |
  | 长期停滞学生 | Alert Amber | `GET /api/teacher/stagnant-students` |
  | 异常作业 | #0EA5E9 | `GET /api/teacher/abnormal-assignments` |
- **交互**: 每行可点击，hover 显示 Teal Tint 背景，点击跳转到对应页面并带上 filter
- **空状态**: 如果所有项为 0，整个卡片显示 "今日无待处理事项" + 一个简洁的 checkmark 图标

#### 模块2: 课程 CoursesSummary
- **卡片标题行**: "课程" + "今日 X 节 · 本周 Y 节" (Warm Stone) + 右侧 "查看完整日历 →" (Deep Teal link)
- **迷你周日历**:
  - 7列横向排列（周一到周日）
  - 每列显示日期数字 + 当日课程数（用小圆点表示，最多3个，超过显示 "+N"）
  - 今天用 Deep Teal border 高亮
  - 过去的日期 60% opacity
- **今日课程列表**:
  - 每行: `时间(Mono 80px) | 学生/班级名 | 课程类型badge`
  - 课程类型 badge: A-Level 科目用 Teal Tint 背景 + Deep Teal 文字；IELTS 用 Whisper Line 背景 + Warm Stone 文字
  - 行尾有一个小圆点表示状态：绿色=已完成，蓝色=进行中，灰色=未开始
- **交互**: 整个卡片可点击，跳转 `/teacher/calendar`
- **API**: `GET /api/teacher/courses/today` + `GET /api/teacher/courses/week-summary`

#### 模块3: 作业 AssignmentsSummary
- **位置**: 左侧 60% 宽度
- **卡片标题行**: "作业" + "待批改 X 份 · 已布置 Y 份" (Warm Stone) + "进入作业管理 →" (Deep Teal)
- **作业列表**: 最多显示 3 条待批改作业
  - 每行: `学生名 | 作业标题 | 科目badge | 提交时间 | 等待时长`
  - 等待时长 > 2天时用 Alert Amber 文字
- **交互**: 点击行跳转 `/teacher/assignments?filter=pending&highlight={id}`
- **API**: `GET /api/teacher/assignments/pending?limit=3`

#### 模块4: 学生动态 StudentAlerts
- **位置**: 右侧 40% 宽度
- **卡片标题行**: "学生动态" + "查看全部学生 →" (Deep Teal)
- **Alert 列表**: 最多 3 条
  - 每条: 颜色指示点 + 学生名(500 weight) + 描述(Warm Stone) + 时间(Mono)
  - 颜色规则: 压力预警=Red, 成绩下降=Amber, 正面变化=Green
- **交互**: 点击某条 alert 跳转 `/teacher/students/{studentId}?tab=feedback`
- **API**: `GET /api/teacher/student-alerts?limit=3`

### 1.4 数据模型

```typescript
interface DashboardData {
  pendingTasks: {
    ungradedCount: number;
    stressAlertsCount: number;
    stagnantCount: number;
    abnormalCount: number;
    latestUngraded: string; // "张三 - 数学P3"
    stressStudents: string[]; // ["王五", "赵六"]
  };
  todayCourses: Course[];
  weekCourseCount: number;
  pendingAssignments: PendingAssignment[];
  studentAlerts: StudentAlert[];
}

interface Course {
  id: string;
  time: string; // "10:00"
  endTime: string;
  studentName: string; // or className
  classId?: string;
  studentId?: string;
  courseType: string; // "A-Level数学P3" | "IELTS Reading"
  subject: 'alevel_math' | 'alevel_physics' | 'ielts_reading' | 'ielts_writing';
  status: 'completed' | 'in_progress' | 'upcoming';
}

interface PendingAssignment {
  id: string;
  studentName: string;
  studentId: string;
  title: string;
  subject: string;
  submittedAt: string; // ISO date
  waitingDays: number;
}

interface StudentAlert {
  id: string;
  studentId: string;
  studentName: string;
  type: 'stress' | 'score_drop' | 'stagnant' | 'positive';
  message: string;
  timestamp: string;
  severity: 'red' | 'amber' | 'green';
}
```

---

## 2. 课程日历 Course Calendar `/teacher/calendar`

### 2.1 页面概述
展示所有课程的周/月视图日历，点击进入课程详情。

### 2.2 页面结构

```
┌──────────────────────────────────────────────┐
│ TopBar: "课程日历" [周视图|月视图] | ←上周 今天 下周→ │
├──────────────────────────────────────────────┤
│ 时间轴    │ 周一8/3 │ 周二8/4 │ ... │ 周日8/9  │
│ 08:00    │         │         │     │          │
│ 10:00    │ [课程块] │         │     │          │
│ 12:00    │         │         │     │          │
│ 14:00    │ [课程块] │ [课程块] │     │          │
│ 16:00    │         │ [课程块] │     │          │
│ 18:00    │         │         │     │          │
│ 20:00    │         │         │     │          │
└──────────────────────────────────────────────┘
                                      ┌─────────┐
                                      │ 课程详情 │
                                      │ 侧滑面板 │
                                      │ (400px) │
                                      └─────────┘
```

### 2.3 日历网格

#### 周视图
- 7列（周一到周日），每列宽度相等
- Header 行: 星期名 + 日期数字，今天用 Deep Teal 圆圈高亮
- 左侧时间轴: 08:00-20:00，每 2 小时一格，JetBrains Mono Warm Stone
- 课程块:
  - 背景: Teal Tint (#F0FDFA)
  - 左边框: 3px Deep Teal
  - `border-radius: 0.5rem`，`padding: 0.5rem`
  - 内容: 时间范围 + 学生/班级名 + 课程类型
  - 过去的课程: 60% opacity
  - 当前/即将开始: 额外 2px Deep Teal outline

#### 月视图
- 标准日历网格（7列 x 5-6行）
- 每个日期格子内显示课程块（缩小版，只显示时间和学生名）
- 超过 2 个课程显示 "+N more"

### 2.4 课程详情侧滑面板

- **触发**: 点击日历中的课程块
- **动画**: 从右侧滑入 400px 宽面板，`translateX: 100% → 0`，200ms ease-out-quart
- **关闭**: 点击 X 按钮或点击面板外的遮罩区域

#### 面板内容
- **课程信息区**:
  - 课程标题: "A-Level 数学 P3 - Chapter 7" (1.25rem/600)
  - 学生头像 + 姓名
  - 时间: "今天 10:00 - 11:30" (Mono)
  - 状态 badge: "即将开始" (Deep Teal) / "已完成" (Success Green) / "进行中" (#0EA5E9)
- **Tab 切换**: 课程大纲 | 作业 | 历史记录

#### Tab 1: 课程大纲
- **上节课回顾**: 2-3 个 bullet points，列出上节课讲了什么
- **课后新问题**: 学生在课后练习中暴露的新问题（来自 AI 分析）
- **本节课内容大纲**: 编号列表的教学内容
- **建议例题**: 可点击的题目引用链接
- **建议节奏**: 可视化的难度曲线（简单→困难→简单的波形图）
- **已掌握内容**: 绿色 checkmark 标记的内容，标注 "可快速带过"
- **课后作业**: 建议布置的作业内容
- **教师操作**: 每个建议项后面有 "采用" / "修改" / "忽略" 按钮
- **API**: `GET /api/teacher/courses/{id}/lesson-plan` (AI 生成) + `PUT /api/teacher/courses/{id}/lesson-plan` (教师修改)

#### Tab 2: 作业
- 当前已布置的作业列表（状态 + 提交情况）
- "布置新作业" 按钮（Deep Teal）
- 点击布置后弹出作业选择器（从题库选择或上传）

#### Tab 3: 历史记录
- 过去 5 次课的列表
- 每次: 日期 + 课题 + 简要表现摘要
- 点击展开查看详情

### 2.5 数据模型

```typescript
interface CalendarCourse {
  id: string;
  title: string;
  studentId?: string;
  studentName?: string;
  classId?: string;
  className?: string;
  subject: string;
  chapter?: string;
  startTime: string; // ISO
  endTime: string;
  status: 'completed' | 'in_progress' | 'upcoming' | 'cancelled';
}

interface LessonPlan {
  courseId: string;
  review: string[]; // 上节课回顾
  newIssues: string[]; // 课后新问题
  outline: LessonOutlineItem[];
  suggestedExamples: QuestionRef[];
  pacingGuide: PacingPoint[]; // 难度曲线
  masteredContent: string[]; // 已掌握可快速带过
  suggestedHomework: HomeworkSuggestion;
  teacherModifications?: TeacherEdit[];
}

interface LessonOutlineItem {
  order: number;
  content: string;
  duration: number; // minutes
  difficulty: 1 | 2 | 3 | 4 | 5;
}
```

---

## 3. 作业管理 Assignment Management `/teacher/assignments`

### 3.1 页面概述
管理所有作业：查看、批改、布置、跟踪学生完成情况。

### 3.2 页面结构

```
┌──────────────────────────────────────────────┐
│ TopBar: "作业管理" | [全部|待批改|已批改|已逾期] [布置作业] │
├──────────────────────────────────────────────┤
│ [按作业查看] | [按学生查看]                     │
├──────────────────────────────────────────────┤
│ 作业名称    │ 班级/学生 │ 科目  │ 布置  │ 截止  │ 提交率 │ 状态 │
│ Chapter6练习│ 高二A班  │ 数学  │ 7/28 │ 8/2  │ 18/20 │ 待批改3│
│ IELTS剑18  │ 李四王五 │ IELTS │ 7/30 │ 8/5  │ 2/2   │ 待批改2│
│ 微积分基础  │ 高二A班  │ 数学  │ 7/25 │ 7/30 │ 20/20 │ 已完成 │
├──────────────────────────────────────────────┤
│ (展开行) 学生提交列表                          │
│   张三 | 已提交 | 得分: - | 用时32min | 提示1.2次/题 | [批改] │
│   李四 | 已提交 | 得分: 85 | 用时28min | 提示0.5次/题 | [查看] │
└──────────────────────────────────────────────┘
```

### 3.3 视图切换

#### 按作业查看（默认）
- 数据表格展示所有作业
- 列: 作业名称 | 班级/学生 | 科目 | 布置时间 | 截止时间 | 提交率 | 状态
- 提交率和数字列使用 JetBrains Mono 右对齐
- 行 hover: Teal Tint 背景
- 点击行展开学生提交子列表

#### 按学生查看
- 左侧 200px 学生列表
- 右侧显示选中学生的作业历史
- 顶部统计卡片: 总作业数 | 完成率 | 平均正确率 | 逾期次数
- 下方作业历史表格

### 3.4 筛选器
- 全部 / 待批改 / 已批改 / 已逾期
- Pill button 样式，active: Deep Teal 背景 + 白字，inactive: Whisper Line border + Warm Stone 文字

### 3.5 批改界面

- **触发**: 点击学生提交行的 "批改" 按钮
- **布局**: 全宽替换表格区域，60/40 分屏

#### 左侧面板 (60%) — 学生作答展示
- 显示学生原始提交内容
- 数学: 渲染题目 + 学生手写/打字答案
- IELTS: 原文 + 学生答案
- **AI 标注层**: 
  - 错误位置用 Error Red 高亮/下划线
  - 正确部分用 Success Green 高亮
  - AI 建议分数显示在作答区域右上角
  - AI 建议反馈显示在作答区域右侧（可折叠）

#### 右侧面板 (40%) — 批改控制
- 分数输入框（大号，JetBrains Mono）
- AI 建议分数 + "采用" 按钮（一键填入 AI 建议分数）
- 反馈文本域（预填 AI 生成的反馈，教师可编辑）
- 错因分类标签（可多选，toggle 模式）:
  - 知识错误 / 方法错误 / 计算错误 / 审题错误 / 执行错误 / 表达错误 / 习惯问题
- "提交批改" 按钮（Deep Teal primary）
- "跳过" 按钮（ghost）
- **版本记录**: 可查看学生的修改历史（避免只看到最终正确答案）

### 3.6 布置作业流程
1. 点击 "布置作业" → 弹出选择器
2. 选项: 从题库选择 / 上传试卷（PDF/图片）/ 从课程大纲推荐
3. 选择后配置: 截止日期、提示开放程度（完全开放/限制层数/关闭）、重做要求
4. 可针对单个学生生成差异化附加任务
5. **API**: `POST /api/teacher/assignments`

### 3.7 数据模型

```typescript
interface Assignment {
  id: string;
  title: string;
  classId?: string;
  className?: string;
  studentIds: string[]; // 可以是个别学生或整个班级
  subject: string;
  questions: QuestionRef[];
  assignedAt: string;
  dueAt: string;
  hintLevel: 'full' | 'limited' | 'none'; // 提示开放程度
  redoRequired: boolean;
  submissions: Submission[];
  status: 'active' | 'grading' | 'completed' | 'overdue';
}

interface Submission {
  id: string;
  assignmentId: string;
  studentId: string;
  studentName: string;
  submittedAt: string;
  score?: number;
  aiSuggestedScore?: number;
  aiFeedback?: string;
  teacherFeedback?: string;
  timeSpent: number; // minutes
  hintsUsedPerQuestion: number;
  errorClassifications: ErrorType[];
  versions: SubmissionVersion[]; // 完整版本记录
  status: 'submitted' | 'graded' | 'reviewed';
}

type ErrorType = 'knowledge' | 'method' | 'calculation' | 'reading' | 'execution' | 'expression' | 'habit';
```

---

## 4. 学生档案 Student Profile `/teacher/students/:id`

### 4.1 页面概述
单个学生的完整档案，持续更新。展示可解释的 AI 判断，而不是无法理解的综合分数。

### 4.2 页面结构

```
┌──────────────────────────────────────────────┐
│ TopBar: ← 学生档案 | [学生选择器: 张三 ▼]       │
├──────────────────────────────────────────────┤
│ [学生信息头部卡片]                              │
│ 👤 张三  [A-Level数学] [目标:A*]               │
│ 当前78% ████████░░ 目标85%                     │
│ 压力指数: 62 ⚠️压力偏高  | 讲解方式: 渐进引导型   │
├────────────────────────┬─────────────────────┤
│ [知识能力图谱]          │ [学生标签]            │
│  (知识树/图)            │  计算粗心 72%         │
│  ●代数基础(绿)          │  视觉学习者 85%        │
│  ●三角函数(青)          │  考前焦虑 68%         │
│  ●微积分(琥珀)          │  坚持度高 91%         │
│  ●复数运算(红)          │                      │
├────────────────────────┤ [作业完成与拖延]        │
│ [最近作业与模考]        │  14天执行记录图表      │
│  日期|类型|内容|正确率  │  本周4/6 延迟0.5天    │
│  ...5条记录            │                      │
├────────────────────────┤ [AI建议]              │
│ [学习反馈 3天|7天|30天] │  💡建议1              │
│  正确率72% ↓15%        │  💡建议2              │
│  错因分布 [bar chart]   │  💡建议3              │
│  ⚠️需要关注: ...       │                      │
└────────────────────────┴─────────────────────┘
```

### 4.3 学生信息头部

- 左侧: 头像(64px) + 姓名(1.5rem/600) + 科目 badge + 目标 badge
- 中间: 当前分数(大号 Mono) + 目标分数 + 进度条
- 右侧: **学习压力指数仪表盘**
  - 圆形 gauge，0-100 刻度
  - 当前值显示在中心（JetBrains Mono）
  - 颜色区域: 0-40 绿色（正常）, 40-70 琥珀色（偏高）, 70-100 红色（高风险）
  - 下方标签: "压力正常" / "压力偏高" / "压力高风险"
- 最右侧: "适合讲解方式" tag

### 4.4 知识能力图谱

- 可视化知识树/图
- 节点 = syllabus 知识模块
- 颜色编码:
  - 掌握 (>80%): Success Green fill
  - 良好 (60-80%): Deep Teal fill
  - 薄弱 (40-60%): Alert Amber fill
  - 严重不足 (<40%): Error Red fill
- 节点大小与考试权重成正比
- 节点间连线表示前置知识关系
- 点击节点展开详情: 相关错题、练习记录、掌握变化趋势
- 科目切换器: A-Level 数学 / IELTS Reading / IELTS Writing
- **API**: `GET /api/students/{id}/knowledge-graph?subject={subject}`

### 4.5 学生动态标签

- 标签以 pill badge 展示，带置信度百分比
- 每个标签包含: 证据、时间、置信度
- 标签颜色根据类型: 学习问题=Amber, 学习方式=Teal, 心理风险=Red, 正面特质=Green
- Hover 显示证据说明: "过去两周完成5篇初稿, 仅1篇完成二次修改"
- **教师操作**: 每个标签有确认(✓)、修改(✎)、驳回(✗) 按钮
- **API**: `GET /api/students/{id}/tags` + `PUT /api/students/{id}/tags/{tagId}` (confirm/reject/modify)

### 4.6 短期/长期反馈

- Tab 切换: 3天 | 7天 | 30天
- 3天反馈内容:
  - 正确率 + 变化趋势（↓15% 用 Alert Amber）
  - 平均用时 + 变化
  - 提示使用频率
  - 错因分布横向柱状图
  - "需要关注" callout（Alert Amber 左边框 + 浅色背景）
- 7天/30天反馈内容:
  - 知识掌握变化趋势
  - 同类错误复发率
  - 正确率与模考成绩变化
  - 独立完成率和提示依赖变化
  - 任务完成和拖延趋势
  - 学习压力风险变化
  - 原计划与实际进度偏差
- 每个 AI 判断旁边有 "确认" / "驳回" 按钮 + 备注输入框
- **API**: `GET /api/students/{id}/feedback?period=3d|7d|30d`

### 4.7 AI 教学建议

- 2-3 条建议卡片，Teal Tint 背景
- 每条建议: 文字描述 + "采纳" / "忽略" 按钮
- 采纳后自动更新教学计划
- **API**: `GET /api/students/{id}/suggestions` + `POST /api/students/{id}/suggestions/{sid}/accept`

### 4.8 数据模型

```typescript
interface StudentProfile {
  id: string;
  name: string;
  avatar: string;
  subjects: string[];
  targetScore: string; // "A*"
  currentScore: number; // 78
  targetScoreNum: number; // 85
  stressIndex: number; // 0-100
  teachingStyle: string; // "渐进引导型"
  tags: StudentTag[];
  knowledgeGraph: KnowledgeNode[];
  recentAssignments: AssignmentRecord[];
  feedback: FeedbackData;
  executionRecord: ExecutionDay[];
  suggestions: AISuggestion[];
}

interface StudentTag {
  id: string;
  label: string; // "计算粗心"
  confidence: number; // 72
  evidence: string;
  category: 'learning_issue' | 'learning_style' | 'psychological' | 'positive';
  status: 'pending' | 'confirmed' | 'rejected' | 'modified';
  updatedAt: string;
}

interface KnowledgeNode {
  id: string;
  name: string;
  mastery: number; // 0-100
  weight: number; // exam importance
  prerequisites: string[]; // node ids
  recentErrors: number;
  trend: 'improving' | 'stable' | 'declining';
}

interface FeedbackData {
  period: '3d' | '7d' | '30d';
  accuracy: number;
  accuracyChange: number;
  avgTimePerQuestion: number;
  timeChange: number;
  hintsPerQuestion: number;
  errorDistribution: Record<ErrorType, number>;
  alerts: FeedbackAlert[];
  teacherConfirmed: boolean;
}
```

---

## 5. 数据报告 Analytics & Reports `/teacher/reports`

### 5.1 页面概述
跨学生和班级的学习趋势分析。

### 5.2 页面结构

```
┌──────────────────────────────────────────────┐
│ TopBar: "数据报告" | [本周|本月|本学期] [导出]    │
├──────────────────────────────────────────────┤
│ [班级平均分]  [作业完成率]  [需关注学生]  [平均学习时长] │
│   76.3        87%          3           4.2h/天     │
│   +2.1↑       +5%↑         压力风险      -0.3↓       │
├────────────────────────┬─────────────────────┤
│ [成绩趋势]              │ [错因分布变化]        │
│  30天折线图             │  堆叠面积图           │
│  班级平均 + 个人细线     │  5种错误类型          │
├────────────────────────┴─────────────────────┤
│ [进步最大] | [需要关注]                        │
│  学生|分数变化|正确率变化|关键突破               │
│  张三|+8分   |+12%     |三角函数薄弱→良好       │
└──────────────────────────────────────────────┘
```

### 5.3 模块详情

#### 概览指标卡片
- 4 个指标卡，不等宽（3:2:3:2 比例）
- 数值用 JetBrains Mono 大号显示
- 变化值: 上升用 Success Green + ↑, 下降用 Warm Stone + ↓
- "需要关注学生" 始终用 Alert Amber

#### 成绩趋势图
- 折线图，30 天数据
- 班级平均线: Deep Teal 粗线
- 个人线: 细灰线（所有学生），hover 某条个人线时高亮
- X 轴: 日期（Mono）
- Y 轴: 分数 0-100
- Tooltip: 显示具体数值和学生名
- **图表库建议**: Recharts `<LineChart>` 或 D3.js

#### 错因分布变化图
- 堆叠面积图
- 颜色: 知识错误(Deep Teal), 方法错误(#0EA5E9), 计算错误(Alert Amber), 审题错误(#8B5CF6), 执行错误(Warm Stone)
- 展示错误类型随时间的变化趋势
- 重点观察: 重复错误是否在减少

#### 学生排行/关注列表
- Tab: 进步最大 | 需要关注
- 表格展示，操作按钮: "查看档案" (ghost)
- **API**: `GET /api/teacher/reports/overview?period=month` + `GET /api/teacher/reports/students?type=improved|attention`

---

## 6. 学生列表 Student List `/teacher/students`

### 6.1 页面概述
所有学生的卡片列表，支持搜索、筛选、排序。

### 6.2 页面结构

```
┌──────────────────────────────────────────────┐
│ TopBar: "学生档案" 共24名 | [搜索] [班级▼] [风险▼] [排序▼] │
├──────────────────────┬───────────────────────┤
│ [学生卡片1]           │ [学生卡片2]            │
│ 👤 张三      🟢正常   │ 👤 李四      🟡关注    │
│ 78% ██████░░ → 85%   │ 65% ████░░░░ → 80%    │
│ [计算粗心] [视觉学习者] │ [知识薄弱] [拖延倾向]  │
│ 2小时前    查看档案 →  │ 30分钟前   查看档案 → │
├──────────────────────┼───────────────────────┤
│ [学生卡片3]           │ [学生卡片4]            │
│ ...                  │ ...                   │
└──────────────────────┴───────────────────────┘
```

### 6.3 学生卡片

- 2列网格（不用3列，避免 generic 布局）
- 卡片内容:
  - 顶部: 头像(48px) + 姓名 + 状态 badge（正常=Green, 关注=Amber, 风险=Red）
  - 中间: 当前分数(大 Mono) + 进度条指向目标分数
  - 标签行: 2-3 个关键标签 pill
  - 底部: 最近活跃时间 + "查看档案 →" link
- 默认排序: 按风险等级（高风险在前）
- Hover: Teal Tint 背景 + Deep Teal 边框
- 点击: 跳转 `/teacher/students/{id}`
- **API**: `GET /api/teacher/students?search=&class=&risk=&sort=risk&page=1`

---

## 7. API 端点汇总

### 教师端 API

```
# Dashboard
GET  /api/teacher/dashboard                    # 工作台聚合数据
GET  /api/teacher/pending-grading              # 待批改数量
GET  /api/teacher/stress-alerts                # 压力预警
GET  /api/teacher/stagnant-students            # 停滞学生
GET  /api/teacher/abnormal-assignments         # 异常作业
GET  /api/teacher/student-alerts?limit=3       # 学生动态提醒

# Courses
GET  /api/teacher/courses/today                # 今日课程
GET  /api/teacher/courses/week-summary         # 本周课程概览
GET  /api/teacher/courses?start=&end=          # 日期范围课程
GET  /api/teacher/courses/{id}                 # 课程详情
GET  /api/teacher/courses/{id}/lesson-plan     # AI 生成教学大纲
PUT  /api/teacher/courses/{id}/lesson-plan     # 教师修改大纲

# Assignments
GET  /api/teacher/assignments?status=&page=     # 作业列表
POST /api/teacher/assignments                  # 布置作业
GET  /api/teacher/assignments/{id}/submissions # 提交列表
GET  /api/teacher/assignments/{id}/submissions/{sid} # 单个提交详情
PUT  /api/teacher/submissions/{sid}/grade      # 提交批改
GET  /api/teacher/assignments/pending?limit=3  # 待批改(top 3)

# Students
GET  /api/teacher/students?search=&class=&risk=&sort=  # 学生列表
GET  /api/students/{id}                        # 学生档案
GET  /api/students/{id}/knowledge-graph        # 知识图谱
GET  /api/students/{id}/tags                   # 学生标签
PUT  /api/students/{id}/tags/{tagId}           # 确认/驳回标签
GET  /api/students/{id}/feedback?period=       # 学习反馈
GET  /api/students/{id}/suggestions            # AI 建议
POST /api/students/{id}/suggestions/{sid}/accept # 采纳建议

# Reports
GET  /api/teacher/reports/overview?period=      # 班级概览
GET  /api/teacher/reports/score-trend?period=   # 成绩趋势
GET  /api/teacher/reports/error-distribution?period= # 错因分布
GET  /api/teacher/reports/students?type=        # 学生排行/关注
```

---

## 8. 响应式规则

| 断点 | 行为 |
|------|------|
| ≥1024px | 完整布局，侧边栏 240px，多列网格 |
| 768-1023px | 侧边栏折叠为 64px 图标模式，2列→1列 |
| <768px | 侧边栏隐藏（汉堡菜单），所有内容单列堆叠 |

---

## 9. 边界情况处理

- **空数据**: 所有列表/图表都有对应的空状态设计（参考 DESIGN.md Empty States）
- **加载中**: 使用骨架屏（skeletal shimmer），不用 spinner
- **网络错误**: Toast 通知 + 重试按钮
- **AI 低置信度**: 所有 AI 生成的判断/建议都带置信度标识，低置信度时提醒教师人工确认
- **学生无数据**: 新学生尚未产生数据时，档案页显示 "开始第一课后将生成学习数据"
