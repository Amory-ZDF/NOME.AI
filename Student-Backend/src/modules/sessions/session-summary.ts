import { z } from 'zod'

import {
  sessionQuestionSchema,
  type Session,
  type SessionQuestion,
} from '../../contracts/student-contracts.js'

const countSchema = z.number().int().nonnegative()

export const sessionSummarySchema = z.strictObject({
  accuracy: z.number().int().min(0).max(100),
  correctCount: countSchema,
  wrongCount: countSchema,
  unansweredCount: countSchema,
  hintDependency: z.strictObject({
    totalHints: countSchema,
    averageHints: z.number().nonnegative(),
    independentlySolved: countSchema,
  }),
  errorDistribution: z.strictObject({
    knowledge: countSchema.optional(),
    method: countSchema.optional(),
    calculation: countSchema.optional(),
    reading: countSchema.optional(),
    execution: countSchema.optional(),
    expression: countSchema.optional(),
    habit: countSchema.optional(),
  }),
  topicOutcomes: z.array(z.strictObject({
    topic: z.string().min(1),
    correct: countSchema,
    wrong: countSchema,
  })),
  wrongQuestions: z.array(sessionQuestionSchema),
})

export type SessionSummary = z.infer<typeof sessionSummarySchema>

type SummaryInput = Pick<Session, 'questions'>
type ErrorType = SessionQuestion['errorType']

function summaryErrorType(question: SessionQuestion): ErrorType {
  // The backend aggregates already-submitted evidence. It does not grade an
  // answer or infer a diagnosis. An unanswered question follows the frontend's
  // deterministic execution bucket; every other value is the submitted type.
  return question.result.status === 'unanswered' ? 'execution' : question.errorType
}

export function summarizeSession(session: SummaryInput): SessionSummary {
  const questions = session.questions
  const correctQuestions = questions.filter(({ result }) => result.status === 'correct')
  const wrongQuestions = questions.filter(({ result }) => result.status !== 'correct')
  const totalHints = questions.reduce(
    (total, { result }) => total + result.hintsUsed,
    0,
  )

  const errorDistribution: Partial<Record<ErrorType, number>> = {}
  for (const question of wrongQuestions) {
    const errorType = summaryErrorType(question)
    errorDistribution[errorType] = (errorDistribution[errorType] ?? 0) + 1
  }

  const outcomes = new Map<string, { topic: string; correct: number; wrong: number }>()
  for (const question of questions) {
    const topic = question.topic.trim() || 'Unspecified'
    const current = outcomes.get(topic) ?? { topic, correct: 0, wrong: 0 }
    if (question.result.status === 'correct') {
      current.correct += 1
    } else {
      current.wrong += 1
    }
    outcomes.set(topic, current)
  }

  const total = questions.length
  return {
    accuracy: total === 0 ? 0 : Math.round((correctQuestions.length / total) * 100),
    correctCount: correctQuestions.length,
    wrongCount: wrongQuestions.filter(({ result }) => result.status === 'wrong').length,
    unansweredCount: wrongQuestions.filter(({ result }) => result.status === 'unanswered').length,
    hintDependency: {
      totalHints,
      averageHints: total === 0 ? 0 : totalHints / total,
      independentlySolved: correctQuestions.filter(
        ({ result }) => result.solvedAtHintLevel === 0,
      ).length,
    },
    errorDistribution,
    topicOutcomes: [...outcomes.values()],
    wrongQuestions,
  }
}
