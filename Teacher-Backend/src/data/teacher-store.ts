/**
 * Teacher data store — in-memory mirror of Teacher_Frontend/js/mock-data.js.
 *
 * MVP: data lives in-memory (8 students, 5-8 assignments, etc.).
 * When we need persistence, swap this for Prisma-backed services.
 */

import type {
  AssignmentItem,
  CalendarCourse,
  CourseBrief,
  CourseListEnvelope,
  DashboardData,
  ErrorDistributionOverTime,
  Feedback,
  KnowledgeGraphItem,
  PendingAssignment,
  RecentWorkItem,
  ReportOverview,
  ReportStudent,
  ScoreTrend,
  StudentAlert,
  StudentCard,
  StudentDetail,
  StudentTag,
  Submission,
  Suggestion,
} from '../contracts/teacher-contracts.js'

// ---------------------------------------------------------------------------
// Date helpers (mirror frontend getDate())
// ---------------------------------------------------------------------------

function getDate(daysOffset = 0, _hoursOffset: number | null = null): string {
  const d = new Date()
  d.setDate(d.getDate() + daysOffset)
  return d.toISOString()
}

function getWeekRange() {
  const today = new Date()
  const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - dayOfWeek + 1)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return { weekStart: monday.toISOString(), weekEnd: sunday.toISOString() }
}

// ---------------------------------------------------------------------------
// Today's courses (deterministic)
// ---------------------------------------------------------------------------

function buildCourses() {
  return {
    dashboard: [
      { id: 'c1', time: '10:00', endTime: '11:30', studentName: '张三', className: null, courseType: 'A-Level 数学 P3', subject: 'alevel_math', status: 'upcoming' as const },
      { id: 'c2', time: '14:00', endTime: '15:30', studentName: null, className: '高二A班', courseType: 'IELTS Reading', subject: 'ielts', status: 'upcoming' as const },
      { id: 'c3', time: '16:00', endTime: '17:30', studentName: '李四', className: null, courseType: 'A-Level 数学 P4', subject: 'alevel_math', status: 'upcoming' as const },
    ] satisfies CourseBrief[],
    calendar: generateWeekCourses(),
  }
}

function generateWeekCourses(): CalendarCourse[] {
  const courses: CalendarCourse[] = []
  const today = new Date()
  const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - dayOfWeek + 1)

  const templates = [
    { hour: 9, duration: 90, studentId: 's1', studentName: '张三', type: 'A-Level 数学 P3' },
    { hour: 10, duration: 90, studentId: 's2', studentName: '李四', type: 'A-Level 物理' },
    { hour: 14, duration: 90, classId: 'class-a', className: '高二A班', type: 'IELTS Reading' },
    { hour: 15, duration: 60, studentId: 's5', studentName: '王五', type: 'A-Level 数学 P3' },
    { hour: 16, duration: 90, studentId: 's6', studentName: '赵六', type: 'A-Level 化学' },
  ]

  for (let i = 0; i < 5; i++) {
    const day = new Date(monday)
    day.setDate(monday.getDate() + i)
    const count = (i % 2) + 1
    for (let idx = 0; idx < count; idx++) {
      const t = templates[(i + idx) % templates.length]!
      const start = new Date(day)
      start.setHours(t.hour + idx, 0, 0, 0)
      const end = new Date(start)
      end.setMinutes(start.getMinutes() + t.duration)
      courses.push({
        id: `wk-${i}-${idx}`,
        title: t.type,
        studentId: t.studentId ?? null,
        studentName: t.studentName ?? null,
        classId: t.classId ?? null,
        className: t.className ?? null,
        subject: t.type.includes('物理') ? 'alevel_physics' : t.type.includes('化学') ? 'alevel_chemistry' : t.type.includes('IELTS') ? 'ielts_reading' : 'alevel_math',
        chapter: null,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        status: start < new Date() ? 'completed' : 'upcoming',
      })
    }
  }
  return courses
}

// ---------------------------------------------------------------------------
// Store data
// ---------------------------------------------------------------------------

const { dashboard: dashCourses, calendar: weekCourses } = buildCourses()

const students: StudentCard[] = [
  { id: 's1', name: '李明', avatar: '李', currentScore: 42, targetScore: 80, status: 'risk', tags: ['计算粗心', '视觉学习者'], lastActiveAt: getDate(0, -2), className: '高二(1)班' },
  { id: 's2', name: '王雅静', avatar: '王', currentScore: 78, targetScore: 85, status: 'normal', tags: ['几何专长', '分析能力强'], lastActiveAt: getDate(0, -10), className: '高二(1)班' },
  { id: 's3', name: '赵子豪', avatar: '赵', currentScore: 94, targetScore: 90, status: 'normal', tags: ['代数精通', 'Speed Learner'], lastActiveAt: getDate(0, -5), className: '高二(1)班' },
  { id: 's4', name: '陈思雨', avatar: '陈', currentScore: 62, targetScore: 80, status: 'attention', tags: ['三角函数', '逻辑思维'], lastActiveAt: getDate(0, 0), className: '高二(2)班' },
  { id: 's5', name: '刘一帆', avatar: '刘', currentScore: 71, targetScore: 80, status: 'normal', tags: ['稳定型', '执行到位'], lastActiveAt: getDate(0, -1), className: '高二(1)班' },
  { id: 's6', name: '孙文博', avatar: '孙', currentScore: 55, targetScore: 80, status: 'attention', tags: ['缺乏练习', '需要督促'], lastActiveAt: getDate(-2), className: '高二(2)班' },
  { id: 's7', name: '周婷婷', avatar: '周', currentScore: 83, targetScore: 85, status: 'normal', tags: ['阅读强', '写作待加强'], lastActiveAt: getDate(0, -3), className: '高二(1)班' },
  { id: 's8', name: '吴梓涵', avatar: '吴', currentScore: 38, targetScore: 80, status: 'risk', tags: ['基础薄弱', '需要基础补课'], lastActiveAt: getDate(-5), className: '高二(2)班' },
]

const dashboardAssignments: PendingAssignment[] = [
  { id: 'a1', studentId: 's2', studentName: '张三', title: '数学 P3 Chapter 6 练习', subject: 'A-Level数学', submittedAt: getDate(-3), waitingDays: 3 },
  { id: 'a2', studentId: 's3', studentName: '李四', title: 'IELTS Reading 剑18 T2', subject: 'IELTS', submittedAt: getDate(-1), waitingDays: 1 },
  { id: 'a3', studentId: 's5', studentName: '王五', title: '数学 P4 微积分作业', subject: 'A-Level数学', submittedAt: getDate(0), waitingDays: 0 },
]

const alerts: StudentAlert[] = [
  { id: 'al1', studentId: 's1', studentName: '王五', type: 'score_drop', message: '近三次数学作业正确率从 85% 下降到 62%, 建议查看错题分布', timestamp: getDate(0, -2), severity: 'red' },
  { id: 'al2', studentId: 's2', studentName: '张三', type: 'repeated_error', message: '计算错误连续3次出现, 可能存在运算习惯问题', timestamp: getDate(-1), severity: 'amber' },
  { id: 'al3', studentId: 's3', studentName: '赵六', type: 'stress', message: '学习压力指数持续升高, 建议安排1对1沟通', timestamp: getDate(-1), severity: 'red' },
]

const allAssignments: AssignmentItem[] = [
  { id: 'as1', title: 'Chapter 6 综合练习', className: '高二A班', subject: '数学', assignedAt: getDate(-6), dueAt: getDate(-1), submitted: 18, total: 20, status: 'pending', pendingCount: 3 },
  { id: 'as2', title: 'IELTS Reading - Mock Test', className: '李四、王五', subject: '英语', assignedAt: getDate(-4), dueAt: getDate(2), submitted: 2, total: 2, status: 'pending', pendingCount: 2 },
  { id: 'as3', title: '微积分基础训练', className: '高二A班', subject: '数学', assignedAt: getDate(-9), dueAt: getDate(-4), submitted: 20, total: 20, status: 'completed', pendingCount: 0 },
  { id: 'as4', title: 'P4 力学练习', className: '张三', subject: '物理', assignedAt: getDate(-14), dueAt: getDate(-9), submitted: 1, total: 1, status: 'graded', pendingCount: 0 },
  { id: 'as5', title: '几何证明题集', className: '高二A班', subject: '数学', assignedAt: getDate(-2), dueAt: getDate(3), submitted: 12, total: 20, status: 'active', pendingCount: 0 },
]

const submissions: Submission[] = [
  { id: 'sub1', studentId: 's1', studentName: '李明', submittedAt: getDate(-3), score: null, status: 'submitted' },
  { id: 'sub2', studentId: 's2', studentName: '王雅静', submittedAt: getDate(-2), score: 82, status: 'graded' },
  { id: 'sub3', studentId: 's3', studentName: '赵子豪', submittedAt: getDate(-1), score: null, status: 'submitted' },
]

const knowledgeGraph: KnowledgeGraphItem[] = [
  { id: 'k1', code: 'F', name: '函数', mastery: 88, level: 'mastery', weight: 15, prerequisites: [], trend: 'stable' },
  { id: 'k2', code: 'A', name: '代数', mastery: 75, level: 'good', weight: 20, prerequisites: [], trend: 'improving' },
  { id: 'k3', code: 'C', name: '微积分', mastery: 52, level: 'weak', weight: 25, prerequisites: ['k1', 'k2'], trend: 'stable' },
  { id: 'k4', code: 'G', name: '几何', mastery: 41, level: 'critical', weight: 18, prerequisites: ['k2'], trend: 'declining' },
  { id: 'k5', code: 'T', name: '三角函数', mastery: 68, level: 'good', weight: 12, prerequisites: ['k1', 'k4'], trend: 'improving' },
  { id: 'k6', code: 'S', name: '数列', mastery: 78, level: 'good', weight: 10, prerequisites: ['k2'], trend: 'stable' },
  { id: 'k7', code: 'V', name: '向量', mastery: 45, level: 'weak', weight: 12, prerequisites: ['k4'], trend: 'stable' },
  { id: 'k8', code: 'P', name: '概率', mastery: 80, level: 'mastery', weight: 8, prerequisites: ['k2'], trend: 'stable' },
]

const tags: StudentTag[] = [
  { id: 't1', label: '计算粗心', confidence: 72, evidence: '过去两周5次作业, 3次出现计算失误', category: 'learning_issue', status: 'pending', updatedAt: getDate(-2) },
  { id: 't2', label: '视觉学习者', confidence: 85, evidence: '配合图示讲解时理解速度提升40%', category: 'learning_style', status: 'confirmed', updatedAt: getDate(-5) },
  { id: 't3', label: '逻辑思维', confidence: 76, evidence: '方法题正确率高于平均15%', category: 'positive', status: 'confirmed', updatedAt: getDate(-3) },
  { id: 't4', label: '主动提问', confidence: 68, evidence: '近一周主动提问5次, 涉及3个不同知识点', category: 'positive', status: 'pending', updatedAt: getDate(-1) },
]

const recentWork: RecentWorkItem[] = [
  { id: 'w1', date: getDate(-3), type: 'mock_exam', title: '期中模拟考', score: 82, maxScore: 100 },
  { id: 'w2', date: getDate(-5), type: 'homework', title: '几何练习 #4', score: 65, maxScore: 100 },
  { id: 'w3', date: getDate(-7), type: 'quiz', title: '函数变换小测', score: 94, maxScore: 100 },
  { id: 'w4', date: getDate(-10), type: 'homework', title: '代数应用题', score: 78, maxScore: 100 },
  { id: 'w5', date: getDate(-15), type: 'quiz', title: '周测 #3', score: 88, maxScore: 100 },
]

const feedback: Feedback = {
  accuracy: 72,
  accuracyChange: -15,
  avgTimePerQuestion: 23,
  timeChange: 5,
  hintsPerQuestion: 1.2,
  errorDistribution: { knowledge: 20, method: 30, calculation: 40, reading: 10, execution: 0 },
  accuracyTrend: [78, 75, 72, 70, 74, 72, 72],
  alertMessage: '计算错误连续3次出现, 建议下节课重点复习运算技巧, 配合 2-3 道专项计算训练',
  teacherConfirmed: false,
}

const execution = {
  weeklyCompleted: 4,
  weeklyTotal: 6,
  avgDelayDays: 0.5,
  last14Days: [3, 2, 4, 3, 1, 0, 2, 3, 2, 4, 3, 2, 3, 1],
}

const suggestions: Suggestion[] = [
  { id: 'sg1', title: '计算专项训练', detail: '建议下节课前10分钟进行计算专项训练, 重点突破符号运算', type: 'method', status: 'pending' },
  { id: 'sg2', title: '减轻作业压力', detail: '该生近期压力偏高, 建议减少作业量20%, 给学生喘息空间', type: 'pressure', status: 'pending' },
  { id: 'sg3', title: '推进三角函数章节', detail: '三角函数章节的变式题正确率提升至78%, 可以推进到下一章节', type: 'progress', status: 'pending' },
]

const { weekStart, weekEnd } = getWeekRange()

// ---------------------------------------------------------------------------
// Report data
// ---------------------------------------------------------------------------

const reportOverview: ReportOverview = {
  classAvg: { value: 76.3, change: 2.4, trend: 'up' },
  completionRate: { value: 87, change: 0, trend: 'stable' },
  attentionCount: { value: 3, change: 0, trend: 'stable' },
  avgStudyHours: { value: 4.2, change: -0.3, trend: 'down' },
}

const scoreTrend: ScoreTrend = {
  dates: ['W1', 'W2', 'W3', 'W4'],
  classAverage: [72, 73, 75, 74, 76, 75, 77, 76, 78, 77, 76, 78, 79, 78, 80, 79, 78, 80, 81, 80, 82, 81, 80, 82, 83, 82, 81, 83, 84, 83],
}

const errorDistribution: ErrorDistributionOverTime = {
  labels: ['第1周', '第2周', '第3周', '第4周'],
  series: {
    knowledge: [25, 22, 20, 18],
    method: [30, 32, 30, 28],
    calculation: [35, 36, 38, 40],
    reading: [10, 10, 12, 14],
  },
}

const attentionStudents: ReportStudent[] = [
  { studentId: 's4', name: '陈思雨', avatar: '陈', riskFactor: 'Logic Gap', focusLevel: 'P0', avgMinutesPerDay: 78, accuracyChange: -5 },
  { studentId: 's5', name: '王雅静', avatar: '王', riskFactor: 'Calculation Fluency', focusLevel: 'P1', avgMinutesPerDay: 42, accuracyChange: -2 },
  { studentId: 's6', name: '刘一帆', avatar: '刘', riskFactor: 'Attention Drift', focusLevel: 'P2', avgMinutesPerDay: 115, accuracyChange: 3 },
]

// ---------------------------------------------------------------------------
// Student detail
// ---------------------------------------------------------------------------

const studentDetail: StudentDetail = {
  id: 's1',
  name: '李明',
  avatar: '李',
  grade: '10年级',
  className: 'A 班',
  subjects: ['alevel_math'],
  targetScoreLabel: 'A*',
  currentScore: 78,
  targetScore: 85,
  stressIndex: 62,
  stressLabel: '压力偏高',
  teachingStyle: '渐进引导型',
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class TeacherStore {
  // Dashboard
  getDashboard(): DashboardData {
    return {
      pending: {
        ungradedCount: 5,
        latestUngraded: '张三 - 数学 P3 练习',
        stressAlertCount: 2,
        stressStudents: ['王五', '赵六'],
        stagnantCount: 1,
        stagnantStudents: ['周七'],
        abnormalCount: 2,
      },
      todayCourses: dashCourses,
      weekCourseCount: 12,
      pendingAssignments: dashboardAssignments,
      studentAlerts: alerts,
    }
  }

  // Courses
  getCourses(): CourseListEnvelope {
    return { weekStart, weekEnd, courses: weekCourses }
  }

  // Students list
  getStudents(search?: string, classId?: string, risk?: string): StudentCard[] {
    let list = students.slice()
    if (search) {
      const kw = search.toLowerCase()
      list = list.filter(s => s.name.includes(kw) || s.tags.some(t => t.includes(kw)))
    }
    if (classId) {
      list = list.filter(s => s.className.includes(classId))
    }
    if (risk) {
      list = list.filter(s => s.status === risk)
    }
    return list
  }

  // Student detail
  getStudentDetail(id: string): StudentDetail | null {
    const student = students.find(s => s.id === id)
    if (!student) return null
    return {
      ...studentDetail,
      id: student.id,
      name: student.name,
      avatar: student.avatar,
      currentScore: student.currentScore,
      targetScore: student.targetScore,
    }
  }

  // Student sub-resources
  getKnowledgeGraph(_studentId: string, _subject?: string): KnowledgeGraphItem[] {
    return knowledgeGraph
  }

  getStudentTags(_studentId: string): StudentTag[] {
    return tags
  }

  getStudentFeedback(_studentId: string, _period?: string): Feedback {
    return feedback
  }

  getStudentSuggestions(_studentId: string): Suggestion[] {
    return suggestions
  }

  getStudentExecution(_studentId: string) {
    return execution
  }

  getStudentRecentWork(_studentId: string): RecentWorkItem[] {
    return recentWork
  }

  // Assignments
  getAssignments(): AssignmentItem[] {
    return allAssignments
  }

  getAssignment(id: string): AssignmentItem | null {
    return allAssignments.find(a => a.id === id) ?? null
  }

  getSubmissions(_assignmentId: string): Submission[] {
    return submissions
  }

  gradeSubmission(submissionId: string, score: number, comment?: string): Submission | null {
    const sub = submissions.find(s => s.id === submissionId)
    if (!sub) return null
    sub.score = score
    // @ts-expect-error mutate store
    sub.comment = comment
    sub.status = 'graded'
    return sub
  }

  // Reports
  getReportOverview(): ReportOverview {
    return reportOverview
  }

  getScoreTrend(): ScoreTrend {
    return scoreTrend
  }

  getErrorDistribution(): ErrorDistributionOverTime {
    return errorDistribution
  }

  getAttentionStudents(type?: string): ReportStudent[] {
    if (type === 'improved') {
      return [
        { studentId: 's3', name: '赵子豪', avatar: '赵', scoreChange: 8, accuracyChange: 5, breakthrough: '代数模块进步显著', avgMinutesPerDay: 95 },
        { studentId: 's7', name: '周婷婷', avatar: '周', scoreChange: 6, accuracyChange: 3, breakthrough: '阅读理解正确率提升', avgMinutesPerDay: 80 },
      ]
    }
    return attentionStudents
  }
}

/** Singleton — the entire teacher portal shares one store. */
export const teacherStore = new TeacherStore()
