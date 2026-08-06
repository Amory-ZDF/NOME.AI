import { normalizeErrorType } from './errorTypes'

const LINKED_ABILITY_BY_ERROR_TYPE = Object.freeze({
  knowledge: 'knowledge recall',
  method: 'method selection',
  calculation: 'calculation accuracy',
  reading: 'reading comprehension',
  execution: 'task execution',
  expression: 'answer expression',
  habit: 'error prevention habits',
})

const WHY_WRONG_BY_ERROR_TYPE = Object.freeze({
  knowledge: 'The response indicates a gap in recalling or applying the required knowledge.',
  method: 'The selected method did not match the method required by the question.',
  calculation: 'The working contains a calculation or transcription error.',
  reading: 'The response did not preserve the meaning or evidence stated in the question.',
  execution: 'The question was not completed with a valid submitted response.',
  expression: 'The response did not express the required reasoning or scoring points clearly enough.',
  habit: 'The same avoidable error pattern has recurred across recent attempts.',
})

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const nonemptyString = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null)
const firstPresent = (...values) => values.find((value) => value !== undefined && value !== null)

const cloneData = (value) => {
  if (Array.isArray(value)) return value.map(cloneData)
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneData(entry)]))
  }
  return value
}

const stripMarkup = (value) => (
  nonemptyString(value)?.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() ?? null
)

const latestWrongAttempt = (result) => {
  if (!Array.isArray(result.attempts)) return {}
  const attempts = result.attempts.filter(isRecord)
  return attempts.findLast((attempt) => attempt.isCorrect === false)
    ?? (result.status === 'wrong' ? attempts.at(-1) : undefined)
    ?? {}
}

const normalizeHintsUsed = (value) => (
  Number.isFinite(value) && value > 0 ? value : 0
)

const occurrenceFrom = (occurredAt, session) => {
  const explicit = nonemptyString(occurredAt)
  if (explicit) return explicit
  const completedAt = nonemptyString(session.completedAt)
  return completedAt ? completedAt.slice(0, 10) : null
}

const optionalEvidence = (name, question, result, attempt) => {
  const value = firstPresent(question[name], result[name], attempt[name])
  return value === undefined || value === null ? {} : { [name]: cloneData(value) }
}

export function buildErrorCard({ question, session, id, occurredAt } = {}) {
  const safeQuestion = isRecord(question) ? question : {}
  const safeSession = isRecord(session) ? session : {}
  const result = isRecord(safeQuestion.result) ? safeQuestion.result : {}
  const wrongAttempt = latestWrongAttempt(result)
  const questionId = nonemptyString(safeQuestion.id) ?? 'unknown-question'
  const errorType = normalizeErrorType(safeQuestion, result)
  const topic = nonemptyString(safeQuestion.relatedTopic)
    ?? nonemptyString(safeQuestion.topic)
    ?? 'Unspecified'
  const correctAnswer = nonemptyString(safeQuestion.correctAnswer)
    ?? nonemptyString(safeQuestion.correctDisplay)
    ?? ''
  const studentAnswer = nonemptyString(wrongAttempt.answer)
    ?? nonemptyString(safeQuestion.studentAnswer)
    ?? nonemptyString(result.answer)
    ?? ''
  const whereWrong = nonemptyString(safeQuestion.whereWrong)
    ?? nonemptyString(result.whereWrong)
    ?? nonemptyString(wrongAttempt.whereWrong)
    ?? nonemptyString(safeQuestion.errorDescription)
    ?? `${topic}: the submitted response did not match the expected result.`
  const whyWrong = nonemptyString(safeQuestion.whyWrong)
    ?? nonemptyString(result.whyWrong)
    ?? nonemptyString(wrongAttempt.whyWrong)
    ?? nonemptyString(safeQuestion.analysis)
    ?? nonemptyString(wrongAttempt.errorPattern)
    ?? nonemptyString(wrongAttempt.mistakePattern)
    ?? nonemptyString(wrongAttempt.avoidablePattern)
    ?? WHY_WRONG_BY_ERROR_TYPE[errorType]
  const occurrence = occurrenceFrom(occurredAt, safeSession)
  const questionContent = nonemptyString(safeQuestion.questionContent)
    ?? nonemptyString(safeQuestion.content)
    ?? `Question ${questionId}`
  const questionSummary = nonemptyString(safeQuestion.questionSummary)
    ?? stripMarkup(questionContent)
    ?? `Question ${questionId}`
  const errorPattern = firstPresent(
    safeQuestion.errorPattern,
    result.errorPattern,
    wrongAttempt.errorPattern,
    wrongAttempt.mistakePattern,
    wrongAttempt.avoidablePattern,
  )

  return {
    id: nonemptyString(id) ?? `error-${questionId}`,
    questionId,
    sessionId: nonemptyString(safeSession.sessionId),
    subject: nonemptyString(safeSession.subject)
      ?? nonemptyString(safeQuestion.subject)
      ?? 'Unspecified',
    errorType,
    questionSummary,
    questionContent,
    type: nonemptyString(safeQuestion.type),
    difficulty: Number.isFinite(safeQuestion.difficulty) ? safeQuestion.difficulty : null,
    relatedTopic: topic,
    topicId: nonemptyString(safeQuestion.topicId),
    studentAnswer,
    correctAnswer,
    acceptKeywords: Array.isArray(safeQuestion.acceptKeywords)
      ? safeQuestion.acceptKeywords.filter((value) => nonemptyString(value)).map((value) => value.trim())
      : [],
    ...(Array.isArray(safeQuestion.options) ? { options: cloneData(safeQuestion.options) } : {}),
    ...(Number.isInteger(safeQuestion.correctIndex) ? { correctIndex: safeQuestion.correctIndex } : {}),
    whereWrong,
    whyWrong,
    errorDescription: nonemptyString(safeQuestion.errorDescription) ?? whereWrong,
    analysis: nonemptyString(safeQuestion.analysis) ?? whyWrong,
    linkedAbility: LINKED_ABILITY_BY_ERROR_TYPE[errorType],
    hintDependency: normalizeHintsUsed(result.hintsUsed),
    occurrences: occurrence ? [occurrence] : [],
    firstOccurredAt: occurrence,
    lastOccurredAt: occurrence,
    repeatCount: 1,
    status: 'pending_review',
    redoHistory: [],
    verificationVariantId: null,
    variantVerifiedAt: null,
    ...optionalEvidence('understandingExplanation', safeQuestion, result, wrongAttempt),
    ...optionalEvidence('scoringExplanation', safeQuestion, result, wrongAttempt),
    ...optionalEvidence('markSchemePoints', safeQuestion, result, wrongAttempt),
    ...optionalEvidence('passageEvidence', safeQuestion, result, wrongAttempt),
    ...(errorPattern === undefined || errorPattern === null ? {} : { errorPattern: cloneData(errorPattern) }),
  }
}

const normalizeOccurrences = (card) => {
  const occurrences = Array.isArray(card.occurrences)
    ? card.occurrences.map(nonemptyString).filter(Boolean)
    : []
  if (occurrences.length === 0) {
    const first = nonemptyString(card.firstOccurredAt)
    const last = nonemptyString(card.lastOccurredAt)
    if (first) occurrences.push(first)
    if (last) occurrences.push(last)
  }
  return [...new Set(occurrences)].sort((left, right) => left.localeCompare(right))
}

const normalizeRepeatCount = (value, occurrences) => (
  Number.isInteger(value) && value > 0 ? Math.max(value, occurrences.length) : Math.max(1, occurrences.length)
)

const normalizeRedoHistory = (value) => (
  Array.isArray(value) ? value.filter(isRecord).map(cloneData) : []
)

const redoKey = (attempt) => JSON.stringify([
  attempt.attemptedAt ?? null,
  attempt.submittedAt ?? null,
  attempt.answer ?? null,
  attempt.isCorrect ?? null,
  attempt.timeSpent ?? null,
])

const mergeRedoHistory = (current, incoming) => {
  const seen = new Set()
  return [...current, ...incoming].filter((attempt) => {
    const key = redoKey(attempt)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).map(cloneData)
}

const normalizeCard = (card) => {
  if (!isRecord(card)) return null
  const questionId = nonemptyString(card.questionId)
  if (!questionId) return null
  const occurrences = normalizeOccurrences(card)
  const firstOccurredAt = occurrences.at(0) ?? nonemptyString(card.firstOccurredAt)
  const lastOccurredAt = occurrences.at(-1) ?? nonemptyString(card.lastOccurredAt)

  return {
    ...cloneData(card),
    id: nonemptyString(card.id) ?? `error-${questionId}`,
    questionId,
    occurrences,
    firstOccurredAt,
    lastOccurredAt,
    repeatCount: normalizeRepeatCount(card.repeatCount, occurrences),
    status: nonemptyString(card.status) ?? 'pending_review',
    redoHistory: normalizeRedoHistory(card.redoHistory),
    verificationVariantId: nonemptyString(card.verificationVariantId),
    variantVerifiedAt: nonemptyString(card.variantVerifiedAt),
  }
}

const mergeRepeatedCard = (current, incoming) => {
  const knownOccurrences = new Set(current.occurrences)
  const newOccurrences = incoming.occurrences.filter((occurredAt) => !knownOccurrences.has(occurredAt))
  const occurrences = [...knownOccurrences, ...newOccurrences]
    .sort((left, right) => left.localeCompare(right))
  const recurrenceIncrement = incoming.occurrences.length > 0
    ? newOccurrences.length
    : incoming.repeatCount
  const hasNewRecurrence = recurrenceIncrement > 0
  const reopenedFromMastery = hasNewRecurrence && current.status === 'mastered'

  return {
    ...current,
    ...incoming,
    id: current.id,
    questionId: current.questionId,
    occurrences,
    firstOccurredAt: occurrences.at(0)
      ?? current.firstOccurredAt
      ?? incoming.firstOccurredAt,
    lastOccurredAt: occurrences.at(-1)
      ?? incoming.lastOccurredAt
      ?? current.lastOccurredAt,
    repeatCount: current.repeatCount + recurrenceIncrement,
    status: hasNewRecurrence
      ? (reopenedFromMastery ? 'pending_review' : incoming.status)
      : current.status,
    redoHistory: mergeRedoHistory(current.redoHistory, incoming.redoHistory),
    verificationVariantId: reopenedFromMastery ? null : incoming.verificationVariantId,
    variantVerifiedAt: reopenedFromMastery ? null : incoming.variantVerifiedAt,
  }
}

export function mergeErrorCards(existing, incoming) {
  const merged = []
  const indexByQuestionId = new Map()
  const candidates = [
    ...(Array.isArray(existing) ? existing : []),
    ...(Array.isArray(incoming) ? incoming : []),
  ]

  candidates.forEach((candidate) => {
    const card = normalizeCard(candidate)
    if (!card) return
    const existingIndex = indexByQuestionId.get(card.questionId)
    if (existingIndex === undefined) {
      indexByQuestionId.set(card.questionId, merged.length)
      merged.push(card)
      return
    }
    merged[existingIndex] = mergeRepeatedCard(merged[existingIndex], card)
  })

  return merged
}
