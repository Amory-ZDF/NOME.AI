export const ADJUSTMENT_REASONS = ['time_conflict', 'difficulty', 'health', 'other']

const toDate = (value) => new Date(value)

const isFutureDate = (value, now) => {
  const proposedDueAt = toDate(value).getTime()
  return !Number.isNaN(proposedDueAt) && proposedDueAt > toDate(now).getTime()
}

const clampAvailableMinutes = (value) => {
  const minutes = Math.trunc(Number(value))
  if (!Number.isFinite(minutes)) return 0
  return Math.min(720, Math.max(0, minutes))
}

export function validateAdjustmentDraft(draft, now = new Date()) {
  const errors = {}

  if (!draft.reason) {
    errors.reason = 'Choose a reason'
  } else if (!ADJUSTMENT_REASONS.includes(draft.reason)) {
    errors.reason = 'Choose a valid reason'
  }

  if (!isFutureDate(draft.proposedDueAt, now)) {
    errors.proposedDueAt = 'Choose a future time'
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

export function buildAdjustmentRequest({ task, draft, now, id }) {
  return {
    id,
    taskId: task.id,
    reason: draft.reason,
    details: String(draft.details ?? '').trim(),
    availableMinutes: clampAvailableMinutes(draft.availableMinutes),
    proposedDueAt: toDate(draft.proposedDueAt).toISOString(),
    createdAt: toDate(now).toISOString(),
    status: 'submitted',
  }
}
