import { z } from 'zod'

import { AppError } from '../../common/errors/app-error.js'
import {
  exerciseSetSchema,
  learningSummarySchema,
  sessionSchema,
  type ErrorItem,
  type ExerciseSet,
  type LearningSummary,
  type Session,
} from '../../contracts/student-contracts.js'
import type { StudentPrisma } from '../../db/client.js'
import { parseStoredErrorAggregate } from '../errors/error-cards.js'

// ---------------------------------------------------------------------------
// The profile endpoint projects the persisted student aggregate (sessions,
// errors, learning summary, bank sets) into the five shapes the Profile UI
// expects. These replace the hand-authored mock values in mockData.js.
// ---------------------------------------------------------------------------

export const profileOverviewSchema = z.strictObject({
  currentScore: z.number().min(0).max(100),
  targetScore: z.number().min(0).max(100),
  dailyHours: z.number().nonnegative(),
  streak: z.number().int().nonnegative(),
  bestStreak: z.number().int().nonnegative(),
  totalQuestions: z.number().int().nonnegative(),
  overallAccuracy: z.number().min(0).max(100),
})

const graphNodeSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  mastery: z.number().min(0).max(100),
  weight: z.number().nonnegative(),
  x: z.number(),
  y: z.number(),
})

const graphSubjectSchema = z.strictObject({
  nodes: z.array(graphNodeSchema),
  edges: z.array(z.tuple([z.string(), z.string()])),
})

export const knowledgeGraphSchema = z.record(z.string(), graphSubjectSchema)

const progressPointSchema = z.strictObject({
  date: z.string(),
  mastery: z.number().min(0).max(100),
  event: z.string().optional(),
})

export const errorPatternsSchema = z.strictObject({
  distribution: z.record(z.string(), z.number().min(0).max(100)),
  insight: z.string(),
})

export const achievementSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  icon: z.string(),
  earned: z.boolean(),
  earnedAt: z.string().optional(),
  category: z.string().min(1),
  progress: z.strictObject({
    current: z.number().int().nonnegative(),
    target: z.number().int().positive(),
  }).optional(),
})

export const profileSchema = z.strictObject({
  profileOverview: profileOverviewSchema,
  knowledgeGraph: knowledgeGraphSchema,
  progressTimeline: z.array(progressPointSchema),
  errorPatterns: errorPatternsSchema,
  achievements: z.array(achievementSchema),
})

export type Profile = z.infer<typeof profileSchema>

interface StoredExerciseSetRow {
  id: string
  kind: string
  payload: unknown
}

function studentNotFound(): never {
  throw new AppError('Student not found', 404, 'NOT_FOUND')
}

function storedDataInvalid(cause: unknown): never {
  throw new AppError('Internal server error', 500, 'INTERNAL_ERROR', null, { cause })
}

function parseExerciseSet(row: StoredExerciseSetRow): ExerciseSet {
  try {
    const value = exerciseSetSchema.parse(row.payload)
    if ((value.id !== undefined && value.id !== row.id) || row.kind !== 'bank') {
      throw new Error('Stored bank exercise set metadata mismatch')
    }
    return value
  } catch (cause) {
    return storedDataInvalid(cause instanceof Error ? cause : new Error(String(cause)))
  }
}

// ---- Date / streak helpers -------------------------------------------------

function dayKey(value: string): string {
  return value.slice(0, 10)
}

function distinctDays(sessions: Session[]): string[] {
  const days = new Set<string>()
  for (const session of sessions) {
    days.add(dayKey(session.completedAt))
  }
  return [...days].sort()
}

function bestStreak(days: string[]): number {
  let best = 0
  let run = 0
  for (let index = 0; index < days.length; index += 1) {
    const current = Date.parse(`${days[index]}T00:00:00Z`)
    const previous = index === 0 ? undefined : Date.parse(`${days[index - 1]}T00:00:00Z`)
    const isConsecutive = previous !== undefined && current - previous === 86_400_000
    run = isConsecutive ? run + 1 : 1
    best = Math.max(best, run)
  }
  return best
}

function currentStreak(days: string[], todayKey: string): number {
  let streak = 0
  let cursor = todayKey
  const set = new Set(days)
  // If there is no activity today, the streak is still alive through yesterday.
  if (!set.has(todayKey)) {
    cursor = new Date(Date.parse(`${todayKey}T00:00:00Z`) - 86_400_000)
      .toISOString()
      .slice(0, 10)
  }
  while (set.has(cursor)) {
    streak += 1
    cursor = new Date(Date.parse(`${cursor}T00:00:00Z`) - 86_400_000)
      .toISOString()
      .slice(0, 10)
  }
  return streak
}

function formatMonthDay(value: string): string {
  const date = value.slice(5, 10)
  return date
}

// ---- Graph layout ----------------------------------------------------------

function layoutNodes(
  topics: LearningSummary['knowledgeHeatmap'],
): z.infer<typeof graphSubjectSchema> {
  const count = topics.length
  const centerX = 270
  const centerY = 160
  const radius = 125
  const nodes = topics.map((topic, index) => {
    const angle = (2 * Math.PI * index) / Math.max(count, 1) - Math.PI / 2
    return {
      id: topic.topicId,
      name: topic.topicName,
      mastery: topic.mastery,
      // The heatmap carries mastery only; exam weight is not stored, so use a
      // uniform placeholder weight to keep the SVG radius deterministic.
      weight: 10,
      x: Math.round(centerX + radius * Math.cos(angle)),
      y: Math.round(centerY + radius * Math.sin(angle)),
    }
  })
  const edges: Array<[string, string]> = []
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count
    if (index !== next) {
      edges.push([topics[index]!.topicId, topics[next]!.topicId])
    }
  }
  return { nodes, edges }
}

export class ProfileService {
  constructor(
    private readonly prisma: StudentPrisma,
    private readonly studentId: string,
  ) {}

  async getProfile(now = new Date()): Promise<Profile> {
    const student = await this.prisma.student.findUnique({
      where: { id: this.studentId },
      select: { learningSummary: true },
    })
    if (student === null) studentNotFound()

    let summary: LearningSummary
    try {
      summary = learningSummarySchema.parse(student.learningSummary)
    } catch (cause) {
      return storedDataInvalid(new Error('Invalid stored learning summary', { cause }))
    }

    const sessionRows = await this.prisma.session.findMany({
      where: { studentId: this.studentId },
      orderBy: { submittedAt: 'asc' },
    })
    const sessions = sessionRows.map((row) => {
      try {
        return sessionSchema.parse(row.payload)
      } catch (cause) {
        return storedDataInvalid(new Error(`Invalid stored session ${row.id}`, { cause }))
      }
    })

    const errorRows = await this.prisma.errorItem.findMany({
      where: { studentId: this.studentId },
      orderBy: { id: 'asc' },
    })
    const errors = errorRows.map((row) => {
      try {
        return parseStoredErrorAggregate(row.payload).error
      } catch (cause) {
        return storedDataInvalid(new Error(`Invalid stored error item ${row.id}`, { cause }))
      }
    })

    const setRows = await this.prisma.exerciseSet.findMany({
      where: { studentId: this.studentId, kind: 'bank' },
      orderBy: { id: 'asc' },
    })
    const bankSets = setRows.map((row) => parseExerciseSet(row))

    return {
      profileOverview: this.buildOverview(sessions, summary),
      knowledgeGraph: this.buildGraph(bankSets, summary),
      progressTimeline: this.buildTimeline(sessions),
      errorPatterns: this.buildErrorPatterns(errors),
      achievements: this.buildAchievements(sessions, errors, now),
    }
  }

  private buildOverview(
    sessions: Session[],
    summary: LearningSummary,
  ): z.infer<typeof profileOverviewSchema> {
    const totalQuestions = sessions.reduce((total, session) => total + session.questions.length, 0)
    const correctCount = sessions.reduce(
      (total, session) =>
        total + session.questions.filter(({ result }) => result.status === 'correct').length,
      0,
    )
    const totalMinutes = sessions.reduce((total, session) => total + session.timeSpent, 0)
    const days = distinctDays(sessions)
    const todayKey = new Date().toISOString().slice(0, 10)

    return {
      currentScore: summary.overallMastery,
      targetScore: 85,
      dailyHours:
        days.length === 0
          ? 0
          : Math.round((totalMinutes / 60 / days.length) * 10) / 10,
      streak: currentStreak(days, todayKey),
      bestStreak: bestStreak(days),
      totalQuestions,
      overallAccuracy:
        totalQuestions === 0 ? 0 : Math.round((correctCount / totalQuestions) * 100),
    }
  }

  private buildGraph(
    bankSets: ExerciseSet[],
    summary: LearningSummary,
  ): z.infer<typeof knowledgeGraphSchema> {
    const subject = bankSets.find((set) => set.subject.trim().length > 0)?.subject ?? 'AS Physics'
    return { [subject]: layoutNodes(summary.knowledgeHeatmap) }
  }

  private buildTimeline(sessions: Session[]): z.infer<typeof profileSchema>['progressTimeline'] {
    const ordered = [...sessions].sort(
      (a, b) => Date.parse(a.completedAt) - Date.parse(b.completedAt),
    )
    let runningCorrect = 0
    let runningTotal = 0
    return ordered.map((session) => {
      const correct = session.questions.filter(({ result }) => result.status === 'correct').length
      runningCorrect += correct
      runningTotal += session.questions.length
      return {
        date: formatMonthDay(session.completedAt),
        mastery: Math.round((runningCorrect / runningTotal) * 100),
      }
    })
  }

  private buildErrorPatterns(errors: ErrorItem[]): z.infer<typeof errorPatternsSchema> {
    const counts = new Map<string, number>()
    for (const error of errors) {
      counts.set(error.errorType, (counts.get(error.errorType) ?? 0) + 1)
    }
    const total = errors.length
    const distribution: Record<string, number> = {}
    for (const [type, count] of counts) {
      distribution[type] = total === 0 ? 0 : Math.round((count / total) * 100)
    }

    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1])
    const top = ranked[0]
    const insight =
      top === undefined
        ? 'No errors recorded yet — keep practising to build your error profile.'
        : `"${top[0]}" is your most frequent error type. Reviewing these questions before re-attempting will lift your accuracy fastest.`

    return { distribution, insight }
  }

  private buildAchievements(
    sessions: Session[],
    errors: ErrorItem[],
    now: Date,
  ): z.infer<typeof profileSchema>['achievements'] {
    const totalQuestions = sessions.reduce((total, session) => total + session.questions.length, 0)
    const days = distinctDays(sessions)
    const streak = currentStreak(days, now.toISOString().slice(0, 10))
    const masteredErrors = errors.filter((error) => error.status === 'mastered').length
    const latestDay = days.at(-1)

    const earnedAt = latestDay ?? now.toISOString().slice(0, 10)

    return [
      {
        id: 'a-first-session',
        name: 'First Session',
        description: 'Complete your first practice session',
        icon: '⭐',
        earned: totalQuestions > 0,
        earnedAt: totalQuestions > 0 ? earnedAt : undefined,
        category: 'breakthrough',
      },
      {
        id: 'a-streak-7',
        name: '7-Day Streak',
        description: 'Studied 7 days in a row',
        icon: '🔥',
        earned: streak >= 7,
        earnedAt: streak >= 7 ? earnedAt : undefined,
        category: 'persistence',
        ...(streak >= 7 ? {} : { progress: { current: streak, target: 7 } }),
      },
      {
        id: 'a-questions-100',
        name: '100 Questions',
        description: '100 total questions practiced',
        icon: '⚔️',
        earned: totalQuestions >= 100,
        earnedAt: totalQuestions >= 100 ? earnedAt : undefined,
        category: 'milestone',
        ...(totalQuestions >= 100 ? {} : { progress: { current: totalQuestions, target: 100 } }),
      },
      {
        id: 'a-mastered-1',
        name: 'Error Tamer',
        description: 'Master your first error item',
        icon: '📌',
        earned: masteredErrors >= 1,
        earnedAt: masteredErrors >= 1 ? earnedAt : undefined,
        category: 'habit',
        ...(masteredErrors >= 1 ? {} : { progress: { current: masteredErrors, target: 1 } }),
      },
    ]
  }
}
