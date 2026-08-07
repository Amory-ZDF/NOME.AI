import { normalizeErrorType } from './errorTypes'
import { compareEvidenceTimes, isValidEvidenceTime } from './masteryRules'

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

const ERROR_CARD_STATUSES = new Set([
  'pending_review',
  'reviewing',
  'verification_due',
  'mastered',
])

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
  return attempts.findLast((attempt) => attempt.isCorrect === false) ?? {}
}

const normalizeHintsUsed = (value) => (
  Number.isFinite(value) && value > 0 ? value : 0
)

const occurrenceFrom = (occurredAt, session) => {
  const completedAt = nonemptyString(session.completedAt)
  return completedAt ?? nonemptyString(occurredAt)
}

const sessionOccurrenceKey = (sessionId, questionId) => (
  sessionId ? `session:${sessionId}:question:${questionId}` : null
)

const legacyOccurrenceKey = (questionId, occurredAt) => (
  occurredAt ? `legacy:${questionId}:${occurredAt}` : null
)

const cardOccurrenceKey = (id, questionId) => (
  id ? `card:${id}:question:${questionId}` : null
)

const optionalEvidence = (name, question, result, attempt) => {
  const value = firstPresent(question[name], result[name], attempt[name])
  return value === undefined || value === null ? {} : { [name]: cloneData(value) }
}

export function buildErrorCard({ question, session, id, occurredAt } = {}) {
  const safeQuestion = isRecord(question) ? question : {}
  const safeSession = isRecord(session) ? session : {}
  const result = isRecord(safeQuestion.result) ? safeQuestion.result : {}
  const wrongAttempt = latestWrongAttempt(result)
  const sourceQuestionId = nonemptyString(safeQuestion.id)
  const requestedCardId = nonemptyString(id)
  const questionId = sourceQuestionId
    ?? (requestedCardId ? `missing-question:${requestedCardId}` : 'unknown-question')
  const cardId = requestedCardId ?? `error-${questionId}`
  const sessionId = nonemptyString(safeSession.sessionId)
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
  const occurrenceKey = sessionOccurrenceKey(sessionId, questionId)
    ?? legacyOccurrenceKey(questionId, occurrence)
    ?? cardOccurrenceKey(cardId, questionId)
  const occurrenceRecord = occurrenceKey
    ? { key: occurrenceKey, occurredAt: occurrence }
    : null
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
    id: cardId,
    questionId,
    sessionId,
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
    occurrenceKeys: occurrenceKey ? [occurrenceKey] : [],
    occurrenceRecords: occurrenceRecord ? [occurrenceRecord] : [],
    hasIncompleteOccurrenceHistory: false,
    firstOccurredAt: occurrence,
    lastOccurredAt: occurrence,
    repeatCount: 1,
    status: 'pending_review',
    redoHistory: [],
    verificationVariantId: null,
    variantVerifiedAt: null,
    variantVerification: null,
    ...optionalEvidence('understandingExplanation', safeQuestion, result, wrongAttempt),
    ...optionalEvidence('scoringExplanation', safeQuestion, result, wrongAttempt),
    ...optionalEvidence('markSchemePoints', safeQuestion, result, wrongAttempt),
    ...optionalEvidence('passageEvidence', safeQuestion, result, wrongAttempt),
    ...(errorPattern === undefined || errorPattern === null ? {} : { errorPattern: cloneData(errorPattern) }),
  }
}

const deduplicateOccurrenceRecords = (records) => {
  const byKey = new Map()
  records.forEach((record) => {
    if (!record?.key) return
    const current = byKey.get(record.key)
    if (!current || (!current.occurredAt && record.occurredAt)) byKey.set(record.key, record)
  })
  return [...byKey.values()]
}

const occurrenceTimeBounds = (records) => records.reduce((bounds, record) => {
  if (!isValidEvidenceTime(record.occurredAt)) return bounds
  return {
    first: !bounds.first || compareEvidenceTimes(record.occurredAt, bounds.first) < 0
      ? record.occurredAt
      : bounds.first,
    last: !bounds.last || compareEvidenceTimes(record.occurredAt, bounds.last) > 0
      ? record.occurredAt
      : bounds.last,
  }
}, { first: null, last: null })

const legacyOccurrenceSlots = (card) => {
  const occurrences = Array.isArray(card.occurrences)
    ? card.occurrences.map((value) => {
      const occurredAt = nonemptyString(value)
      return isValidEvidenceTime(occurredAt) ? occurredAt : null
    })
    : []
  if (occurrences.length === 0) {
    const firstCandidate = nonemptyString(card.firstOccurredAt)
    const lastCandidate = nonemptyString(card.lastOccurredAt)
    const first = isValidEvidenceTime(firstCandidate) ? firstCandidate : null
    const last = isValidEvidenceTime(lastCandidate) ? lastCandidate : null
    if (first) occurrences.push(first)
    if (last && last !== first) occurrences.push(last)
  }
  return occurrences
}

const normalizeOccurrenceRecords = (card, questionId, id) => {
  if (Array.isArray(card.occurrenceRecords)) {
    const persisted = card.occurrenceRecords.filter(isRecord).map((record) => ({
      key: nonemptyString(record.key),
      occurredAt: nonemptyString(record.occurredAt),
    })).filter((record) => record.key)
    if (persisted.length > 0) return deduplicateOccurrenceRecords(persisted)
  }

  const occurrenceSlots = legacyOccurrenceSlots(card)
  const providedKeys = Array.isArray(card.occurrenceKeys)
    ? card.occurrenceKeys.map(nonemptyString)
    : []
  const sessionId = nonemptyString(card.sessionId)
  const recordCount = Math.max(occurrenceSlots.length, providedKeys.length)
  const records = []

  for (let index = 0; index < recordCount; index += 1) {
    const occurredAt = occurrenceSlots[index] ?? null
    if (index < occurrenceSlots.length && !occurredAt) continue
    const key = providedKeys[index]
      ?? (index === 0 ? sessionOccurrenceKey(sessionId, questionId) : null)
      ?? legacyOccurrenceKey(questionId, occurredAt)
      ?? cardOccurrenceKey(`${id}:${index}`, questionId)
    if (key) records.push({ key, occurredAt })
  }

  if (records.length === 0) {
    const key = sessionOccurrenceKey(sessionId, questionId)
      ?? cardOccurrenceKey(id, questionId)
    if (key) records.push({ key, occurredAt: null })
  }

  return deduplicateOccurrenceRecords(records)
}

const hasExplicitOccurrenceIdentities = (card) => (
  (Array.isArray(card.occurrenceRecords)
    && card.occurrenceRecords.some((record) => (
      isRecord(record) && nonemptyString(record.key)
    )))
  || (Array.isArray(card.occurrenceKeys)
    && card.occurrenceKeys.some((key) => nonemptyString(key)))
)

const normalizeRepeatCount = (
  value,
  occurrenceRecords,
  source,
  hasIncompleteOccurrenceHistory,
) => {
  const identityCount = Math.max(1, occurrenceRecords.length)
  const canPreserveLegacyAggregate = source === 'existing'
    && hasIncompleteOccurrenceHistory
    && Number.isInteger(value)
    && value > 0

  return canPreserveLegacyAggregate
    ? Math.max(value, identityCount)
    : identityCount
}

const normalizeRedoHistory = (value) => (
  Array.isArray(value) ? value.filter(isRecord).map(cloneData) : []
)

const normalizeVariantVerification = (value, allowed) => {
  if (!allowed || !isRecord(value)) return null
  const variantId = nonemptyString(value.variantId)
  const verifiedAt = nonemptyString(value.verifiedAt)
  if (!variantId || typeof value.isCorrect !== 'boolean' || !verifiedAt) return null
  return {
    ...cloneData(value),
    variantId,
    isCorrect: value.isCorrect,
    verifiedAt,
  }
}

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

const normalizeQuestionId = (card, id) => {
  const questionId = nonemptyString(card.questionId)
  if (questionId && questionId !== 'unknown-question') return questionId
  if (!id || id === 'error-unknown-question') return null
  return `missing-question:${id}`
}

const normalizeStatus = (status, source) => {
  if (source === 'incoming') return 'pending_review'
  const candidate = nonemptyString(status)
  if (!ERROR_CARD_STATUSES.has(candidate)) return 'pending_review'
  return candidate
}

const normalizeCard = (card, source) => {
  if (!isRecord(card)) return null
  const sourceId = nonemptyString(card.id)
  const questionId = normalizeQuestionId(card, sourceId)
  if (!questionId) return null
  const id = sourceId ?? `error-${questionId}`
  const occurrenceRecords = normalizeOccurrenceRecords(card, questionId, id)
  const occurrences = occurrenceRecords.map((record) => record.occurredAt).filter(Boolean)
  const occurrenceKeys = occurrenceRecords.map((record) => record.key)
  const occurrenceBounds = occurrenceTimeBounds(occurrenceRecords)
  const firstOccurredAt = occurrenceBounds.first ?? nonemptyString(card.firstOccurredAt)
  const lastOccurredAt = occurrenceBounds.last ?? nonemptyString(card.lastOccurredAt)
  const rawStatus = nonemptyString(card.status)
  const status = normalizeStatus(rawStatus, source)
  const lifecycleEvidenceAllowed = source === 'existing'
    && ERROR_CARD_STATUSES.has(rawStatus)
  const hasExplicitOccurrenceIdentity = hasExplicitOccurrenceIdentities(card)
  const hasExplicitCompletenessMarker = typeof card.hasIncompleteOccurrenceHistory === 'boolean'
  const hasUnmarkedAggregateGap = !hasExplicitCompletenessMarker
    && Number.isInteger(card.repeatCount)
    && card.repeatCount > Math.max(1, occurrenceRecords.length)
  const hasIncompleteOccurrenceHistory = source === 'existing'
    ? card.hasIncompleteOccurrenceHistory === true
      || !hasExplicitOccurrenceIdentity
      || hasUnmarkedAggregateGap
    : !hasExplicitOccurrenceIdentity

  return {
    ...cloneData(card),
    id,
    questionId,
    occurrences,
    occurrenceKeys,
    occurrenceRecords: occurrenceRecords.map(cloneData),
    firstOccurredAt,
    lastOccurredAt,
    repeatCount: normalizeRepeatCount(
      card.repeatCount,
      occurrenceRecords,
      source,
      hasIncompleteOccurrenceHistory,
    ),
    hasIncompleteOccurrenceHistory,
    status,
    redoHistory: normalizeRedoHistory(card.redoHistory),
    verificationVariantId: lifecycleEvidenceAllowed
      ? nonemptyString(card.verificationVariantId)
      : null,
    variantVerifiedAt: lifecycleEvidenceAllowed
      ? nonemptyString(card.variantVerifiedAt)
      : null,
    variantVerification: normalizeVariantVerification(
      card.variantVerification,
      lifecycleEvidenceAllowed,
    ),
  }
}

const mergeRepeatedCard = (current, incoming) => {
  const knownKeys = new Set(current.occurrenceRecords.map((record) => record.key))
  const newOccurrenceRecords = incoming.occurrenceRecords
    .filter((record) => !knownKeys.has(record.key))
  const occurrenceRecords = deduplicateOccurrenceRecords([
    ...current.occurrenceRecords,
    ...newOccurrenceRecords,
  ])
  const occurrences = occurrenceRecords.map((record) => record.occurredAt).filter(Boolean)
  const occurrenceKeys = occurrenceRecords.map((record) => record.key)
  const occurrenceBounds = occurrenceTimeBounds(occurrenceRecords)
  const repeatCount = Math.max(
    current.repeatCount + newOccurrenceRecords.length,
    incoming.repeatCount,
    occurrenceRecords.length,
  )
  const hasNewRecurrence = repeatCount > current.repeatCount

  return {
    ...current,
    ...incoming,
    id: current.id,
    questionId: current.questionId,
    occurrences,
    occurrenceKeys,
    occurrenceRecords: occurrenceRecords.map(cloneData),
    firstOccurredAt: occurrenceBounds.first
      ?? current.firstOccurredAt
      ?? incoming.firstOccurredAt,
    lastOccurredAt: occurrenceBounds.last
      ?? incoming.lastOccurredAt
      ?? current.lastOccurredAt,
    repeatCount,
    hasIncompleteOccurrenceHistory: current.hasIncompleteOccurrenceHistory
      || incoming.hasIncompleteOccurrenceHistory,
    status: hasNewRecurrence ? 'pending_review' : current.status,
    redoHistory: mergeRedoHistory(current.redoHistory, incoming.redoHistory),
    verificationVariantId: hasNewRecurrence ? null : current.verificationVariantId,
    variantVerifiedAt: hasNewRecurrence ? null : current.variantVerifiedAt,
    variantVerification: hasNewRecurrence ? null : current.variantVerification,
  }
}

export function mergeErrorCards(existing, incoming) {
  const merged = []
  const indexByQuestionId = new Map()

  const mergeCandidates = (candidates, source) => {
    candidates.forEach((candidate) => {
      const card = normalizeCard(candidate, source)
      if (!card) return
      const existingIndex = indexByQuestionId.get(card.questionId)
      if (existingIndex === undefined) {
        indexByQuestionId.set(card.questionId, merged.length)
        merged.push(card)
        return
      }
      merged[existingIndex] = mergeRepeatedCard(merged[existingIndex], card)
    })
  }

  mergeCandidates(Array.isArray(existing) ? existing : [], 'existing')
  mergeCandidates(Array.isArray(incoming) ? incoming : [], 'incoming')

  return merged
}
