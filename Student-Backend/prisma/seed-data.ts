import {
  errorItemSchema,
  exerciseSetSchema,
  greetingSchema,
  learningSummarySchema,
  materialUploadJobSchema,
  moduleStatsSchema,
  noteFolderSchema,
  noteSchema,
  sessionSchema,
  settingsSchema,
  studentSchema,
  taskAdjustmentSchema,
  taskSchema,
  type ErrorItem,
  type ExerciseSet,
  type Greeting,
  type LearningSummary,
  type MaterialUploadJob,
  type ModuleStats,
  type Note,
  type NoteFolder,
  type Session,
  type Settings,
  type Student,
  type Task,
  type TaskAdjustment,
} from '../src/contracts/student-contracts.js'
import type { StudentPrisma } from '../src/db/client.js'
import { toInputJson } from '../src/db/json.js'

interface SeedExerciseSet {
  kind: 'task' | 'bank'
  value: ExerciseSet
}

export interface StudentSeedData {
  student: Student
  greeting: Greeting
  moduleStats: ModuleStats
  learningSummary: LearningSummary
  tasks: Task[]
  taskAdjustments: TaskAdjustment[]
  exerciseSets: SeedExerciseSet[]
  sessions: Session[]
  errors: ErrorItem[]
  notes: Note[]
  noteFolders: NoteFolder[]
  uploadJobs: MaterialUploadJob[]
  settings: Settings
}

function staticHints() {
  return [
    { level: 1 as const, title: 'Clarify', content: 'Identify what the question asks.' },
    { level: 2 as const, title: 'Knowledge', content: 'Recall the derivative power rule.' },
    { level: 3 as const, title: 'Method', content: 'Differentiate before solving.' },
    { level: 4 as const, title: 'Key step', content: 'Set the first derivative equal to zero.' },
    { level: 5 as const, title: 'Solution', content: 'Solve and check the candidate point.' },
  ]
}

function calculusQuestion(id: string) {
  return {
    id,
    order: 1,
    type: 'calculation' as const,
    topic: 'Calculus - Extrema',
    difficulty: 3,
    content: '<p>Find the stationary point of f(x)=x²-4x+3.</p>',
    acceptKeywords: ['x=2', '2'],
    correctDisplay: 'f\'(x)=2x-4, so x=2.',
    errorType: 'method' as const,
    hints: staticHints(),
    understandingExplanation: 'A stationary point occurs where the first derivative is zero.',
    scoringExplanation: 'Differentiate, set equal to zero, and solve.',
  }
}

function ieltsQuestion(id: string) {
  return {
    id,
    order: 1,
    type: 'reading' as const,
    topic: 'IELTS Reading - Evidence location',
    difficulty: 2,
    content: '<p>Which statement is directly supported by paragraph two?</p>',
    options: ['A. The policy is mandatory.', 'B. The policy uses incentives.'],
    correctIndex: 1,
    acceptKeywords: ['B', 'incentives'],
    correctDisplay: 'B. The policy uses incentives.',
    errorType: 'reading' as const,
    hints: staticHints(),
    passageEvidence: 'Paragraph two states that the city offers incentives.',
    errorPattern: 'Confusing encouragement with a mandate.',
  }
}

export function createStudentSeedData(studentId = 'stu-001'): StudentSeedData {
  const greeting = greetingSchema.parse({
    message: 'Your calculus practice is becoming more consistent.',
    fallback: 'A little progress every day adds up.',
  })
  const moduleStats = moduleStatsSchema.parse({
    notesCount: 1,
    weeklyExercises: 2,
    latestAccuracy: 78,
    pendingErrorReview: 1,
  })
  const learningSummary = learningSummarySchema.parse({
    overallMastery: 62,
    weeklyCompleted: 3,
    weeklyTotal: 5,
    overdueTasks: 0,
    weakTopics: ['Calculus - Extrema'],
    knowledgeHeatmap: [
      { topicId: 'calculus-extrema', topicName: 'Extrema', mastery: 48 },
      { topicId: 'ielts-evidence', topicName: 'Evidence location', mastery: 71 },
    ],
  })
  const student = studentSchema.parse({
    id: studentId,
    name: 'Alex',
    avatar: null,
    joinedDays: 45,
    gradeInfo: 'A-Level · Year 12 Science',
  })

  const pendingTask = taskSchema.parse({
    id: 'task-calculus-pending',
    title: 'Calculus extrema practice',
    type: 'teacher_assigned',
    subject: 'A-Level Math',
    estimatedMinutes: 35,
    dueAt: '2026-08-20T12:00:00.000Z',
    assignedBy: 'Ms. Wang',
    priority: 'P1',
    isOverdue: false,
    status: 'pending',
    exerciseSetId: 'set-alevel-calculus',
    topicIds: ['calculus-extrema'],
  })
  const completedTask = taskSchema.parse({
    id: 'task-calculus-completed',
    title: 'Derivative foundations review',
    type: 'teacher_assigned',
    subject: 'A-Level Math',
    estimatedMinutes: 25,
    dueAt: '2026-08-09T12:00:00.000Z',
    assignedBy: 'Ms. Wang',
    priority: 'P2',
    isOverdue: false,
    status: 'completed',
    lastAccuracy: 80,
    exerciseSetId: 'set-calculus-foundations',
    completedAt: '2026-08-10T11:00:00.000Z',
  })

  const taskAdjustment = taskAdjustmentSchema.parse({
    id: 'adjustment-calculus-time',
    taskId: pendingTask.id,
    reason: 'time_conflict',
    details: 'The IELTS mock overlaps with this deadline.',
    availableMinutes: 35,
    proposedDueAt: '2026-08-21T12:00:00.000Z',
    createdAt: '2026-08-10T09:00:00.000Z',
    status: 'submitted',
  })

  const aLevelSet = exerciseSetSchema.parse({
    id: 'set-alevel-calculus',
    taskId: pendingTask.id,
    title: 'A-Level Calculus · Extrema',
    subject: 'A-Level Math',
    questions: [calculusQuestion('question-calculus-extrema')],
  })
  const ieltsBankSet = exerciseSetSchema.parse({
    id: 'bank-ielts-reading',
    taskId: null,
    title: 'IELTS Reading · Evidence location',
    subject: 'IELTS Reading',
    questions: [ieltsQuestion('question-ielts-evidence')],
  })
  const completedQuestion = calculusQuestion('question-calculus-foundations')
  const completedSet = exerciseSetSchema.parse({
    id: 'set-calculus-foundations',
    taskId: completedTask.id,
    title: completedTask.title,
    subject: completedTask.subject,
    questions: [completedQuestion],
  })

  const session = sessionSchema.parse({
    sessionId: 'session-calculus-foundations',
    taskId: completedTask.id,
    taskTitle: completedTask.title,
    subject: completedTask.subject,
    completedAt: '2026-08-10T11:00:00.000Z',
    timeSpent: 12,
    timeSpentSeconds: 720,
    questions: [
      {
        ...completedQuestion,
        result: {
          status: 'correct',
          attempts: [
            {
              answer: 'x=2',
              submittedAt: '2026-08-10T10:59:00.000Z',
              isCorrect: true,
            },
          ],
          hintsUsed: 1,
          solvedAtHintLevel: 1,
          handwritingUsed: false,
        },
      },
    ],
  })

  const occurredAt = '2026-08-10T11:00:00.000Z'
  const occurrenceKey =
    'session:session-calculus-foundations:question:question-calculus-foundations'
  const error = errorItemSchema.parse({
    id: 'error-calculus-method',
    questionId: 'question-calculus-foundations',
    sessionId: session.sessionId,
    subject: 'A-Level Math',
    errorType: 'method',
    questionSummary: 'Find the stationary point of f(x)=x²-4x+3.',
    questionContent: '<p>Find the stationary point of f(x)=x²-4x+3.</p>',
    type: 'calculation',
    difficulty: 3,
    errorDescription: 'The first response solved the original expression instead of its derivative.',
    relatedTopic: 'Calculus - Extrema',
    topicId: 'calculus-extrema',
    whereWrong: 'The method-selection step before solving.',
    whyWrong: 'The stationary-point condition was not applied.',
    linkedAbility: 'Method selection',
    hintDependency: 1,
    firstOccurredAt: occurredAt,
    lastOccurredAt: occurredAt,
    occurrences: [occurredAt],
    occurrenceKeys: [occurrenceKey],
    occurrenceRecords: [{ key: occurrenceKey, occurredAt }],
    repeatCount: 1,
    status: 'pending_review',
    studentAnswer: 'x=1',
    correctAnswer: 'x=2',
    analysis: 'Differentiate first, then solve f\'(x)=0.',
    acceptKeywords: ['x=2', '2'],
    redoHistory: [],
    verificationVariantId: null,
    variantVerifiedAt: null,
    variantVerification: null,
    understandingExplanation: 'Stationary points are defined through the first derivative.',
    scoringExplanation: 'Award method credit for setting the derivative equal to zero.',
  })

  const note = noteSchema.parse({
    id: 'note-calculus-extrema',
    title: 'Calculus extrema workflow',
    folderId: 'folder-alevel-math',
    folderPath: 'A-Level Math',
    tags: ['calculus', 'extrema'],
    linkedTopics: ['calculus-extrema'],
    linkedErrors: [error.id],
    source: 'typed',
    createdAt: '2026-08-01',
    updatedAt: '2026-08-10T08:00:00.000Z',
    content: [
      { t: 'h', v: 'Extrema workflow' },
      { t: 'p', v: 'Differentiate, solve, evaluate candidates, and compare.' },
    ],
    aiSuggestions: [],
    version: 2,
    versions: [
      {
        version: 1,
        title: 'Calculus extrema notes',
        folderId: 'folder-alevel-math',
        folderPath: 'A-Level Math',
        tags: ['calculus'],
        content: [{ t: 'p', v: 'Differentiate and solve.' }],
        linkedTopics: ['calculus-extrema'],
        linkedErrors: [],
        source: 'typed',
        changedAt: '2026-08-10T08:00:00.000Z',
        reason: 'edit',
      },
    ],
  })

  const noteFolder = noteFolderSchema.parse({
    id: 'folder-alevel-math',
    name: 'A-Level Math',
    noteCount: 1,
    autoCreated: false,
  })

  const uploadJob = materialUploadJobSchema.parse({
    id: 'upload-class-notes',
    fileName: 'calculus-class-notes.pdf',
    mimeType: 'application/pdf',
    size: 12_000,
    materialType: 'class_note',
    examBoard: 'CAIE',
    subject: 'A-Level Math',
    chapter: 'Calculus',
    createdAt: '2026-08-10T07:30:00.000Z',
    updatedAt: '2026-08-10T07:30:00.000Z',
    progress: 0,
    status: 'queued',
  })

  const settings = settingsSchema.parse({
    tone: 35,
    dailyGoalHours: 4,
    reminderTask: true,
    reminderErrorReview: true,
    reminderStudyTime: false,
  })

  return {
    student,
    greeting,
    moduleStats,
    learningSummary,
    tasks: [pendingTask, completedTask],
    taskAdjustments: [taskAdjustment],
    exerciseSets: [
      { kind: 'task', value: aLevelSet },
      { kind: 'task', value: completedSet },
      { kind: 'bank', value: ieltsBankSet },
    ],
    sessions: [session],
    errors: [error],
    notes: [note],
    noteFolders: [noteFolder],
    uploadJobs: [uploadJob],
    settings,
  }
}

function validateSeedData(seed: StudentSeedData): StudentSeedData {
  return {
    student: studentSchema.parse(seed.student),
    greeting: greetingSchema.parse(seed.greeting),
    moduleStats: moduleStatsSchema.parse(seed.moduleStats),
    learningSummary: learningSummarySchema.parse(seed.learningSummary),
    tasks: seed.tasks.map((value) => taskSchema.parse(value)),
    taskAdjustments: seed.taskAdjustments.map((value) => taskAdjustmentSchema.parse(value)),
    exerciseSets: seed.exerciseSets.map(({ kind, value }) => ({
      kind,
      value: exerciseSetSchema.parse(value),
    })),
    sessions: seed.sessions.map((value) => sessionSchema.parse(value)),
    errors: seed.errors.map((value) => errorItemSchema.parse(value)),
    notes: seed.notes.map((value) => noteSchema.parse(value)),
    noteFolders: seed.noteFolders.map((value) => noteFolderSchema.parse(value)),
    uploadJobs: seed.uploadJobs.map((value) => materialUploadJobSchema.parse(value)),
    settings: settingsSchema.parse(seed.settings),
  }
}

export async function seedStudentData(
  prisma: StudentPrisma,
  rawSeed = createStudentSeedData(),
): Promise<void> {
  const seed = validateSeedData(rawSeed)
  const studentId = seed.student.id

  await prisma.$transaction(async (transaction) => {
    await transaction.taskAdjustment.deleteMany({ where: { studentId } })
    await transaction.session.deleteMany({ where: { studentId } })
    await transaction.exerciseSet.deleteMany({ where: { studentId } })
    await transaction.errorItem.deleteMany({ where: { studentId } })
    await transaction.note.deleteMany({ where: { studentId } })
    await transaction.noteFolder.updateMany({ where: { studentId }, data: { parentId: null } })
    await transaction.noteFolder.deleteMany({ where: { studentId } })
    await transaction.materialUploadJob.deleteMany({ where: { studentId } })
    await transaction.studentSettings.deleteMany({ where: { studentId } })
    await transaction.task.deleteMany({ where: { studentId } })

    await transaction.student.upsert({
      where: { id: studentId },
      update: {
        name: seed.student.name,
        avatar: seed.student.avatar,
        joinedDays: seed.student.joinedDays,
        gradeInfo: seed.student.gradeInfo,
        greeting: toInputJson(seed.greeting),
        moduleStats: toInputJson(seed.moduleStats),
        learningSummary: toInputJson(seed.learningSummary),
      },
      create: {
        ...seed.student,
        greeting: toInputJson(seed.greeting),
        moduleStats: toInputJson(seed.moduleStats),
        learningSummary: toInputJson(seed.learningSummary),
      },
    })

    await transaction.task.createMany({
      data: seed.tasks.map((value) => ({
        id: value.id,
        studentId,
        type: value.type,
        status: value.status,
        dueAt: value.dueAt === null ? null : new Date(value.dueAt),
        payload: toInputJson(value),
      })),
    })
    await transaction.taskAdjustment.createMany({
      data: seed.taskAdjustments.map((value) => ({
        id: value.id,
        studentId,
        taskId: value.taskId,
        status: value.status,
        createdAt: new Date(value.createdAt),
        payload: toInputJson(value),
      })),
    })
    await transaction.exerciseSet.createMany({
      data: seed.exerciseSets.map(({ kind, value }) => ({
        id: value.id ?? (() => { throw new TypeError('Seed exercise sets require ids') })(),
        studentId,
        taskId: value.taskId,
        kind,
        payload: toInputJson(value),
      })),
    })
    await transaction.session.createMany({
      data: seed.sessions.map((value) => ({
        id: value.sessionId,
        studentId,
        taskId: value.taskId,
        submittedAt: new Date(value.completedAt),
        payload: toInputJson(value),
      })),
    })
    await transaction.errorItem.createMany({
      data: seed.errors.map((value) => ({
        id: value.id,
        studentId,
        questionId: value.questionId,
        status: value.status,
        lastOccurredAt: new Date(value.lastOccurredAt),
        payload: toInputJson(value),
      })),
    })
    await transaction.note.createMany({
      data: seed.notes.map((value) => ({
        id: value.id,
        studentId,
        version: value.version,
        updatedAtValue: new Date(value.updatedAt),
        payload: toInputJson(value),
      })),
    })
    await transaction.noteFolder.createMany({
      data: seed.noteFolders.map((value) => ({
        id: value.id,
        studentId,
        parentId: value.parentId ?? null,
        payload: toInputJson(value),
      })),
    })
    await transaction.materialUploadJob.createMany({
      data: seed.uploadJobs.map((value) => ({
        id: value.id,
        studentId,
        status: value.status,
        createdAtValue: new Date(value.createdAt),
        payload: toInputJson(value),
      })),
    })
    await transaction.studentSettings.create({
      data: { studentId, payload: toInputJson(seed.settings) },
    })
  })
}
