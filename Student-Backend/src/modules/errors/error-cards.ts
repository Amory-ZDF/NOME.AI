import { createHash } from 'node:crypto'
import { z } from 'zod'

import { cloneSafeJson, type JsonValue } from '../../common/json/safe-json.js'
import {
  errorItemSchema,
  errorItemShape,
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

const rawFreshErrorItemSchema = z.strictObject({
  ...errorItemShape,
  verificationVariantId: errorItemShape.verificationVariantId.optional(),
  variantVerifiedAt: errorItemShape.variantVerifiedAt.optional(),
  variantVerification: errorItemShape.variantVerification.optional(),
})

const safeRawFreshErrorItemSchema = z.preprocess((value) => {
  try {
    return cloneSafeJson(value)
  } catch {
    return null
  }
}, rawFreshErrorItemSchema)

const normalizedFreshErrorItemSchema = safeRawFreshErrorItemSchema.transform((value) => ({
  ...value,
  verificationVariantId: value.verificationVariantId ?? null,
  variantVerifiedAt: value.variantVerifiedAt ?? null,
  variantVerification: value.variantVerification ?? null,
}))

export const freshErrorItemSchema = normalizedFreshErrorItemSchema
  .pipe(errorItemSchema as z.ZodType<
    ErrorItem,
    z.output<typeof normalizedFreshErrorItemSchema>
  >)
  .superRefine((value, context) => {
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

export const occurrenceEvidenceBindingSchema = z.strictObject({
  key: z.string().min(1),
  occurredAt: z.string().min(1),
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/u),
})

export type OccurrenceEvidenceBinding = z.infer<typeof occurrenceEvidenceBindingSchema>

const storedErrorAggregateSchema = z.strictObject({
  storageVersion: z.literal(1),
  error: errorItemSchema,
  occurrenceEvidenceBindings: z.array(occurrenceEvidenceBindingSchema),
}).superRefine((value, context) => {
  const records = new Map(
    value.error.occurrenceRecords.map((record) => [record.key, record.occurredAt] as const),
  )
  const seen = new Set<string>()
  for (const [index, binding] of value.occurrenceEvidenceBindings.entries()) {
    if (seen.has(binding.key) || records.get(binding.key) !== binding.occurredAt) {
      context.addIssue({
        code: 'custom',
        path: ['occurrenceEvidenceBindings', index],
        message: 'Occurrence evidence binding is inconsistent',
      })
    }
    seen.add(binding.key)
  }
  if (
    value.occurrenceEvidenceBindings.length !== records.size ||
    [...records.keys()].some((key) => !seen.has(key))
  ) {
    context.addIssue({
      code: 'custom',
      path: ['occurrenceEvidenceBindings'],
      message: 'Occurrence evidence bindings must cover every occurrence exactly once',
    })
  }
})

export interface StoredErrorAggregate {
  error: ErrorItem
  occurrenceEvidenceBindings: OccurrenceEvidenceBinding[]
}

export function parseStoredErrorAggregate(payload: unknown): StoredErrorAggregate {
  const stored = storedErrorAggregateSchema.safeParse(payload)
  if (stored.success) {
    return {
      error: stored.data.error,
      occurrenceEvidenceBindings: stored.data.occurrenceEvidenceBindings,
    }
  }

  const error = errorItemSchema.parse(payload)
  if (error.occurrenceRecords.length !== 1) {
    throw new Error('Legacy multi-occurrence evidence cannot be verified')
  }
  return {
    error,
    occurrenceEvidenceBindings: newBindings(error, error.occurrenceRecords),
  }
}

export function storedErrorPayload(aggregate: StoredErrorAggregate) {
  return storedErrorAggregateSchema.parse({
    storageVersion: 1,
    error: aggregate.error,
    occurrenceEvidenceBindings: aggregate.occurrenceEvidenceBindings,
  })
}

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

function freshEvidenceFingerprint(item: ErrorItem): string {
  const {
    id: _id,
    firstOccurredAt: _firstOccurredAt,
    lastOccurredAt: _lastOccurredAt,
    occurrences: _occurrences,
    occurrenceKeys: _occurrenceKeys,
    occurrenceRecords: _occurrenceRecords,
    repeatCount: _repeatCount,
    hasIncompleteOccurrenceHistory: _hasIncompleteOccurrenceHistory,
    status: _status,
    redoHistory: _redoHistory,
    verificationVariantId: _verificationVariantId,
    variantVerifiedAt: _variantVerifiedAt,
    variantVerification: _variantVerification,
    ...freshEvidence
  } = item

  return evidenceFingerprint(cloneSafeJson(freshEvidence))
}

function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key]!)}`)
    .join(',')}}`
}

function evidenceFingerprint(value: JsonValue): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

export function redoOccurrenceEvidenceBinding(
  errorId: string,
  attempt: RedoAttempt,
  record: ErrorItem['occurrenceRecords'][number],
): OccurrenceEvidenceBinding {
  return occurrenceEvidenceBindingSchema.parse({
    key: record.key,
    occurredAt: record.occurredAt,
    fingerprint: evidenceFingerprint(cloneSafeJson({
      source: 'redo',
      errorId,
      attempt,
    })),
  })
}

function newBindings(
  item: ErrorItem,
  records: ErrorItem['occurrenceRecords'],
): OccurrenceEvidenceBinding[] {
  const fingerprint = freshEvidenceFingerprint(item)
  return records.map((record) => ({
    key: record.key,
    occurredAt: record.occurredAt,
    fingerprint,
  }))
}

function assertBoundReplays(
  current: StoredErrorAggregate,
  incoming: ErrorItem,
): void {
  const fingerprint = freshEvidenceFingerprint(incoming)
  const bindings = new Map(
    current.occurrenceEvidenceBindings.map((binding) => [binding.key, binding] as const),
  )
  for (const record of incoming.occurrenceRecords) {
    const binding = bindings.get(record.key)
    if (
      binding !== undefined &&
      (binding.occurredAt !== record.occurredAt || binding.fingerprint !== fingerprint)
    ) {
      throw new OccurrenceConflictError()
    }
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

export function mergeErrorAggregates(
  existing: readonly StoredErrorAggregate[],
  incoming: readonly ErrorItem[],
): StoredErrorAggregate[] {
  assertBatchIdentities(existing.map(({ error }) => error), incoming)

  const merged = existing.map((aggregate) => structuredClone(aggregate))
  const indexByQuestion = new Map(
    merged.map((aggregate, index) => [aggregate.error.questionId, index] as const),
  )

  for (const rawIncoming of incoming) {
    const nextIncoming = structuredClone(rawIncoming)
    const currentIndex = indexByQuestion.get(nextIncoming.questionId)
    if (currentIndex === undefined) {
      indexByQuestion.set(nextIncoming.questionId, merged.length)
      merged.push({
        error: nextIncoming,
        occurrenceEvidenceBindings: newBindings(
          nextIncoming,
          nextIncoming.occurrenceRecords,
        ),
      })
      continue
    }

    const current = merged[currentIndex]
    if (current === undefined) throw new Error('Missing recurrence aggregate')
    assertBoundReplays(current, nextIncoming)
    const knownKeys = new Set(current.error.occurrenceRecords.map(({ key }) => key))
    const newRecords = nextIncoming.occurrenceRecords.filter(({ key }) => !knownKeys.has(key))
    if (newRecords.length === 0) continue
    if (
      newRecords.some(
        ({ occurredAt }) =>
          evidenceInstant(occurredAt) < evidenceInstant(current.error.lastOccurredAt),
      )
    ) {
      throw new OutOfOrderOccurrenceError()
    }

    const occurrenceRecords = [
      ...current.error.occurrenceRecords,
      ...newRecords,
    ].map((record) => structuredClone(record))
    const recordBounds = occurrenceBounds(occurrenceRecords)
    const hasIncompleteHistory = current.error.hasIncompleteOccurrenceHistory === true
    const mergedItem: ErrorItem = {
      ...current.error,
      ...nextIncoming,
      id: current.error.id,
      questionId: current.error.questionId,
      occurrences: occurrenceRecords.map(({ occurredAt }) => occurredAt),
      occurrenceKeys: occurrenceRecords.map(({ key }) => key),
      occurrenceRecords,
      firstOccurredAt: timeMin(current.error.firstOccurredAt, recordBounds.first),
      lastOccurredAt: timeMax(current.error.lastOccurredAt, recordBounds.last),
      repeatCount: current.error.repeatCount + newRecords.length,
      hasIncompleteOccurrenceHistory: hasIncompleteHistory,
      status: 'pending_review',
      redoHistory: mergeRedoHistory(current.error.redoHistory, nextIncoming.redoHistory),
      verificationVariantId: null,
      variantVerifiedAt: null,
      variantVerification: null,
    }
    merged[currentIndex] = {
      error: errorItemSchema.parse(mergedItem),
      occurrenceEvidenceBindings: [
        ...current.occurrenceEvidenceBindings,
        ...newBindings(nextIncoming, newRecords),
      ],
    }
  }

  return merged.map((aggregate) => {
    const stored = storedErrorPayload(aggregate)
    return {
      error: stored.error,
      occurrenceEvidenceBindings: stored.occurrenceEvidenceBindings,
    }
  })
}
