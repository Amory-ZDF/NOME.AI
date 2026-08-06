const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const nonemptyString = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null)

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
const latestRedoIsCorrect = (errorItem) => {
  const history = Array.isArray(errorItem?.redoHistory) ? errorItem.redoHistory : []
  const latest = history.at(-1)
  return isRecord(latest) && latest.isCorrect === true
}

const normalizeRedoAttempt = (attempt) => {
  if (!isRecord(attempt)) throw new TypeError('redo attempt must be an object')

  const attemptedAt = nonemptyString(attempt.attemptedAt)
  if (!attemptedAt) throw new TypeError('attempt.attemptedAt must be a non-empty string')
  if (typeof attempt.answer !== 'string') throw new TypeError('attempt.answer must be a string')
  if (typeof attempt.isCorrect !== 'boolean') throw new TypeError('attempt.isCorrect must be a boolean')
  if (!Number.isFinite(attempt.timeSpent) || attempt.timeSpent < 0) {
    throw new TypeError('attempt.timeSpent must be a non-negative finite number')
  }

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
    || !latestRedoIsCorrect(current)
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
  const verifiedAt = nonemptyString(result.verifiedAt)
  if (!variantId || !verifiedAt || typeof result.isCorrect !== 'boolean') return current

  const linkedVariantId = nonemptyString(current.verificationVariantId)
  if (
    current.status !== 'verification_due'
    || !latestRedoIsCorrect(current)
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
  if (!latestRedoIsCorrect(errorItem)) return false

  const linkedVariantId = nonemptyString(errorItem.verificationVariantId)
  const variantVerifiedAt = nonemptyString(errorItem.variantVerifiedAt)
  const verification = errorItem.variantVerification

  return Boolean(
    linkedVariantId
    && variantVerifiedAt
    && isRecord(verification)
    && nonemptyString(verification.variantId) === linkedVariantId
    && verification.isCorrect === true
    && nonemptyString(verification.verifiedAt) === variantVerifiedAt
  )
}
