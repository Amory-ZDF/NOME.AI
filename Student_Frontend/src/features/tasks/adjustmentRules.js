export const ADJUSTMENT_REASONS = ['time_conflict', 'difficulty', 'health', 'other']
export const ADJUSTMENT_CLOCK_ERROR = 'Unable to validate current time. Try again.'

const NativeDate = Date
const nativeGetTime = Date.prototype.getTime
const nativeToISOString = Date.prototype.toISOString

const readDateMillis = (value) => {
  try {
    const milliseconds = Reflect.apply(nativeGetTime, value, [])
    return Number.isFinite(milliseconds) ? milliseconds : null
  } catch {
    return null
  }
}

const parseDateMillis = (value) => {
  const brandedMilliseconds = readDateMillis(value)
  if (brandedMilliseconds !== null) return brandedMilliseconds
  try {
    return readDateMillis(new NativeDate(value))
  } catch {
    return null
  }
}

const toTrustedIso = (milliseconds) => Reflect.apply(
  nativeToISOString,
  new NativeDate(milliseconds),
  [],
)

const isFutureMillis = (proposedDueAt, actionNow) => (
  proposedDueAt !== null && proposedDueAt > actionNow
)

const clampAvailableMinutes = (value) => {
  const minutes = Math.trunc(Number(value))
  if (!Number.isFinite(minutes)) return 0
  return Math.min(720, Math.max(0, minutes))
}

export function validateAdjustmentDraft(draft, now) {
  const errors = {}
  const actionNow = arguments.length < 2 ? new NativeDate() : now
  const actionNowMillis = readDateMillis(actionNow)

  if (!draft.reason) {
    errors.reason = 'Choose a reason'
  } else if (!ADJUSTMENT_REASONS.includes(draft.reason)) {
    errors.reason = 'Choose a valid reason'
  }

  if (actionNowMillis === null) {
    errors.proposedDueAt = ADJUSTMENT_CLOCK_ERROR
  } else if (!isFutureMillis(parseDateMillis(draft.proposedDueAt), actionNowMillis)) {
    errors.proposedDueAt = 'Choose a future time'
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

export function buildAdjustmentRequest({ task, draft, now, id }) {
  const actionNowMillis = readDateMillis(now)
  if (actionNowMillis === null) throw new Error(ADJUSTMENT_CLOCK_ERROR)
  const proposedDueAtMillis = parseDateMillis(draft.proposedDueAt)
  if (!isFutureMillis(proposedDueAtMillis, actionNowMillis)) throw new Error('Choose a future time')
  return {
    id,
    taskId: task.id,
    reason: draft.reason,
    details: String(draft.details ?? '').trim(),
    availableMinutes: clampAvailableMinutes(draft.availableMinutes),
    proposedDueAt: toTrustedIso(proposedDueAtMillis),
    createdAt: toTrustedIso(actionNowMillis),
    status: 'submitted',
  }
}
