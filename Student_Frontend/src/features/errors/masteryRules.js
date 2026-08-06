const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const nonemptyString = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null)
const ISO_CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const RFC3339_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?([Zz]|[+-](\d{2}):(\d{2}))$/

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

const normalizeEvidenceTime = (value) => {
  const candidate = nonemptyString(value)
  if (!candidate) return null

  const calendarMatch = ISO_CALENDAR_DATE.exec(candidate)
  if (calendarMatch) {
    const [, year, month, day] = calendarMatch.map(Number)
    return isValidCalendarDate(year, month, day) ? candidate : null
  }

  const timestampMatch = RFC3339_TIMESTAMP.exec(candidate)
  if (!timestampMatch) return null

  const [, year, month, day, hour, minute, second, zone, offsetHour, offsetMinute] = timestampMatch
  if (!isValidCalendarDate(Number(year), Number(month), Number(day))) return null
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return null
  if (zone.toUpperCase() !== 'Z' && (Number(offsetHour) > 23 || Number(offsetMinute) > 59)) return null
  return candidate
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
const latestRedoIsCompleteAndCorrect = (errorItem) => {
  const history = Array.isArray(errorItem?.redoHistory) ? errorItem.redoHistory : []
  const latest = history.at(-1)
  return isCompleteRedoEvidence(latest) && latest.isCorrect === true
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
  const redoHistory = [...normalizeRedoHistory(current.redoHistory), normalizedAttempt]
  const repeatCount = normalizeRepeatCount(current.repeatCount)

  return clearVerification({
    ...current,
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
  if (
    current.status !== 'verification_due'
    || !latestRedoIsCompleteAndCorrect(current)
    || !linkedVariantId
    || variantId !== linkedVariantId
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
  if (!latestRedoIsCompleteAndCorrect(errorItem)) return false

  const linkedVariantId = nonemptyString(errorItem.verificationVariantId)
  const variantVerifiedAt = normalizeEvidenceTime(errorItem.variantVerifiedAt)
  const verification = errorItem.variantVerification
  const verificationTime = normalizeEvidenceTime(verification?.verifiedAt)

  return Boolean(
    linkedVariantId
    && variantVerifiedAt
    && isRecord(verification)
    && nonemptyString(verification.variantId) === linkedVariantId
    && verification.isCorrect === true
    && verificationTime === variantVerifiedAt
  )
}
