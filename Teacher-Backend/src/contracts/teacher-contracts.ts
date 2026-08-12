import { z } from 'zod'

import { cloneSafeJson, type JsonValue } from '../common/json/safe-json.js'

const invalidContractInput = Symbol('invalid contract input')

function normalizeContractInput(value: unknown): JsonValue | typeof invalidContractInput {
  try {
    return cloneSafeJson(value)
  } catch {
    return invalidContractInput
  }
}

function safeStrictObject<const Shape extends z.ZodRawShape>(shape: Shape) {
  return z.preprocess(normalizeContractInput, z.strictObject(shape))
}

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const nonEmptyString = z.string().min(1).refine((value) => value.trim().length > 0, {
  message: 'Must not be blank',
})

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (match === null) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

export const isoDateTimeSchema = z.string().refine((value) => {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/.exec(value)
  if (match === null || !isCalendarDate(match[1] ?? '')) return false
  const hour = Number(match[2])
  const minute = Number(match[3])
  const second = Number(match[4])
  if (hour > 23 || minute > 59 || second > 59) return false
  return Number.isFinite(Date.parse(value))
})

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const studentStatusSchema = z.enum(['risk', 'attention', 'normal', 'excellent'])
export type StudentStatus = z.infer<typeof studentStatusSchema>

export const assignmentStatusSchema = z.enum(['active', 'pending', 'grading', 'graded', 'completed', 'overdue'])
export type AssignmentStatus = z.infer<typeof assignmentStatusSchema>

export const alertSeveritySchema = z.enum(['red', 'amber', 'green'])
export type AlertSeverity = z.infer<typeof alertSeveritySchema>

export const alertTypeSchema = z.enum(['score_drop', 'repeated_error', 'stress', 'stagnant', 'positive'])
export type AlertType = z.infer<typeof alertTypeSchema>

export const masteryLevelSchema = z.enum(['mastery', 'good', 'weak', 'critical'])
export type MasteryLevel = z.infer<typeof masteryLevelSchema>

export const tagCategorySchema = z.enum(['learning_issue', 'learning_style', 'psychological', 'positive'])
export type TagCategory = z.infer<typeof tagCategorySchema>

export const workTypeSchema = z.enum(['homework', 'quiz', 'mock_exam'])
export type WorkType = z.infer<typeof workTypeSchema>

export const riskLevelSchema = z.enum(['normal', 'attention', 'risk'])
export type RiskLevel = z.infer<typeof riskLevelSchema>

export const reportTrendSchema = z.enum(['up', 'down', 'stable'])
export type ReportTrend = z.infer<typeof reportTrendSchema>

export const suggestionTypeSchema = z.enum(['method', 'pressure', 'progress'])
export type SuggestionType = z.infer<typeof suggestionTypeSchema>

export const courseStatusSchema = z.enum(['upcoming', 'in_progress', 'completed', 'cancelled'])
export type CourseStatus = z.infer<typeof courseStatusSchema>

export const prioritySchema = z.enum(['P0', 'P1', 'P2'])
export type Priority = z.infer<typeof prioritySchema>

// ---------------------------------------------------------------------------
// Dashboard (per api-contract.md §2.1)
// ---------------------------------------------------------------------------

/** CourseBrief */
export const courseBriefSchema = safeStrictObject({
  id: nonEmptyString,
  time: z.string(),
  endTime: z.string(),
  studentName: z.string().nullable(),
  className: z.string().nullable(),
  courseType: z.string(),
  subject: z.string(),
  status: courseStatusSchema,
})
export type CourseBrief = z.infer<typeof courseBriefSchema>

/** PendingAssignment */
export const pendingAssignmentSchema = safeStrictObject({
  id: nonEmptyString,
  studentId: nonEmptyString,
  studentName: z.string(),
  title: z.string(),
  subject: z.string(),
  submittedAt: isoDateTimeSchema,
  waitingDays: z.number().int().min(0),
})
export type PendingAssignment = z.infer<typeof pendingAssignmentSchema>

/** StudentAlert */
export const studentAlertSchema = safeStrictObject({
  id: nonEmptyString,
  studentId: nonEmptyString,
  studentName: z.string(),
  type: alertTypeSchema,
  message: z.string(),
  severity: alertSeveritySchema,
  timestamp: isoDateTimeSchema,
})
export type StudentAlert = z.infer<typeof studentAlertSchema>

export const dashboardDataSchema = safeStrictObject({
  pending: safeStrictObject({
    ungradedCount: z.number().int().min(0),
    latestUngraded: z.string(),
    stressAlertCount: z.number().int().min(0),
    stressStudents: z.array(z.string()),
    stagnantCount: z.number().int().min(0),
    stagnantStudents: z.array(z.string()),
    abnormalCount: z.number().int().min(0),
  }),
  todayCourses: z.array(courseBriefSchema),
  weekCourseCount: z.number().int().min(0),
  pendingAssignments: z.array(pendingAssignmentSchema),
  studentAlerts: z.array(studentAlertSchema),
})
export type DashboardData = z.infer<typeof dashboardDataSchema>

// ---------------------------------------------------------------------------
// Courses / Calendar (per api-contract.md §2.2)
// ---------------------------------------------------------------------------

export const calendarCourseSchema = safeStrictObject({
  id: nonEmptyString,
  title: z.string(),
  studentId: z.string().nullable().optional(),
  studentName: z.string().nullable().optional(),
  classId: z.string().nullable().optional(),
  className: z.string().nullable().optional(),
  subject: z.string(),
  chapter: z.string().nullable().optional(),
  startTime: isoDateTimeSchema,
  endTime: isoDateTimeSchema,
  status: courseStatusSchema,
})
export type CalendarCourse = z.infer<typeof calendarCourseSchema>

export const courseListSchema = z.array(calendarCourseSchema)

export const courseListEnvelopeSchema = safeStrictObject({
  weekStart: isoDateTimeSchema.optional(),
  weekEnd: isoDateTimeSchema.optional(),
  courses: courseListSchema,
})
export type CourseListEnvelope = z.infer<typeof courseListEnvelopeSchema>

// ---------------------------------------------------------------------------
// Students (per api-contract.md §2.4)
// ---------------------------------------------------------------------------

/** StudentCard (list item) */
export const studentCardSchema = safeStrictObject({
  id: nonEmptyString,
  name: z.string(),
  avatar: z.string(),
  className: z.string(),
  currentScore: z.number().min(0).max(100),
  targetScore: z.number().min(0).max(100),
  status: riskLevelSchema,
  tags: z.array(z.string()),
  lastActiveAt: isoDateTimeSchema,
})
export type StudentCard = z.infer<typeof studentCardSchema>

// --- Student Detail sub-resources ---

export const knowledgeGraphItemSchema = safeStrictObject({
  id: nonEmptyString,
  code: z.string(),
  name: z.string(),
  mastery: z.number().min(0).max(100),
  level: masteryLevelSchema,
  weight: z.number().min(0).optional(),
  prerequisites: z.array(z.string()).optional(),
  trend: z.enum(['improving', 'stable', 'declining']).optional(),
})
export type KnowledgeGraphItem = z.infer<typeof knowledgeGraphItemSchema>

export const studentTagSchema = safeStrictObject({
  id: nonEmptyString,
  label: z.string(),
  confidence: z.number().min(0).max(100),
  evidence: z.string(),
  category: tagCategorySchema,
  status: z.enum(['pending', 'confirmed', 'rejected', 'modified']).optional(),
  updatedAt: isoDateTimeSchema.optional(),
})
export type StudentTag = z.infer<typeof studentTagSchema>

export const recentWorkItemSchema = safeStrictObject({
  id: nonEmptyString,
  date: isoDateTimeSchema,
  type: workTypeSchema,
  title: z.string(),
  score: z.number().min(0),
  maxScore: z.number().min(0),
})
export type RecentWorkItem = z.infer<typeof recentWorkItemSchema>

export const errorDistributionSchema = z.record(z.string(), z.number().min(0).max(100))

export const feedbackSchema = safeStrictObject({
  accuracy: z.number().min(0).max(100),
  accuracyChange: z.number(),
  avgTimePerQuestion: z.number().min(0),
  timeChange: z.number(),
  hintsPerQuestion: z.number().min(0),
  errorDistribution: errorDistributionSchema,
  accuracyTrend: z.array(z.number()).optional(),
  alertMessage: z.string().nullable().optional(),
  teacherConfirmed: z.boolean().optional(),
})
export type Feedback = z.infer<typeof feedbackSchema>

export const executionSchema = safeStrictObject({
  weeklyCompleted: z.number().int().min(0),
  weeklyTotal: z.number().int().min(0),
  avgDelayDays: z.number().min(0),
  last14Days: z.array(z.number().int().min(0)),
})
export type Execution = z.infer<typeof executionSchema>

export const suggestionSchema = safeStrictObject({
  id: nonEmptyString,
  title: z.string(),
  detail: z.string(),
  type: suggestionTypeSchema,
  status: z.enum(['pending', 'adopted', 'ignored']).optional(),
})
export type Suggestion = z.infer<typeof suggestionSchema>

export const studentDetailSchema = safeStrictObject({
  id: nonEmptyString,
  name: z.string(),
  avatar: z.string(),
  grade: z.string(),
  className: z.string(),
  subjects: z.array(z.string()),
  targetScoreLabel: z.string(),
  currentScore: z.number().min(0).max(100),
  targetScore: z.number().min(0).max(100),
  stressIndex: z.number().min(0).max(100),
  stressLabel: z.string().optional(),
  teachingStyle: z.string(),
})
export type StudentDetail = z.infer<typeof studentDetailSchema>

// ---------------------------------------------------------------------------
// Assignments (per api-contract.md §2.3)
// ---------------------------------------------------------------------------

export const assignmentItemSchema = safeStrictObject({
  id: nonEmptyString,
  title: z.string(),
  className: z.string(),
  subject: z.string(),
  assignedAt: isoDateTimeSchema,
  dueAt: isoDateTimeSchema,
  submitted: z.number().int().min(0),
  total: z.number().int().min(0),
  pendingCount: z.number().int().min(0),
  status: assignmentStatusSchema,
})
export type AssignmentItem = z.infer<typeof assignmentItemSchema>

export const assignmentListSchema = z.array(assignmentItemSchema)

// --- Submission (per contract §2.3 submissions) ---

export const annotationSchema = safeStrictObject({
  type: z.enum(['error', 'correct']),
  location: z.string(),
  message: z.string(),
})

export const studentAnswerSchema = safeStrictObject({
  questionId: nonEmptyString,
  questionContent: z.string(),
  questionScore: z.number().min(0),
  studentAnswer: z.string(),
  aiAnnotations: z.array(annotationSchema).optional(),
})

export const submissionSchema = safeStrictObject({
  id: nonEmptyString,
  studentId: nonEmptyString,
  studentName: z.string(),
  submittedAt: isoDateTimeSchema,
  score: z.number().nullable(),
  aiSuggestedScore: z.number().optional(),
  aiFeedback: z.string().optional(),
  timeSpent: z.number().min(0).optional(),
  hintsUsedPerQuestion: z.number().min(0).optional(),
  status: z.enum(['submitted', 'graded', 'reviewed']),
  answers: z.array(studentAnswerSchema).optional(),
})
export type Submission = z.infer<typeof submissionSchema>

// --- Grade submission ---

export const gradeSubmissionSchema = safeStrictObject({
  studentId: nonEmptyString,
  score: z.number().min(0),
  comment: z.string().optional(),
})
export type GradeSubmission = z.infer<typeof gradeSubmissionSchema>

// --- Create assignment ---

export const createAssignmentSchema = safeStrictObject({
  title: nonEmptyString,
  questionIds: z.array(nonEmptyString),
  targetType: z.enum(['class', 'students']),
  classId: z.string().nullable().optional(),
  studentIds: z.array(nonEmptyString).optional(),
  dueAt: isoDateTimeSchema,
  hintLevel: z.enum(['full', 'limited', 'none']).optional(),
  redoRequired: z.boolean().optional(),
})
export type CreateAssignment = z.infer<typeof createAssignmentSchema>

// ---------------------------------------------------------------------------
// Reports (per api-contract.md §2.5)
// ---------------------------------------------------------------------------

export const reportMetricSchema = safeStrictObject({
  value: z.number(),
  change: z.number(),
  trend: reportTrendSchema.optional(),
})

/** GET /reports/overview */
export const reportOverviewSchema = safeStrictObject({
  classAvg: reportMetricSchema,
  completionRate: reportMetricSchema,
  attentionCount: reportMetricSchema,
  avgStudyHours: reportMetricSchema,
})
export type ReportOverview = z.infer<typeof reportOverviewSchema>

/** GET /reports/score-trend */
export const scoreTrendSchema = safeStrictObject({
  dates: z.array(z.string()),
  classAverage: z.array(z.number()),
  students: z.array(safeStrictObject({
    studentId: nonEmptyString,
    name: z.string(),
    scores: z.array(z.number()),
  })).optional(),
})
export type ScoreTrend = z.infer<typeof scoreTrendSchema>

/** GET /reports/error-distribution */
export const errorDistributionOverTimeSchema = safeStrictObject({
  labels: z.array(z.string()),
  series: z.record(z.string(), z.array(z.number())),
})
export type ErrorDistributionOverTime = z.infer<typeof errorDistributionOverTimeSchema>

/** GET /reports/students */
export const reportStudentSchema = safeStrictObject({
  studentId: nonEmptyString,
  name: z.string(),
  avatar: z.string(),
  riskFactor: z.string().optional(),
  focusLevel: prioritySchema.optional(),
  avgMinutesPerDay: z.number().min(0).optional(),
  scoreChange: z.number().optional(),
  accuracyChange: z.number().optional(),
  breakthrough: z.string().optional(),
})
export type ReportStudent = z.infer<typeof reportStudentSchema>

// ---------------------------------------------------------------------------
// Tag respond
// ---------------------------------------------------------------------------

export const tagRespondSchema = safeStrictObject({
  action: z.enum(['confirm', 'reject', 'modify']),
  modifiedLabel: z.string().optional(),
  note: z.string().optional(),
})
export type TagRespond = z.infer<typeof tagRespondSchema>

export const suggestionRespondSchema = safeStrictObject({
  action: z.enum(['adopt', 'ignore']),
})
export type SuggestionRespond = z.infer<typeof suggestionRespondSchema>
