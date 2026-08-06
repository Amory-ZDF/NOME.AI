# NOME.AI — 前端接口字段文档 (API Contract)

> Version: 1.0 | Date: 2026-08-05 | Scope: 前端视角的接口契约
>
> **架构说明：当前阶段为纯前端实现。** 本文档定义前端期望的数据结构与接口形态。
> 后端可按此契约实现真实 API；在 API 就绪前，前端使用同构的 Mock 数据驱动。
>
> 约定：
> - Base URL: `/api/v1`
> - 认证: `Authorization: Bearer <token>`（后续接入）
> - 时间格式: ISO 8601 (`2026-08-05T10:00:00+08:00`)
> - 所有列表接口统一分页参数: `?page=1&pageSize=20`
> - 统一响应包: `{ code: 0, message: "ok", data: <T> }`

---

## 目录

- [1. 通用枚举](#1-通用枚举)
- [2. 教师端接口](#2-教师端接口)
  - [2.1 工作台](#21-工作台)
  - [2.2 课程日历](#22-课程日历)
  - [2.3 作业管理](#23-作业管理)
  - [2.4 学生档案](#24-学生档案)
  - [2.5 数据报告](#25-数据报告)
- [3. 学生端接口](#3-学生端接口)
  - [3.1 首页](#31-首页)
  - [3.2 做题](#32-做题)
  - [3.3 学后总结](#33-学后总结)
  - [3.4 错题本](#34-错题本)
  - [3.5 笔记](#35-笔记)
  - [3.6 题库](#36-题库)
  - [3.7 学习档案](#37-学习档案)

---

## 1. 通用枚举

```typescript
// 学科
type Subject = 'alevel_math' | 'alevel_physics' | 'alevel_chemistry' | 'ielts_reading' | 'ielts_writing';

// 优先级
type Priority = 'P0' | 'P1' | 'P2';

// 错因分类
type ErrorType = 'knowledge' | 'method' | 'calculation' | 'reading' | 'execution' | 'expression' | 'habit';
// knowledge=知识错误 method=方法错误 calculation=计算错误 reading=审题错误
// execution=执行错误 expression=表达错误 habit=习惯问题

// 掌握度等级（由 mastery 数值推导）
type MasteryLevel = 'mastery' | 'good' | 'weak' | 'critical';
// mastery: >=80 | good: 60-79 | weak: 40-59 | critical: <40

// 课程状态
type CourseStatus = 'upcoming' | 'in_progress' | 'completed' | 'cancelled';

// 作业状态
type AssignmentStatus = 'active' | 'pending' | 'grading' | 'graded' | 'completed' | 'overdue';

// 任务类型
type TaskType = 'teacher_assigned' | 'ai_recommended' | 'error_review';

// 错题状态
type ErrorStatus = 'pending_review' | 'reviewing' | 'mastered';

// 预警严重度
type AlertSeverity = 'red' | 'amber' | 'green';

// 学生风险等级
type RiskLevel = 'normal' | 'attention' | 'risk';

// 题型
type QuestionType = 'choice' | 'fill_blank' | 'calculation' | 'proof' | 'reading' | 'writing';

// 提示层级（渐进式解答）
type HintLevel = 1 | 2 | 3 | 4 | 5 | 6;
```

---

## 2. 教师端接口

### 2.1 工作台

#### `GET /teacher/dashboard` — 工作台聚合数据

| 字段 | 类型 | 说明 |
|------|------|------|
| `pending.ungradedCount` | number | 待批改作业数 |
| `pending.latestUngraded` | string | 最近待批改摘要，如 "张三 - 数学P3" |
| `pending.stressAlertCount` | number | 压力风险学生数 |
| `pending.stressStudents` | string[] | 压力风险学生姓名 |
| `pending.stagnantCount` | number | 长期停滞学生数 |
| `pending.stagnantStudents` | string[] | 停滞学生姓名 |
| `pending.abnormalCount` | number | 异常作业数 |
| `todayCourses` | CourseBrief[] | 今日课程（见下） |
| `weekCourseCount` | number | 本周课程总数 |
| `pendingAssignments` | PendingAssignment[] | 待批改作业 Top3 |
| `studentAlerts` | StudentAlert[] | 学生动态预警 Top3 |

**CourseBrief**
| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 课程 ID |
| `time` | string | 开始时间 "10:00" |
| `endTime` | string | 结束时间 "11:30" |
| `studentName` | string \| null | 学生姓名（一对一） |
| `className` | string \| null | 班级名（班课） |
| `courseType` | string | "A-Level 数学 P3" |
| `subject` | Subject | 学科枚举 |
| `status` | CourseStatus | 课程状态 |

**PendingAssignment**
| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 提交记录 ID |
| `studentId` | string | 学生 ID |
| `studentName` | string | 学生姓名 |
| `title` | string | 作业标题 |
| `subject` | string | 学科显示名 |
| `submittedAt` | string (ISO) | 提交时间 |
| `waitingDays` | number | 已等待天数（>2 天前端显示琥珀色警示） |

**StudentAlert**
| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 预警 ID |
| `studentId` | string | 学生 ID |
| `studentName` | string | 学生姓名 |
| `type` | string | `score_drop` / `repeated_error` / `stress` / `stagnant` / `positive` |
| `message` | string | 预警描述文案 |
| `severity` | AlertSeverity | 严重度（决定左侧色条颜色） |
| `timestamp` | string (ISO) | 产生时间 |

---

### 2.2 课程日历

#### `GET /teacher/courses?start={ISO}&end={ISO}` — 日期范围课程

返回 `CalendarCourse[]`：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 课程 ID |
| `title` | string | "A-Level 数学 P3 - Chapter 7" |
| `studentId` / `studentName` | string \| null | 一对一学生 |
| `classId` / `className` | string \| null | 班级 |
| `subject` | Subject | 学科 |
| `chapter` | string \| null | 章节 |
| `startTime` / `endTime` | string (ISO) | 起止时间 |
| `status` | CourseStatus | 状态 |

#### `GET /teacher/courses/{courseId}/lesson-plan` — AI 教学大纲

| 字段 | 类型 | 说明 |
|------|------|------|
| `courseId` | string | 课程 ID |
| `review` | string[] | 上节课回顾要点 |
| `newIssues` | string[] | 课后暴露的新问题（AI 分析） |
| `outline` | OutlineItem[] | 本节课大纲 |
| `outline[].order` | number | 序号 |
| `outline[].content` | string | 内容 |
| `outline[].duration` | number | 建议时长（分钟） |
| `outline[].difficulty` | 1-5 | 难度 |
| `suggestedExamples` | QuestionRef[] | 建议例题引用 |
| `masteredContent` | string[] | 已掌握可快速带过的内容 |
| `pacingGuide` | number[] | 节奏曲线各段高度值（0-100，前端渲染波形图） |
| `suggestedHomework` | object \| null | 建议布置的作业 |
| `teacherModifications` | TeacherEdit[] | 教师已做的修改记录 |

#### `PUT /teacher/courses/{courseId}/lesson-plan` — 教师修改大纲

请求体：`{ adoptedItems: string[], ignoredItems: string[], customItems: string[], note?: string }`

---

### 2.3 作业管理

#### `GET /teacher/assignments?status=&page=` — 作业列表

返回 `Assignment[]`：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 作业 ID |
| `title` | string | 作业名称 |
| `className` | string | 班级/学生显示名 |
| `subject` | string | 学科显示名 |
| `assignedAt` | string (ISO) | 布置时间 |
| `dueAt` | string (ISO) | 截止时间 |
| `submitted` | number | 已提交份数 |
| `total` | number | 应交总份数 |
| `pendingCount` | number | 待批改份数 |
| `status` | AssignmentStatus | 状态 |

#### `GET /teacher/assignments/{id}/submissions` — 提交列表

返回 `Submission[]`：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 提交 ID |
| `studentId` / `studentName` | string | 学生 |
| `submittedAt` | string (ISO) | 提交时间 |
| `score` | number \| null | 教师评分 |
| `aiSuggestedScore` | number | AI 建议分数 |
| `aiFeedback` | string | AI 生成的反馈（预填进教师评语框） |
| `timeSpent` | number | 用时（分钟） |
| `hintsUsedPerQuestion` | number | 平均每题提示使用次数 |
| `status` | 'submitted' \| 'graded' \| 'reviewed' | 批改状态 |
| `answers` | StudentAnswer[] | 作答内容 |

**StudentAnswer**
| 字段 | 类型 | 说明 |
|------|------|------|
| `questionId` | string | 题目 ID |
| `questionContent` | string | 题目内容（HTML/markdown） |
| `questionScore` | number | 该题满分 |
| `studentAnswer` | string | 学生作答 |
| `aiAnnotations` | Annotation[] | AI 标注层 |

**Annotation**
| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | 'error' \| 'correct' | 错误/正确标注 |
| `location` | string | 出错位置描述或文本片段 |
| `message` | string | AI 纠错说明，如 "反向速度应取负值" |

#### `PUT /teacher/submissions/{submissionId}/grade` — 提交批改

请求体：
| 字段 | 类型 | 说明 |
|------|------|------|
| `score` | number | 教师最终评分 |
| `feedback` | string | 教师评语 |
| `errorTags` | ErrorType[] | 错因分类标签（多选） |

#### `POST /teacher/assignments` — 布置作业

请求体：
| 字段 | 类型 | 说明 |
|------|------|------|
| `title` | string | 作业名称 |
| `questionIds` | string[] | 从题库选择的题目 |
| `targetType` | 'class' \| 'students' | 布置对象类型 |
| `classId` | string \| null | 班级 ID |
| `studentIds` | string[] | 学生 ID 列表 |
| `dueAt` | string (ISO) | 截止时间 |
| `hintLevel` | 'full' \| 'limited' \| 'none' | 提示开放程度 |
| `redoRequired` | boolean | 是否要求重做 |

---

### 2.4 学生档案

#### `GET /teacher/students?search=&classId=&risk=&sort=&page=` — 学生列表

返回 `StudentCard[]`：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 学生 ID |
| `name` | string | 姓名 |
| `avatar` | string | 头像 URL 或首字 |
| `className` | string | 班级 |
| `currentScore` | number | 当前分数（0-100） |
| `targetScore` | number | 目标分数 |
| `status` | RiskLevel | 风险等级（normal/attention/risk） |
| `tags` | string[] | 关键标签（最多3个） |
| `lastActiveAt` | string (ISO) | 最近活跃时间 |

#### `GET /teacher/students/{studentId}` — 学生档案详情

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` / `name` / `avatar` | string | 基础信息 |
| `grade` / `className` | string | 年级班级 |
| `subjects` | Subject[] | 在读学科 |
| `targetScoreLabel` | string | "A*" |
| `currentScore` / `targetScore` | number | 当前/目标分数 |
| `stressIndex` | number | 压力指数 0-100（仅教师可见） |
| `stressLabel` | string | "压力偏高" |
| `teachingStyle` | string | 适合讲解方式，如 "渐进引导型" |

#### `GET /teacher/students/{studentId}/knowledge-graph?subject=` — 知识图谱

返回 `KnowledgeNode[]`：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 节点 ID |
| `code` | string | 单字母代号（图谱渲染用） |
| `name` | string | 知识点名，如 "微积分" |
| `mastery` | number | 掌握度 0-100 |
| `level` | MasteryLevel | 掌握等级 |
| `weight` | number | 考试权重（决定节点大小） |
| `prerequisites` | string[] | 前置知识节点 ID |
| `trend` | 'improving' \| 'stable' \| 'declining' | 变化趋势 |

#### `GET /teacher/students/{studentId}/tags` — 动态标签

返回 `StudentTag[]`：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 标签 ID |
| `label` | string | 标签名，如 "计算粗心" |
| `confidence` | number | 置信度 0-100 |
| `evidence` | string | 证据描述（hover 展示） |
| `category` | 'learning_issue' \| 'learning_style' \| 'psychological' \| 'positive' | 类别 |
| `status` | 'pending' \| 'confirmed' \| 'rejected' \| 'modified' | 教师确认状态 |
| `updatedAt` | string (ISO) | 更新时间 |

#### `PUT /teacher/students/{studentId}/tags/{tagId}` — 教师确认/驳回标签

请求体：`{ action: 'confirm' | 'reject' | 'modify', modifiedLabel?: string, note?: string }`

#### `GET /teacher/students/{studentId}/feedback?period=3d|7d|30d` — 学习反馈

| 字段 | 类型 | 说明 |
|------|------|------|
| `accuracy` | number | 正确率 |
| `accuracyChange` | number | 环比变化（负数前端显示琥珀色 ↓） |
| `avgTimePerQuestion` | number | 平均每题用时（分钟） |
| `timeChange` | number | 用时变化 |
| `hintsPerQuestion` | number | 提示依赖度 |
| `errorDistribution` | Record\<ErrorType, number\> | 错因分布百分比 |
| `accuracyTrend` | number[] | 趋势序列（柱状图渲染） |
| `alertMessage` | string \| null | "需要关注" 提示文案 |
| `teacherConfirmed` | boolean | 教师是否已确认 |

#### `GET /teacher/students/{studentId}/suggestions` — AI 教学建议

返回 `AISuggestion[]`：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 建议 ID |
| `title` | string | 建议标题 |
| `detail` | string | 建议详情 |
| `type` | 'method' \| 'pressure' \| 'progress' | 建议类型 |
| `status` | 'pending' \| 'adopted' \| 'ignored' | 处理状态 |

#### `POST /teacher/students/{studentId}/suggestions/{suggestionId}/respond`

请求体：`{ action: 'adopt' | 'ignore' }`

#### `GET /teacher/students/{studentId}/execution` — 执行记录

| 字段 | 类型 | 说明 |
|------|------|------|
| `weeklyCompleted` | number | 本周完成任务数 |
| `weeklyTotal` | number | 本周任务总数 |
| `avgDelayDays` | number | 平均延迟天数 |
| `last14Days` | number[] | 近14天每日完成数（柱状图渲染） |

#### `GET /teacher/students/{studentId}/recent-work` — 最近作业与模考

返回 `{ id, date, type, title, score, maxScore }[]`，type 为 `homework` / `quiz` / `mock_exam`。

---

### 2.5 数据报告

#### `GET /teacher/reports/overview?period=week|month|semester` — 班级概览

| 字段 | 类型 | 说明 |
|------|------|------|
| `classAvg.value` | number | 班级平均分 |
| `classAvg.change` | number | 环比变化 |
| `completionRate.value` | number | 作业完成率 % |
| `attentionCount.value` | number | 需关注学生数 |
| `avgStudyHours.value` | number | 人均日学习时长 |

#### `GET /teacher/reports/score-trend?period=` — 成绩趋势

返回：
| 字段 | 类型 | 说明 |
|------|------|------|
| `dates` | string[] | 日期序列 |
| `classAverage` | number[] | 班级平均分序列 |
| `students` | `{ studentId, name, scores: number[] }[]` | 个人序列（细灰线） |

#### `GET /teacher/reports/error-distribution?period=` — 错因分布变化

返回：
| 字段 | 类型 | 说明 |
|------|------|------|
| `labels` | string[] | 时间桶，如 ["第1周", ...] |
| `series` | Record\<ErrorType, number[]\> | 各错因的百分比序列 |

#### `GET /teacher/reports/students?type=improved|attention` — 学生排行/关注

返回：
| 字段 | 类型 | 说明 |
|------|------|------|
| `studentId` / `name` / `avatar` | string | 学生 |
| `riskFactor` | string | 风险描述（type=attention 时） |
| `focusLevel` | Priority | 关注优先级 |
| `avgMinutesPerDay` | number | 日均学习时长 |
| `scoreChange` | number | 分数变化（type=improved 时） |
| `accuracyChange` | number | 正确率变化 |
| `breakthrough` | string | 关键突破描述 |

---

## 3. 学生端接口

### 3.1 首页

#### `GET /student/home` — 首页聚合数据

| 字段 | 类型 | 说明 |
|------|------|------|
| `greeting.message` | string | 激励语（AI 生成） |
| `greeting.pendingTasks` | number | 待完成任务数 |
| `todayTasks` | Task[] | 今日任务（见下） |
| `moduleStats.notesCount` | number | 笔记总数 |
| `moduleStats.weeklyExercises` | number | 本周已做题数 |
| `moduleStats.latestAccuracy` | number | 最近练习正确率 |
| `moduleStats.pendingErrorReview` | number | 待复盘错题数 |
| `learningSummary.overallMastery` | number | 总掌握度 % |
| `learningSummary.weeklyCompleted` / `weeklyTotal` | number | 本周任务进度 |
| `learningSummary.overdueTasks` | number | 逾期任务数 |
| `learningSummary.weakTopics` | string[] | 薄弱知识点名 |
| `learningSummary.knowledgeHeatmap` | HeatmapCell[] | 热力图数据 |

**Task**
| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 任务 ID |
| `title` | string | 任务标题 |
| `type` | TaskType | 教师布置 / AI推荐 / 错题复盘 |
| `subject` | string | 学科显示名 |
| `estimatedMinutes` | number | 预计耗时 |
| `dueAt` | string (ISO) \| null | 截止时间 |
| `assignedBy` | string \| null | 布置教师名 |
| `priority` | Priority | 优先级 |
| `lastAccuracy` | number \| null | 上次同类练习正确率 |
| `isOverdue` | boolean | 是否逾期 |
| `status` | 'pending' \| 'in_progress' \| 'completed' | 状态 |

**HeatmapCell**: `{ topicId: string, topicName: string, mastery: number }`

#### `PUT /student/tasks/{taskId}/complete` — 完成任务

请求体：`{ completed: true }`

#### `POST /student/tasks/{taskId}/cannot-complete` — 反馈无法完成

请求体：`{ reason?: string }` → 后端生成给教师的调整建议。

---

### 3.2 做题

#### `GET /student/exercise/{taskId}` — 获取练习

| 字段 | 类型 | 说明 |
|------|------|------|
| `taskId` | string | 任务 ID |
| `title` | string | 练习标题 |
| `totalQuestions` | number | 总题数 |
| `questions` | Question[] | 题目列表 |

**Question**
| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 题目 ID |
| `order` | number | 题号 |
| `content` | string | 题干（HTML/markdown，含 KaTeX 公式） |
| `type` | QuestionType | 题型 |
| `topic` | string | 知识点，如 "微积分 - 极值" |
| `topicId` | string | 知识点 ID |
| `difficulty` | 1-5 | 难度星级 |
| `options` | string[] \| null | 选择题选项 |
| `passage` | string \| null | IELTS 阅读原文 |

#### `POST /student/exercise/{taskId}/answer` — 提交单题答案

请求体：`{ questionId: string, answer: string, timeSpentSec: number }`

响应：
| 字段 | 类型 | 说明 |
|------|------|------|
| `isCorrect` | boolean | 是否正确 |
| `correctAnswer` | string | 正确答案（答错时返回） |
| `errorType` | ErrorType \| null | AI 判定的错因 |
| `errorAnalysis` | string | 错因分析文案 |
| `hintAvailable` | boolean | 是否可解锁提示 |
| `nextHintLevel` | HintLevel \| null | 下一层提示级别 |

#### `POST /student/exercise/{taskId}/hint` — 解锁提示

请求体：`{ questionId: string, level: HintLevel }`

响应：
| 字段 | 类型 | 说明 |
|------|------|------|
| `level` | HintLevel | 提示层级 |
| `title` | string | 层级名（确认题意/相关知识点/解题方法/关键步骤/完整解答/变式题） |
| `content` | string | 提示内容 |

#### `POST /student/exercise/{taskId}/submit` — 提交整套练习

响应：`{ sessionId: string }` → 前端跳转 `/summary/{sessionId}`

---

### 3.3 学后总结

#### `GET /student/summary/{sessionId}` — 总结数据

| 字段 | 类型 | 说明 |
|------|------|------|
| `taskTitle` | string | 练习标题 |
| `totalQuestions` / `correctCount` | number | 题数统计 |
| `accuracy` | number | 正确率 % |
| `accuracyChange` | number | 与上次对比 |
| `timeSpentMinutes` | number | 总用时 |
| `independentCount` | number | 独立完成题数（未用提示） |
| `avgHintsPerQuestion` | number | 平均提示使用 |
| `errorDistribution` | Record\<ErrorType, number\> | 错因分布 |
| `errorDetails` | ErrorDetail[] | 逐题错因 |
| `errorCards` | ErrorCard[] | 错题卡 |
| `knowledgeMapping` | KnowledgeNode[] | 涉及的知识图谱节点 |
| `recommendations` | Recommendation[] | 下一步建议 |

**ErrorDetail**: `{ questionNumber, errorType, description, studentApproach, correctApproach, relatedTopic, topicId, isRepeat, repeatCount }`

**ErrorCard**: `{ questionId, questionSummary, whereWrong, whyWrong, relatedTopic, isRepeat, addedToErrorBook }`

**Recommendation**: `{ type: 'variant_question'|'topic_review'|'practice_set', message, actionTaskId? }`

#### `POST /student/summary/{sessionId}/add-to-error-book`

请求体：`{ questionIds: string[] }`

---

### 3.4 错题本

#### `GET /student/errors?status=&subject=&sort=&page=` — 错题列表

返回 `ErrorBookItem[]`：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 错题 ID |
| `questionSummary` | string | 题干摘要（2行截断） |
| `questionContent` | string | 完整题干 |
| `subject` | string | 学科 |
| `errorType` | ErrorType | 错因 |
| `errorDescription` | string | 错误分析摘要 |
| `relatedTopic` / `topicId` | string | 关联知识点 |
| `repeatCount` | number | 重复出错次数 |
| `status` | ErrorStatus | 待复盘/复习中/已掌握 |
| `firstOccurredAt` / `lastOccurredAt` | string (ISO) | 首次/最近出错时间 |
| `correctAnswer` | string | 正确答案 |
| `analysis` | string | 完整解析 |

同时返回汇总：`{ pendingReview, reviewing, mastered, masteryRate }`

#### `POST /student/errors/{errorId}/redo` — 重做提交

请求体：`{ answer: string, timeSpentSec: number }`

响应：`{ isCorrect: boolean, comparison: string, newRepeatCount: number, canMarkMastered: boolean }`

#### `PUT /student/errors/{errorId}/master` — 标记已掌握

---

### 3.5 笔记

#### `GET /student/notes/folders` — 文件夹树

返回 `NoteFolder[]`：`{ id, name, parentId, noteCount, autoCreated, children[] }`

#### `GET /student/notes?folderId=&search=&page=` — 笔记列表

返回 `NoteListItem[]`：`{ id, title, preview, updatedAt, linkedTopicName, source, linkedErrorCount }`
- `source`: 'typed' | 'handwritten' | 'photo' | 'ai_organized'

#### `GET /student/notes/{noteId}` — 笔记详情

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` / `title` | string | 基础 |
| `content` | string | 富文本 JSON（Tiptap 格式） |
| `folderId` / `folderPath` | string | 归属文件夹 |
| `linkedTopics` | `{ id, name }[]` | 关联知识点 |
| `linkedErrors` | `{ id, summary }[]` | 关联错题 |
| `aiSuggestions` | NoteAISuggestion[] | AI 整理建议 |

**NoteAISuggestion**: `{ type: 'link_topic'|'split_note'|'related_content', message, payload? }`

#### `POST /student/notes` / `PUT /student/notes/{id}` / `DELETE /student/notes/{id}`

增改删，body 为对应字段子集。

#### `POST /student/notes/upload` — 上传识别

`multipart/form-data` 上传文件（手写照片/PDF/截图）。

响应：
| 字段 | 类型 | 说明 |
|------|------|------|
| `noteId` | string | 生成的笔记 ID |
| `recognizedText` | string | OCR 文本 |
| `suggestedFolder` | `{ id, path }` | AI 建议分类 |
| `suggestedTopics` | `{ id, name }[]` | AI 识别出的知识点 |

#### `POST /student/notes/{noteId}/ai-organize` — 一键整理

响应：`{ updated: boolean, changes: string[] }`

---

### 3.6 题库

#### `GET /student/bank?subject=&topicId=&difficulty=&type=&source=&status=&search=&recommend=&page=` — 题目列表

返回 `BankQuestion[]`：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 题目 ID |
| `contentPreview` | string | 题干预览（2行） |
| `type` | QuestionType | 题型 |
| `subject` / `topic` / `chapter` | string | 分类 |
| `difficulty` | 1-5 | 难度 |
| `source` | 'past_exam' \| 'mock' \| 'teacher_upload' | 来源 |
| `sourceDetail` | string | "2025年5月真题" |
| `globalCorrectRate` | number | 全体正确率 % |
| `attemptCount` | number | 做过人数 |
| `studentStatus` | 'not_attempted' \| 'correct' \| 'wrong' | 当前学生状态 |

推荐区（`recommend=1` 时附带）：
`{ reason: string, basedOnTopics: string[], questions: BankQuestion[] }`

#### `POST /student/bank/upload` — 上传试卷

响应：`{ paperId, questions: BankQuestion[], unrecognized: string[] }`（AI 拆题结果，待学生确认）

---

### 3.7 学习档案

#### `GET /student/profile` — 档案聚合

| 字段 | 类型 | 说明 |
|------|------|------|
| `user.name` / `avatar` | string | 基础 |
| `user.joinedDays` | number | 加入天数 |
| `overview.currentScore` / `targetScore` | number | 分数 |
| `overview.dailyHours` | number | 日均学习时长 |
| `overview.streak` | number | 连续学习天数 |
| `overview.totalQuestions` | number | 总练习量 |
| `overview.overallAccuracy` | number | 总正确率 |

#### `GET /student/knowledge-graph?subject=` — 知识图谱

同教师端 `KnowledgeNode[]` 结构。

#### `GET /student/progress-timeline` — 进步轨迹

返回 `{ date, score, mastery, event? }[]`，event 为关键节点标注（如 "开始三角函数专项训练"）。

#### `GET /student/error-patterns` — 错误模式

返回：`{ distribution: Record<ErrorType, number>, insight: string }`

#### `GET /student/achievements` — 成就列表

返回 `Achievement[]`：`{ id, name, description, icon, earned, earnedAt?, category, progress?: { current, target } }`

#### `GET /student/settings` / `PUT /student/settings` — 设置

| 字段 | 类型 | 说明 |
|------|------|------|
| `toneStyle` | number (0-100) | 语气滑块：0=温和鼓励 100=严格督学 |
| `dailyGoalHours` | number | 每日学习目标 |
| `reminders.task` | boolean | 任务提醒 |
| `reminders.review` | boolean | 复盘提醒 |

---

## 附：前端 Mock 对应关系

当前纯前端实现中，以上接口均由 `frontend/js/mock-data.js` 模拟：

| Mock 模块 | 对应接口 |
|-----------|---------|
| `MockData.dashboard` | `GET /teacher/dashboard` |
| `MockData.calendar.weekCourses` | `GET /teacher/courses` |
| `MockData.students` | `GET /teacher/students` |
| `MockData.studentDetail` | `GET /teacher/students/{id}` 系列 |
| `MockData.assignments` | `GET /teacher/assignments` |
| `MockData.reports` | `GET /teacher/reports/*` |

后端就绪后，前端仅需将数据获取层从 MockData 切换为 fetch 调用，页面渲染逻辑不变。
