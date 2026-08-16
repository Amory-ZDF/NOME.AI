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

  // Free-response questions have no local verdict — gradeAnswer returns
  // isCorrect: null to signal that the LLM must grade against the mark scheme.
  if (isCorrect === null) {
    return {
      ...progress,
      answer: validation.value,
      status: 'ungraded',
      attempts,
      transitionError: null,
    }
  }

  const firstWrongAttempt = progress.status !== 'correct'
    && !isCorrect
    && !progress.attempts.some((attempt) => !attempt.isCorrect)

  return {
    ...progress,
    answer: validation.value,
    status: progress.status === 'correct' || isCorrect ? 'correct' : 'wrong',
    attempts,
    hintLevel: firstWrongAttempt ? Math.max(1, progress.hintLevel) : progress.hintLevel,
    solvedAtHintLevel: isCorrect ? (progress.solvedAtHintLevel ?? progress.hintLevel) : progress.solvedAtHintLevel,
    transitionError: null,
  }
}

// Resolve a pending free-response grading. `progress` is the result of
// submitAttempt (status 'ungraded', last attempt isCorrect === null). Fills in
// the LLM's verdict and transitions to correct/wrong.
export function resolveGrading(progress, isCorrect) {
  const attempts = progress.attempts.map((attempt, index) => (
    index === progress.attempts.length - 1 ? { ...attempt, isCorrect } : attempt
  ))
  const priorAttempts = progress.attempts.slice(0, -1)
  const firstWrongAttempt = !isCorrect
    && !priorAttempts.some((attempt) => attempt.isCorrect === false)

  return {
    ...progress,
    status: isCorrect ? 'correct' : 'wrong',
    attempts,
    hintLevel: firstWrongAttempt ? Math.max(1, progress.hintLevel) : progress.hintLevel,
    solvedAtHintLevel: isCorrect ? (progress.solvedAtHintLevel ?? progress.hintLevel) : progress.solvedAtHintLevel,
    transitionError: null,
  }
}

export function unlockNextHint(progress) {
  if (progress.status === 'correct') return { ...progress, transitionError: 'ALREADY_SOLVED' }
  const hasWrongAttempt = progress.status === 'wrong' || progress.attempts.some((attempt) => !attempt.isCorrect)
  if (!hasWrongAttempt) return { ...progress, transitionError: 'ATTEMPT_REQUIRED' }

  return { ...progress, transitionError: null, hintLevel: Math.min(5, progress.hintLevel + 1) }
}

export function canSubmitSession(progressById) {
  const progress = Object.values(progressById)
  return progress.length > 0 && progress.every((item) => item.status === 'wrong' || item.status === 'correct')
}

// Flatten the agent's diagnosis into result-level fields the error book reads.
// Only the evidence fields are carried — isCorrect/confidence/counterQuestion/
// linkedKnowledge are agent-internal and are not consumed by the error book.
const DIAGNOSIS_EVIDENCE_FIELDS = [
  'errorType',
  'whereWrong',
  'whyWrong',
  'understandingExplanation',
  'scoringExplanation',
]

const flattenDiagnosis = (diagnosis) => {
  if (diagnosis === null || typeof diagnosis !== 'object') return {}
  return DIAGNOSIS_EVIDENCE_FIELDS.reduce((evidence, field) => {
    const value = diagnosis[field]
    // Empty evidence is no evidence: the Python agent defaults where_wrong/
    // why_wrong to "" when it is uncertain (counter-question path), and an
    // empty string would both fail the backend's nonEmptyString contract and
    // blank the error card (buildErrorCard's `?? fallback` treats "" as present).
    if (value === undefined || value === null) return evidence
    if (typeof value === 'string' && value.trim() === '') return evidence
    return { ...evidence, [field]: value }
  }, {})
}

export function buildSession({ set, progressById, elapsedSeconds, sessionId, completedAt }) {
  return {
    sessionId,
    taskId: set.taskId ?? null,
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
          ...flattenDiagnosis(progress.diagnosis),
        },
      }
    }),
  }
}
