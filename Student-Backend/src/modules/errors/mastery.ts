import {
  errorItemSchema,
  type ErrorItem,
  type RedoAttempt,
} from '../../contracts/student-contracts.js'

function evidenceInstant(value: string): number {
  return Date.parse(value)
}

function occurrenceEvidenceInstants(error: ErrorItem): number[] {
  return [
    error.firstOccurredAt,
    error.lastOccurredAt,
    ...error.occurrences,
    ...error.occurrenceRecords.map(({ occurredAt }) => occurredAt),
  ].map(evidenceInstant)
}

function reviewLifecycleInstants(error: ErrorItem): number[] {
  return [
    ...error.redoHistory.map(({ attemptedAt }) => attemptedAt),
    ...(error.variantVerifiedAt === null ? [] : [error.variantVerifiedAt]),
    ...(error.variantVerification === null ? [] : [error.variantVerification.verifiedAt]),
  ].map(evidenceInstant)
}

export function latestOccurrenceEvidenceInstant(error: ErrorItem): number {
  return Math.max(...occurrenceEvidenceInstants(error))
}

export function latestReviewLifecycleInstant(error: ErrorItem): number | undefined {
  const instants = reviewLifecycleInstants(error)
  return instants.length === 0 ? undefined : Math.max(...instants)
}

export function latestLifecycleEvidenceInstant(error: ErrorItem): number {
  const reviewLifecycle = latestReviewLifecycleInstant(error)
  return Math.max(
    latestOccurrenceEvidenceInstant(error),
    reviewLifecycle ?? Number.NEGATIVE_INFINITY,
  )
}

function occurrenceBounds(records: ErrorItem['occurrenceRecords']): {
  first: string
  last: string
} {
  const first = records.reduce((current, candidate) =>
    evidenceInstant(candidate.occurredAt) < evidenceInstant(current.occurredAt)
      ? candidate
      : current,
  )
  const last = records.reduce((current, candidate) =>
    evidenceInstant(candidate.occurredAt) > evidenceInstant(current.occurredAt)
      ? candidate
      : current,
  )
  return { first: first.occurredAt, last: last.occurredAt }
}

export class RedoChronologyError extends RangeError {
  readonly code = 'REDO_CHRONOLOGY_CONFLICT'

  constructor() {
    super('Redo attempt must be later than all persisted lifecycle evidence')
    this.name = 'RedoChronologyError'
  }
}

export function applyRedoAttempt(
  error: ErrorItem,
  attempt: RedoAttempt,
): ErrorItem {
  const latestEvidence = latestLifecycleEvidenceInstant(error)
  const attemptedAt = evidenceInstant(attempt.attemptedAt)
  if (attemptedAt <= latestEvidence) throw new RedoChronologyError()

  const redoHistory = [
    ...error.redoHistory.map((entry) => structuredClone(entry)),
    structuredClone(attempt),
  ]
  let occurrences = error.occurrences.map((entry) => entry)
  let occurrenceKeys = error.occurrenceKeys.map((entry) => entry)
  let occurrenceRecords = error.occurrenceRecords.map((entry) => structuredClone(entry))
  let firstOccurredAt = error.firstOccurredAt
  let lastOccurredAt = error.lastOccurredAt

  if (!attempt.isCorrect) {
    const key = `redo:error:${error.id}:${attempt.attemptedAt}`
    if (occurrenceKeys.includes(key)) throw new RedoChronologyError()
    occurrenceRecords = [
      ...occurrenceRecords,
      { key, occurredAt: attempt.attemptedAt },
    ]
    occurrenceKeys = occurrenceRecords.map((record) => record.key)
    occurrences = occurrenceRecords.map((record) => record.occurredAt)
    const bounds = occurrenceBounds(occurrenceRecords)
    firstOccurredAt =
      evidenceInstant(error.firstOccurredAt) <= evidenceInstant(bounds.first)
        ? error.firstOccurredAt
        : bounds.first
    lastOccurredAt =
      evidenceInstant(error.lastOccurredAt) >= evidenceInstant(bounds.last)
        ? error.lastOccurredAt
        : bounds.last
  }

  return errorItemSchema.parse({
    ...structuredClone(error),
    status: attempt.isCorrect ? 'verification_due' : 'pending_review',
    redoHistory,
    occurrences,
    occurrenceKeys,
    occurrenceRecords,
    firstOccurredAt,
    lastOccurredAt,
    repeatCount: error.repeatCount + (attempt.isCorrect ? 0 : 1),
    verificationVariantId: null,
    variantVerifiedAt: null,
    variantVerification: null,
  })
}
