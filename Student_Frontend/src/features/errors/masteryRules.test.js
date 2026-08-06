import { describe, expect, test } from 'vitest'
import {
  applyRedoAttempt,
  attachVerificationVariant,
  canMarkMastered,
  recordVariantVerification,
} from './masteryRules'

const correctRedo = {
  attemptedAt: '2026-08-06T10:30:00.000Z',
  answer: '42',
  isCorrect: true,
  timeSpent: 50,
}

const wrongRedo = {
  attemptedAt: '2026-08-06T10:25:00.000Z',
  answer: '41',
  isCorrect: false,
  timeSpent: 35,
}

const verifiedItem = () => {
  const redone = applyRedoAttempt({
    id: 'error-1',
    status: 'reviewing',
    repeatCount: 2,
    redoHistory: [],
  }, correctRedo)
  const attached = attachVerificationVariant(redone, 'variant-1')
  return recordVariantVerification(attached, {
    variantId: 'variant-1',
    isCorrect: true,
    verifiedAt: '2026-08-07T09:00:00.000Z',
  })
}

describe('applyRedoAttempt', () => {
  test('a correct redo appends complete evidence and schedules verification without granting mastery', () => {
    const item = {
      id: 'error-1',
      status: 'reviewing',
      repeatCount: 2,
      redoHistory: [{ ...wrongRedo, evidence: { source: 'prior' } }],
      verificationVariantId: 'stale-variant',
      variantVerifiedAt: '2026-08-01T09:00:00.000Z',
      variantVerification: {
        variantId: 'stale-variant',
        isCorrect: true,
        verifiedAt: '2026-08-01T09:00:00.000Z',
      },
    }
    const before = structuredClone(item)

    const next = applyRedoAttempt(item, { ...correctRedo, evidence: { source: 'redo-form' } })

    expect(next).toMatchObject({
      id: 'error-1',
      status: 'verification_due',
      repeatCount: 2,
      verificationVariantId: null,
      variantVerifiedAt: null,
      variantVerification: null,
    })
    expect(next.redoHistory).toEqual([
      { ...wrongRedo, evidence: { source: 'prior' } },
      { ...correctRedo, evidence: { source: 'redo-form' } },
    ])
    expect(canMarkMastered(next)).toBe(false)
    expect(item).toEqual(before)

    next.redoHistory[0].evidence.source = 'mutated'
    next.redoHistory[1].evidence.source = 'mutated'
    expect(item).toEqual(before)
  })

  test('a wrong redo increments recurrence, returns to pending review, and clears stale verification', () => {
    const item = verifiedItem()
    const before = structuredClone(item)

    const next = applyRedoAttempt(item, wrongRedo)

    expect(next).toMatchObject({
      status: 'pending_review',
      repeatCount: 3,
      verificationVariantId: null,
      variantVerifiedAt: null,
      variantVerification: null,
    })
    expect(next.redoHistory.at(-1)).toEqual(wrongRedo)
    expect(canMarkMastered(next)).toBe(false)
    expect(item).toEqual(before)
  })

  test('normalizes empty or malformed histories and appends every repeated attempt', () => {
    const malformed = { status: 'reviewing', repeatCount: '2', redoHistory: { isCorrect: true } }
    const first = applyRedoAttempt(malformed, correctRedo)
    const second = applyRedoAttempt(first, correctRedo)

    expect(first.redoHistory).toEqual([correctRedo])
    expect(second.redoHistory).toEqual([correctRedo, correctRedo])
    expect(second.repeatCount).toBe(0)
    expect(malformed.redoHistory).toEqual({ isCorrect: true })
  })

  test.each([
    ['2026-08-06'],
    ['2026-08-06T10:30:00Z'],
    ['2026-08-06T10:30:00.123+08:00'],
  ])('accepts a valid ISO calendar date or RFC3339 timestamp %s', (attemptedAt) => {
    const next = applyRedoAttempt({ status: 'reviewing', redoHistory: [] }, {
      ...correctRedo,
      attemptedAt,
    })

    expect(next.redoHistory.at(-1).attemptedAt).toBe(attemptedAt)
    expect(next.status).toBe('verification_due')
  })

  test.each([
    [null],
    [{}],
    [{ answer: '42', isCorrect: true, timeSpent: 50 }],
    [{ attemptedAt: '2026-08-06', isCorrect: true, timeSpent: 50 }],
    [{ attemptedAt: '2026-08-06', answer: '42', timeSpent: 50 }],
    [{ attemptedAt: '2026-08-06', answer: '42', isCorrect: true }],
    [{ ...correctRedo, attemptedAt: '  ' }],
    [{ ...correctRedo, attemptedAt: '2026-02-29' }],
    [{ ...correctRedo, attemptedAt: '2026-02-30' }],
    [{ ...correctRedo, attemptedAt: '2026-13-01' }],
    [{ ...correctRedo, attemptedAt: '2026-02-30T10:30:00Z' }],
    [{ ...correctRedo, attemptedAt: '2026-08-06T25:30:00Z' }],
    [{ ...correctRedo, attemptedAt: '2026-08-06T10:30:00' }],
    [{ ...correctRedo, attemptedAt: 'yesterday' }],
    [{ ...correctRedo, answer: null }],
    [{ ...correctRedo, isCorrect: 'true' }],
    [{ ...correctRedo, timeSpent: -1 }],
    [{ ...correctRedo, timeSpent: Number.POSITIVE_INFINITY }],
  ])('rejects incomplete redo evidence %# without mutating the card', (attempt) => {
    const item = { status: 'reviewing', repeatCount: 1, redoHistory: [] }
    const before = structuredClone(item)

    expect(() => applyRedoAttempt(item, attempt)).toThrow(TypeError)
    expect(item).toEqual(before)
  })
})

describe('verification lifecycle', () => {
  test('attaches a valid variant only after a correct redo and resets prior verification', () => {
    const due = {
      status: 'verification_due',
      redoHistory: [correctRedo],
      verificationVariantId: 'variant-old',
      variantVerifiedAt: '2026-08-01',
      variantVerification: { variantId: 'variant-old', isCorrect: true, verifiedAt: '2026-08-01' },
    }
    const before = structuredClone(due)

    const attached = attachVerificationVariant(due, '  variant-2  ')

    expect(attached).toMatchObject({
      status: 'verification_due',
      verificationVariantId: 'variant-2',
      variantVerifiedAt: null,
      variantVerification: null,
    })
    expect(canMarkMastered(attached)).toBe(false)
    expect(due).toEqual(before)
  })

  test.each([
    [{ status: 'reviewing', redoHistory: [correctRedo] }, 'variant-1'],
    [{ status: 'verification_due', redoHistory: [wrongRedo] }, 'variant-1'],
    [{ status: 'verification_due', redoHistory: 'malformed' }, 'variant-1'],
    [{ status: 'verification_due', redoHistory: [correctRedo] }, '   '],
  ])('does not attach an ineligible or invalid verification variant %#', (item, variantId) => {
    const before = structuredClone(item)
    expect(attachVerificationVariant(item, variantId)).toEqual(before)
    expect(item).toEqual(before)
  })

  test.each([
    [{}],
    [{ attemptedAt: '2026-08-06', answer: '42', isCorrect: true }],
    [{ attemptedAt: 'not-a-date', answer: '42', isCorrect: true, timeSpent: 50 }],
    [{ ...correctRedo, isCorrect: 'true' }],
  ])('requires a complete correct latest redo before attaching or recording %#', (latestRedo) => {
    const item = {
      status: 'verification_due',
      redoHistory: [correctRedo, latestRedo],
      verificationVariantId: 'variant-1',
      variantVerifiedAt: null,
      variantVerification: null,
    }
    const before = structuredClone(item)
    const verification = {
      variantId: 'variant-1',
      isCorrect: true,
      verifiedAt: '2026-08-07T09:00:00Z',
    }

    expect(attachVerificationVariant(item, 'variant-2')).toEqual(before)
    expect(recordVariantVerification(item, verification)).toEqual(before)
    expect(canMarkMastered({
      ...item,
      variantVerifiedAt: verification.verifiedAt,
      variantVerification: verification,
    })).toBe(false)
    expect(item).toEqual(before)
  })

  test('only a correct matching linked variant permits the guarded mastery transition', () => {
    const item = verifiedItem()

    expect(item).toMatchObject({
      status: 'verification_due',
      verificationVariantId: 'variant-1',
      variantVerifiedAt: '2026-08-07T09:00:00.000Z',
      variantVerification: {
        variantId: 'variant-1',
        isCorrect: true,
        verifiedAt: '2026-08-07T09:00:00.000Z',
      },
    })
    expect(item.status).not.toBe('mastered')
    expect(canMarkMastered(item)).toBe(true)
    expect(canMarkMastered({ ...item, status: 'mastered' })).toBe(true)
  })

  test('accepts date-only verification evidence used by the documented lifecycle', () => {
    const due = attachVerificationVariant(applyRedoAttempt({
      status: 'reviewing',
      repeatCount: 1,
      redoHistory: [],
    }, { ...correctRedo, attemptedAt: '2026-08-06' }), 'variant-1')

    const verified = recordVariantVerification(due, {
      variantId: 'variant-1',
      isCorrect: true,
      verifiedAt: '2026-08-07',
    })

    expect(verified.variantVerifiedAt).toBe('2026-08-07')
    expect(canMarkMastered(verified)).toBe(true)
  })

  test('a mismatched verification result makes no trusted transition', () => {
    const due = attachVerificationVariant(applyRedoAttempt({
      status: 'reviewing',
      repeatCount: 1,
      redoHistory: [],
    }, correctRedo), 'variant-current')
    const before = structuredClone(due)

    const next = recordVariantVerification(due, {
      variantId: 'variant-stale',
      isCorrect: true,
      verifiedAt: '2026-08-07T09:00:00.000Z',
    })

    expect(next).toEqual(before)
    expect(canMarkMastered(next)).toBe(false)
    expect(due).toEqual(before)
  })

  test('a wrong matching verification returns to reviewing and clears trusted verification', () => {
    const item = verifiedItem()
    const before = structuredClone(item)

    const next = recordVariantVerification(item, {
      variantId: 'variant-1',
      isCorrect: false,
      verifiedAt: '2026-08-08T09:00:00.000Z',
    })

    expect(next).toMatchObject({
      status: 'reviewing',
      verificationVariantId: 'variant-1',
      variantVerifiedAt: null,
      variantVerification: {
        variantId: 'variant-1',
        isCorrect: false,
        verifiedAt: '2026-08-08T09:00:00.000Z',
      },
    })
    expect(canMarkMastered(next)).toBe(false)
    expect(item).toEqual(before)
  })

  test.each([
    ['2026-02-30'],
    ['2026-08-07T24:00:00Z'],
    ['2026-08-07T09:00:00'],
    ['tomorrow'],
  ])('does not record an invalid verification timestamp %s', (verifiedAt) => {
    const due = attachVerificationVariant(applyRedoAttempt({
      status: 'reviewing',
      repeatCount: 1,
      redoHistory: [],
    }, correctRedo), 'variant-1')
    const result = { variantId: 'variant-1', isCorrect: true, verifiedAt }
    const beforeItem = structuredClone(due)
    const beforeResult = structuredClone(result)

    expect(recordVariantVerification(due, result)).toEqual(beforeItem)
    expect(due).toEqual(beforeItem)
    expect(result).toEqual(beforeResult)
  })

  test('rejects stale, mismatched, malformed, or invalid-lifecycle evidence as mastery proof', () => {
    const valid = verifiedItem()
    const candidates = [
      { ...valid, status: 'reviewing' },
      { ...valid, redoHistory: [] },
      { ...valid, redoHistory: [{ isCorrect: false }] },
      { ...valid, verificationVariantId: 'variant-new' },
      { ...valid, variantVerifiedAt: '2026-08-08T09:00:00.000Z' },
      { ...valid, variantVerification: { ...valid.variantVerification, variantId: 'variant-stale' } },
      { ...valid, variantVerification: { ...valid.variantVerification, isCorrect: false } },
      { ...valid, variantVerifiedAt: '2026-02-30', variantVerification: { ...valid.variantVerification, verifiedAt: '2026-02-30' } },
      { ...valid, variantVerifiedAt: 'tomorrow', variantVerification: { ...valid.variantVerification, verifiedAt: 'tomorrow' } },
      { ...valid, variantVerification: null },
      null,
    ]

    expect(candidates.map(canMarkMastered)).toEqual(candidates.map(() => false))
  })

  test.each([
    [null],
    [{}],
    [{ variantId: 'variant-1', isCorrect: 'true', verifiedAt: '2026-08-07' }],
    [{ variantId: 'variant-1', isCorrect: true, verifiedAt: '   ' }],
  ])('does not trust malformed verification evidence %#', (result) => {
    const due = attachVerificationVariant(applyRedoAttempt({
      status: 'reviewing',
      repeatCount: 1,
      redoHistory: [],
    }, correctRedo), 'variant-1')
    const before = structuredClone(due)

    expect(recordVariantVerification(due, result)).toEqual(before)
    expect(due).toEqual(before)
  })
})
