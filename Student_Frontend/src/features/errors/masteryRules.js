const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const nonemptyString = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null)
const ISO_CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const RFC3339_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?([Zz]|[+-](\d{2}):(\d{2}))$/

const isLeapYear = (year) => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
const daysInMonth = (year, month) => {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}
const isValidCalendarDate = (year, month, day) => (
  year >= 1
  && month >= 1
  && month <= 12
  && day >= 1
  && day <= daysInMonth(year, month)
)

const utcTimeValue = (year, month, day, hour = 0, minute = 0, second = 0) => {
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  date.setUTCHours(hour, minute, second, 0)
  return date.getTime()
}

const parseEvidenceTime = (value) => {
  const candidate = nonemptyString(value)
  if (!candidate) return null

  const calendarMatch = ISO_CALENDAR_DATE.exec(candidate)
  if (calendarMatch) {
    const [, year, month, day] = calendarMatch.map(Number)
    if (!isValidCalendarDate(year, month, day)) return null
    return { normalized: candidate, timeValue: utcTimeValue(year, month, day) }
  }

  const timestampMatch = RFC3339_TIMESTAMP.exec(candidate)
  if (!timestampMatch) return null

  const [, rawYear, rawMonth, rawDay, rawHour, rawMinute, rawSecond, fraction, zone, rawOffsetHour, rawOffsetMinute] = timestampMatch
  const [year, month, day, hour, minute, second] = [
    rawYear,
    rawMonth,
    rawDay,
    rawHour,
    rawMinute,
    rawSecond,
  ].map(Number)
  if (!isValidCalendarDate(year, month, day)) return null
  if (hour > 23 || minute > 59 || second > 59) return null

  const offsetHour = Number(rawOffsetHour ?? 0)
  const offsetMinute = Number(rawOffsetMinute ?? 0)
  if (zone.toUpperCase() !== 'Z' && (offsetHour > 23 || offsetMinute > 59)) return null

  const offsetDirection = zone.startsWith('+') ? 1 : zone.startsWith('-') ? -1 : 0
  const offsetMilliseconds = offsetDirection * ((offsetHour * 60) + offsetMinute) * 60_000
  const fractionMilliseconds = fraction ? Number(`0.${fraction}`) * 1000 : 0
  const timeValue = utcTimeValue(year, month, day, hour, minute, second)
    + fractionMilliseconds
    - offsetMilliseconds
  return { normalized: candidate, timeValue }
}

const normalizeEvidenceTime = (value) => parseEvidenceTime(value)?.normalized ?? null
const evidenceTimeValue = (value) => parseEvidenceTime(value)?.timeValue ?? null
export const isValidEvidenceTime = (value) => parseEvidenceTime(value) !== null
export const compareEvidenceTimes = (left, right) => {
  const leftTimeValue = evidenceTimeValue(left)
  const rightTimeValue = evidenceTimeValue(right)
  if (leftTimeValue === null && rightTimeValue === null) return 0
  if (leftTimeValue === null) return 1
  if (rightTimeValue === null) return -1
  return leftTimeValue - rightTimeValue
}

const isCompleteRedoEvidence = (attempt) => (
  isRecord(attempt)
  && normalizeEvidenceTime(attempt.attemptedAt) !== null
  && typeof attempt.answer === 'string'
  && typeof attempt.isCorrect === 'boolean'
  && Number.isFinite(attempt.timeSpent)
  && attempt.timeSpent >= 0
)

const cloneData = (value) => {
  if (Array.isArray(value)) return value.map(cloneData)
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneData(entry)]))
  }
  return value
}

const cloneItem = (errorItem) => (isRecord(errorItem) ? cloneData(errorItem) : {})
const normalizeRedoHistory = (value) => (
  Array.isArray(value) ? value.filter(isRecord).map(cloneData) : []
)
const normalizeRepeatCount = (value) => (Number.isInteger(value) && value >= 0 ? value : 0)

const legacyOccurrenceSlots = (errorItem) => {
  const occurrences = Array.isArray(errorItem.occurrences)
    ? errorItem.occurrences.map(normalizeEvidenceTime)
    : []
  if (occurrences.length === 0) {
    const first = normalizeEvidenceTime(errorItem.firstOccurredAt)
    const last = normalizeEvidenceTime(errorItem.lastOccurredAt)
    if (first) occurrences.push(first)
    if (last && last !== first) occurrences.push(last)
  }
  return occurrences
}

const fallbackOccurrenceKey = (errorItem, occurredAt, index) => {
  const questionId = nonemptyString(errorItem.questionId)
  const sessionId = nonemptyString(errorItem.sessionId)
  if (index === 0 && sessionId && questionId) {
    return `session:${sessionId}:question:${questionId}`
  }
  if (questionId) return `legacy:${questionId}:${occurredAt}`

  const errorId = nonemptyString(errorItem.id)
  return errorId ? `card:${errorId}:${occurredAt}` : `legacy:unknown:${occurredAt}`
}

const normalizeOccurrenceEvidence = (errorItem) => {
  const occurrenceRecords = Array.isArray(errorItem.occurrenceRecords)
    ? errorItem.occurrenceRecords
    : []
  const occurrenceKeys = Array.isArray(errorItem.occurrenceKeys)
    ? errorItem.occurrenceKeys
    : []
  const occurrenceSlots = legacyOccurrenceSlots(errorItem)
  const recordCount = Math.max(
    occurrenceRecords.length,
    occurrenceKeys.length,
    occurrenceSlots.length,
  )
  const seen = new Set()
  const records = []

  for (let index = 0; index < recordCount; index += 1) {
    const record = isRecord(occurrenceRecords[index]) ? occurrenceRecords[index] : {}
    const occurredAt = normalizeEvidenceTime(record.occurredAt) ?? occurrenceSlots[index]
    if (!occurredAt) continue

    const key = nonemptyString(record.key)
      ?? nonemptyString(occurrenceKeys[index])
      ?? fallbackOccurrenceKey(errorItem, occurredAt, index)
    if (seen.has(key)) continue
    seen.add(key)
    records.push({ key, occurredAt })
  }

  return records
}

const redoOccurrenceKey = (errorItem, attemptedAt) => {
  const errorId = nonemptyString(errorItem.id)
  if (errorId) return `redo:error:${errorId}:${attemptedAt}`

  const questionId = nonemptyString(errorItem.questionId)
  return questionId
    ? `redo:question:${questionId}:${attemptedAt}`
    : `redo:unknown:${attemptedAt}`
}

const occurrenceTimeBounds = (records) => records.reduce((bounds, record) => {
  const timeValue = evidenceTimeValue(record.occurredAt)
  const firstTimeValue = bounds.first ? evidenceTimeValue(bounds.first.occurredAt) : null
  const lastTimeValue = bounds.last ? evidenceTimeValue(bounds.last.occurredAt) : null
  return {
    first: firstTimeValue === null || timeValue < firstTimeValue ? record : bounds.first,
    last: lastTimeValue === null || timeValue > lastTimeValue ? record : bounds.last,
  }
}, { first: null, last: null })

const latestCompleteRedo = (errorItem) => {
  const history = Array.isArray(errorItem?.redoHistory) ? errorItem.redoHistory : []
  return history.reduce((latest, candidate) => {
    if (!isCompleteRedoEvidence(candidate)) return latest
    if (!latest) return candidate

    const candidateTime = evidenceTimeValue(candidate.attemptedAt)
    const latestTime = evidenceTimeValue(latest.attemptedAt)
    if (candidateTime > latestTime) return candidate
    if (candidateTime === latestTime && candidate.isCorrect === false) return candidate
    return latest
  }, null)
}
const latestRedoIsCompleteAndCorrect = (errorItem) => latestCompleteRedo(errorItem)?.isCorrect === true

export class RedoChronologyError extends RangeError {
  constructor() {
    super('Redo attempt must be later than all persisted redo evidence')
    this.name = 'RedoChronologyError'
    this.code = 'REDO_CHRONOLOGY_CONFLICT'
  }
}

const normalizeRedoAttempt = (attempt) => {
  if (!isCompleteRedoEvidence(attempt)) throw new TypeError('redo attempt must contain complete valid evidence')

  const attemptedAt = normalizeEvidenceTime(attempt.attemptedAt)

  return {
    ...cloneData(attempt),
    attemptedAt,
    answer: attempt.answer,
    isCorrect: attempt.isCorrect,
    timeSpent: attempt.timeSpent,
  }
}

const clearVerification = (item) => ({
  ...item,
  verificationVariantId: null,
  variantVerifiedAt: null,
  variantVerification: null,
})

export function applyRedoAttempt(errorItem, attempt) {
  const normalizedAttempt = normalizeRedoAttempt(attempt)
  const current = cloneItem(errorItem)
  const latestRedo = latestCompleteRedo(current)
  if (
    latestRedo
    && evidenceTimeValue(normalizedAttempt.attemptedAt) <= evidenceTimeValue(latestRedo.attemptedAt)
  ) throw new RedoChronologyError()

  const redoHistory = [...normalizeRedoHistory(current.redoHistory), normalizedAttempt]
  const repeatCount = normalizeRepeatCount(current.repeatCount)
  const recurrenceEvidence = {}

  if (!normalizedAttempt.isCorrect) {
    const occurrenceRecords = normalizeOccurrenceEvidence(current)
    const occurrenceKey = redoOccurrenceKey(current, normalizedAttempt.attemptedAt)
    if (occurrenceRecords.some((record) => record.key === occurrenceKey)) {
      throw new RedoChronologyError()
    }
    occurrenceRecords.push({
      key: occurrenceKey,
      occurredAt: normalizedAttempt.attemptedAt,
    })
    recurrenceEvidence.occurrenceRecords = occurrenceRecords.map(cloneData)
    recurrenceEvidence.occurrenceKeys = occurrenceRecords.map((record) => record.key)
    recurrenceEvidence.occurrences = occurrenceRecords.map((record) => record.occurredAt)
    const bounds = occurrenceTimeBounds(occurrenceRecords)
    recurrenceEvidence.firstOccurredAt = bounds.first.occurredAt
    recurrenceEvidence.lastOccurredAt = bounds.last.occurredAt
  }

  return clearVerification({
    ...current,
    ...recurrenceEvidence,
    redoHistory,
    repeatCount: normalizedAttempt.isCorrect ? repeatCount : repeatCount + 1,
    status: normalizedAttempt.isCorrect ? 'verification_due' : 'pending_review',
  })
}

export function attachVerificationVariant(errorItem, variantId) {
  const current = cloneItem(errorItem)
  const normalizedVariantId = nonemptyString(variantId)
  if (
    !normalizedVariantId
    || current.status !== 'verification_due'
    || !latestRedoIsCompleteAndCorrect(current)
  ) return current

  return {
    ...current,
    verificationVariantId: normalizedVariantId,
    variantVerifiedAt: null,
    variantVerification: null,
  }
}

export function recordVariantVerification(errorItem, result) {
  const current = cloneItem(errorItem)
  if (!isRecord(result)) return current

  const variantId = nonemptyString(result.variantId)
  const verifiedAt = normalizeEvidenceTime(result.verifiedAt)
  if (!variantId || !verifiedAt || typeof result.isCorrect !== 'boolean') return current

  const linkedVariantId = nonemptyString(current.verificationVariantId)
  const latestRedo = latestCompleteRedo(current)
  if (
    current.status !== 'verification_due'
    || latestRedo?.isCorrect !== true
    || !linkedVariantId
    || variantId !== linkedVariantId
  ) return current

  const verifiedTimeValue = evidenceTimeValue(verifiedAt)
  const redoTimeValue = evidenceTimeValue(latestRedo.attemptedAt)
  if (verifiedTimeValue < redoTimeValue) return current

  const currentVerificationTimes = [
    evidenceTimeValue(current.variantVerifiedAt),
    evidenceTimeValue(current.variantVerification?.verifiedAt),
  ].filter((timeValue) => timeValue !== null)
  if (
    currentVerificationTimes.length > 0
    && verifiedTimeValue <= Math.max(...currentVerificationTimes)
  ) return current

  const variantVerification = {
    ...cloneData(result),
    variantId,
    isCorrect: result.isCorrect,
    verifiedAt,
  }

  if (!result.isCorrect) {
    return {
      ...current,
      status: 'reviewing',
      variantVerifiedAt: null,
      variantVerification,
    }
  }

  return {
    ...current,
    variantVerifiedAt: verifiedAt,
    variantVerification,
  }
}

export function canMarkMastered(errorItem) {
  if (!isRecord(errorItem)) return false
  if (errorItem.status !== 'verification_due' && errorItem.status !== 'mastered') return false
  const latestRedo = latestCompleteRedo(errorItem)
  if (latestRedo?.isCorrect !== true) return false

  const linkedVariantId = nonemptyString(errorItem.verificationVariantId)
  const variantVerifiedAt = normalizeEvidenceTime(errorItem.variantVerifiedAt)
  const verification = errorItem.variantVerification
  const verificationTime = normalizeEvidenceTime(verification?.verifiedAt)
  const verificationTimeValue = evidenceTimeValue(verificationTime)
  const redoTimeValue = evidenceTimeValue(latestRedo.attemptedAt)

  return Boolean(
    linkedVariantId
    && variantVerifiedAt
    && isRecord(verification)
    && nonemptyString(verification.variantId) === linkedVariantId
    && verification.isCorrect === true
    && verificationTime === variantVerifiedAt
    && verificationTimeValue >= redoTimeValue
  )
}
