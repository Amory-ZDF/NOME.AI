import { gradeAnswer, validateAttempt } from './answerRules'

export const createQuestionProgress = (questionId) => ({
  questionId,
  answer: '',
  status: 'unanswered',
  attempts: [],
  hintLevel: 0,
  solvedAtHintLevel: null,
  handwritingUsed: false,
})

export function submitAttempt(progress, question, answer, submittedAt) {
  const validation = validateAttempt(answer)
  if (!validation.valid) return { ...progress, transitionError: validation.code }

  const { isCorrect, normalizedAnswer } = gradeAnswer(question, validation.value)
  const attempts = [...progress.attempts, {
    answer: validation.value,
    normalizedAnswer,
    submittedAt,
    isCorrect,
  }]
  const firstWrongAttempt = !isCorrect && !progress.attempts.some((attempt) => !attempt.isCorrect)

  return {
    ...progress,
    answer: validation.value,
    status: isCorrect ? 'correct' : 'wrong',
    attempts,
    hintLevel: firstWrongAttempt ? Math.max(1, progress.hintLevel) : progress.hintLevel,
    solvedAtHintLevel: isCorrect ? (progress.solvedAtHintLevel ?? progress.hintLevel) : progress.solvedAtHintLevel,
    transitionError: null,
  }
}

export function unlockNextHint(progress) {
  const hasWrongAttempt = progress.status === 'wrong' || progress.attempts.some((attempt) => !attempt.isCorrect)
  if (!hasWrongAttempt) return { ...progress, transitionError: 'ATTEMPT_REQUIRED' }

  return { ...progress, transitionError: null, hintLevel: Math.min(5, progress.hintLevel + 1) }
}

export function canSubmitSession(progressById) {
  const progress = Object.values(progressById)
  return progress.length > 0 && progress.every((item) => item.status !== 'unanswered')
}

export function buildSession({ set, progressById, elapsedSeconds, sessionId, completedAt }) {
  return {
    sessionId,
    taskId: set.taskId,
    taskTitle: set.title,
    subject: set.subject,
    completedAt,
    timeSpentSeconds: elapsedSeconds,
    timeSpent: Math.round(elapsedSeconds / 60),
    questions: set.questions.map((question) => {
      const progress = progressById[question.id] ?? createQuestionProgress(question.id)
      return {
        ...question,
        result: {
          status: progress.status,
          attempts: progress.attempts.map((attempt) => ({ ...attempt })),
          hintsUsed: progress.hintLevel,
          solvedAtHintLevel: progress.solvedAtHintLevel,
          handwritingUsed: progress.handwritingUsed,
        },
      }
    }),
  }
}
