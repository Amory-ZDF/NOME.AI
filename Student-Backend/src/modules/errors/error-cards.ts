import { z } from 'zod'

import {
  errorItemSchema,
  type ErrorItem,
  type RedoAttempt,
} from '../../contracts/student-contracts.js'

function evidenceInstant(value: string): number {
  return Date.parse(value)
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

export function hasConsistentOccurrenceBounds(value: ErrorItem): boolean {
  const bounds = occurrenceBounds(value.occurrenceRecords)
  if (value.hasIncompleteOccurrenceHistory === true) {
    return (
      evidenceInstant(value.firstOccurredAt) <= evidenceInstant(bounds.first) &&
      evidenceInstant(value.lastOccurredAt) >= evidenceInstant(bounds.last)
    )
  }
  return value.firstOccurredAt === bounds.first && value.lastOccurredAt === bounds.last
}

export const freshErrorItemSchema = errorItemSchema.superRefine((value, context) => {
  if (value.status !== 'pending_review') {
    context.addIssue({
      code: 'custom',
      path: ['status'],
      message: 'Incoming errors must start in pending_review',
    })
  }
  if (value.redoHistory.length !== 0) {
    context.addIssue({
      code: 'custom',
      path: ['redoHistory'],
      message: 'Incoming errors cannot contain redo history',
    })
  }
  if (
    value.verificationVariantId !== null ||
    value.variantVerifiedAt !== null ||
    value.variantVerification !== null
  ) {
    context.addIssue({
      code: 'custom',
      path: ['verificationVariantId'],
      message: 'Incoming errors cannot contain verification evidence',
    })
  }
  if (value.hasIncompleteOccurrenceHistory === true) {
    context.addIssue({
      code: 'custom',
      path: ['hasIncompleteOccurrenceHistory'],
      message: 'Incoming errors cannot claim incomplete legacy occurrence history',
    })
  }
  if (!hasConsistentOccurrenceBounds(value)) {
    context.addIssue({
      code: 'custom',
      path: ['firstOccurredAt'],
      message: 'Occurrence bounds must match the supplied occurrence records',
    })
  }
})

export const errorBatchBodySchema = z.strictObject({
  items: z.array(freshErrorItemSchema),
})

export type ErrorBatchBody = z.infer<typeof errorBatchBodySchema>

export class DuplicateErrorIdError extends Error {
  constructor() {
    super('Error id already exists')
    this.name = 'DuplicateErrorIdError'
  }
}

export class OccurrenceConflictError extends Error {
  constructor() {
    super('Occurrence identity conflicts with persisted evidence')
    this.name = 'OccurrenceConflictError'
  }
}

export class OutOfOrderOccurrenceError extends Error {
  constructor() {
    super('Fresh recurrence evidence cannot predate persisted evidence')
    this.name = 'OutOfOrderOccurrenceError'
  }
}

interface BatchIdentityState {
  readonly questionById: Map<string, string>
  readonly occurrenceByKey: Map<string, { questionId: string; occurredAt: string }>
}

function registerId(
  state: BatchIdentityState,
  id: string,
  questionId: string,
): void {
  const knownQuestion = state.questionById.get(id)
  if (knownQuestion !== undefined && knownQuestion !== questionId) {
    throw new DuplicateErrorIdError()
  }
  state.questionById.set(id, questionId)
}

function registerOccurrences(
  state: BatchIdentityState,
  item: ErrorItem,
): void {
  for (const record of item.occurrenceRecords) {
    const known = state.occurrenceByKey.get(record.key)
    if (
      known !== undefined &&
      (known.questionId !== item.questionId || known.occurredAt !== record.occurredAt)
    ) {
      throw new OccurrenceConflictError()
    }
    state.occurrenceByKey.set(record.key, {
      questionId: item.questionId,
      occurredAt: record.occurredAt,
    })
  }
}

export function assertBatchIdentities(
  existing: readonly ErrorItem[],
  incoming: readonly ErrorItem[],
): void {
  const state: BatchIdentityState = {
    questionById: new Map(),
    occurrenceByKey: new Map(),
  }

  for (const item of existing) {
    registerId(state, item.id, item.questionId)
    registerOccurrences(state, item)
  }
  for (const item of incoming) {
    registerId(state, item.id, item.questionId)
    registerOccurrences(state, item)
  }
}

function redoKey(attempt: RedoAttempt): string {
  return JSON.stringify([
    attempt.attemptedAt,
    attempt.answer,
    attempt.isCorrect,
    attempt.timeSpent,
  ])
}

function mergeRedoHistory(
  current: ErrorItem['redoHistory'],
  incoming: ErrorItem['redoHistory'],
): ErrorItem['redoHistory'] {
  const seen = new Set<string>()
  return [...current, ...incoming].filter((attempt) => {
    const key = redoKey(attempt)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function timeMin(left: string, right: string): string {
  return evidenceInstant(left) <= evidenceInstant(right) ? left : right
}

function timeMax(left: string, right: string): string {
  return evidenceInstant(left) >= evidenceInstant(right) ? left : right
}

export function mergeErrorCards(
  existing: readonly ErrorItem[],
  incoming: readonly ErrorItem[],
): ErrorItem[] {
  assertBatchIdentities(existing, incoming)

  const merged = existing.map((item) => structuredClone(item))
  const indexByQuestion = new Map(
    merged.map((item, index) => [item.questionId, index] as const),
  )

  for (const rawIncoming of incoming) {
    const nextIncoming = structuredClone(rawIncoming)
    const currentIndex = indexByQuestion.get(nextIncoming.questionId)
    if (currentIndex === undefined) {
      indexByQuestion.set(nextIncoming.questionId, merged.length)
      merged.push(nextIncoming)
      continue
    }

    const current = merged[currentIndex]
    if (current === undefined) throw new Error('Missing recurrence aggregate')
    const knownKeys = new Set(current.occurrenceRecords.map(({ key }) => key))
    const newRecords = nextIncoming.occurrenceRecords.filter(({ key }) => !knownKeys.has(key))
    if (
      newRecords.some(
        ({ occurredAt }) => evidenceInstant(occurredAt) < evidenceInstant(current.lastOccurredAt),
      )
    ) {
      throw new OutOfOrderOccurrenceError()
    }

    const occurrenceRecords = [
      ...current.occurrenceRecords,
      ...newRecords,
    ].map((record) => structuredClone(record))
    const hasNewRecurrence = newRecords.length > 0
    const recordBounds = occurrenceBounds(occurrenceRecords)
    const hasIncompleteHistory = current.hasIncompleteOccurrenceHistory === true
    const mergedItem: ErrorItem = {
      ...current,
      ...nextIncoming,
      id: current.id,
      questionId: current.questionId,
      occurrences: occurrenceRecords.map(({ occurredAt }) => occurredAt),
      occurrenceKeys: occurrenceRecords.map(({ key }) => key),
      occurrenceRecords,
      firstOccurredAt: timeMin(current.firstOccurredAt, recordBounds.first),
      lastOccurredAt: timeMax(current.lastOccurredAt, recordBounds.last),
      repeatCount: current.repeatCount + newRecords.length,
      hasIncompleteOccurrenceHistory: hasIncompleteHistory,
      status: hasNewRecurrence ? 'pending_review' : current.status,
      redoHistory: mergeRedoHistory(current.redoHistory, nextIncoming.redoHistory),
      verificationVariantId: hasNewRecurrence ? null : current.verificationVariantId,
      variantVerifiedAt: hasNewRecurrence ? null : current.variantVerifiedAt,
      variantVerification: hasNewRecurrence ? null : current.variantVerification,
    }
    merged[currentIndex] = errorItemSchema.parse(mergedItem)
  }

  return merged
}
