import { describe, expect, test } from 'vitest'
import { buildAdjustmentRequest, validateAdjustmentDraft } from './adjustmentRules'

const now = new Date('2026-08-06T10:00:00Z')

describe('adjustment rules', () => {
  test('requires a reason and a future proposed date', () => {
    const result = validateAdjustmentDraft({
      reason: '',
      details: '',
      availableMinutes: 20,
      proposedDueAt: '2026-08-05T12:00:00Z',
    }, now)

    expect(result).toEqual({
      valid: false,
      errors: { reason: 'Choose a reason', proposedDueAt: 'Choose a future time' },
    })
  })

  test('rejects an unknown reason', () => {
    expect(validateAdjustmentDraft({
      reason: 'schedule_change',
      details: '',
      availableMinutes: 20,
      proposedDueAt: '2026-08-07T12:00:00Z',
    }, now)).toEqual({ valid: false, errors: { reason: 'Choose a valid reason' } })
  })

  test('builds the exact teacher-facing adjustment payload', () => {
    expect(buildAdjustmentRequest({
      task: { id: 't1' },
      draft: {
        reason: 'time_conflict',
        details: '  Exam revision  ',
        availableMinutes: 20.8,
        proposedDueAt: '2026-08-07T12:00:00Z',
      },
      now,
      id: 'adj-1',
    })).toEqual({
      id: 'adj-1',
      taskId: 't1',
      reason: 'time_conflict',
      details: 'Exam revision',
      availableMinutes: 20,
      proposedDueAt: '2026-08-07T12:00:00.000Z',
      createdAt: '2026-08-06T10:00:00.000Z',
      status: 'submitted',
    })
  })

  test('clamps request availability to the supported daily range', () => {
    const request = buildAdjustmentRequest({
      task: { id: 't1' },
      draft: {
        reason: 'health',
        details: '',
        availableMinutes: 1000,
        proposedDueAt: '2026-08-07T12:00:00Z',
      },
      now,
      id: 'adj-2',
    })

    expect(request.availableMinutes).toBe(720)

    expect(buildAdjustmentRequest({
      task: { id: 't1' },
      draft: {
        reason: 'health',
        details: '',
        availableMinutes: -10,
        proposedDueAt: '2026-08-07T12:00:00Z',
      },
      now,
      id: 'adj-3',
    }).availableMinutes).toBe(0)
  })

  test.each([
    ['null', null],
    ['undefined', undefined],
    ['a non-Date value', '2026-08-06T10:00:00.000Z'],
    ['an invalid Date', new Date(Number.NaN)],
  ])('fails validation closed for %s current time', (_, invalidNow) => {
    expect(validateAdjustmentDraft({
      reason: 'time_conflict',
      details: '',
      availableMinutes: 20,
      proposedDueAt: '2026-08-08T12:00:00Z',
    }, invalidNow)).toEqual({
      valid: false,
      errors: { proposedDueAt: 'Unable to validate current time. Try again.' },
    })
  })

  test.each([
    ['null', null],
    ['undefined', undefined],
    ['a non-Date value', '2026-08-06T10:00:00.000Z'],
    ['an invalid Date', new Date(Number.NaN)],
  ])('rejects request authoring for %s current time', (_, invalidNow) => {
    expect(() => buildAdjustmentRequest({
      task: { id: 't1' },
      draft: {
        reason: 'time_conflict',
        details: '',
        availableMinutes: 20,
        proposedDueAt: '2026-08-08T12:00:00Z',
      },
      now: invalidNow,
      id: 'adj-invalid-clock',
    })).toThrow('Unable to validate current time. Try again.')
  })

  test('rejects request authoring when the proposed time is not after the action clock', () => {
    expect(() => buildAdjustmentRequest({
      task: { id: 't1' },
      draft: {
        reason: 'time_conflict',
        details: '',
        availableMinutes: 20,
        proposedDueAt: '2026-08-05T12:00:00Z',
      },
      now,
      id: 'adj-past',
    })).toThrow('Choose a future time')
  })

  test('uses the Date internal slot instead of poisoned own methods', () => {
    const poisonedNow = new Date(now)
    Object.defineProperties(poisonedNow, {
      getTime: { value: () => { throw new Error('poisoned getTime') } },
      toISOString: { value: () => 'forged-created-at' },
    })
    const draft = {
      reason: 'time_conflict',
      details: '',
      availableMinutes: 20,
      proposedDueAt: '2026-08-08T12:00:00Z',
    }

    expect(validateAdjustmentDraft(draft, poisonedNow)).toEqual({ valid: true, errors: {} })
    expect(buildAdjustmentRequest({ task: { id: 't1' }, draft, now: poisonedNow, id: 'adj-own' }))
      .toMatchObject({ createdAt: '2026-08-06T10:00:00.000Z' })
  })

  test('uses the Date internal slot instead of subclass overrides', () => {
    class ForgedDate extends Date {
      getTime() { throw new Error('subclass getTime') }
      toISOString() { return 'subclass-forged-created-at' }
    }
    const subclassNow = new ForgedDate('2026-08-06T10:00:00.000Z')
    const draft = {
      reason: 'time_conflict',
      details: '',
      availableMinutes: 20,
      proposedDueAt: '2026-08-08T12:00:00Z',
    }

    expect(validateAdjustmentDraft(draft, subclassNow)).toEqual({ valid: true, errors: {} })
    expect(buildAdjustmentRequest({ task: { id: 't1' }, draft, now: subclassNow, id: 'adj-subclass' }))
      .toMatchObject({ createdAt: '2026-08-06T10:00:00.000Z' })
  })

  test.each([
    ['a Proxy around a Date', () => new Proxy(new Date(now), {})],
    ['an object inheriting Date.prototype', () => Object.create(Date.prototype)],
  ])('fails closed for %s without a native Date internal slot', (_, makeNow) => {
    const draft = {
      reason: 'time_conflict',
      details: '',
      availableMinutes: 20,
      proposedDueAt: '2026-08-08T12:00:00Z',
    }
    const brandedLookalike = makeNow()

    expect(validateAdjustmentDraft(draft, brandedLookalike)).toEqual({
      valid: false,
      errors: { proposedDueAt: 'Unable to validate current time. Try again.' },
    })
    expect(() => buildAdjustmentRequest({
      task: { id: 't1' }, draft, now: brandedLookalike, id: 'adj-lookalike',
    })).toThrow('Unable to validate current time. Try again.')
  })

  test('fails proposed-time parsing closed when coercion throws', () => {
    const poisonedDueAt = { [Symbol.toPrimitive]: () => { throw new Error('poisoned due date') } }
    const draft = {
      reason: 'time_conflict',
      details: '',
      availableMinutes: 20,
      proposedDueAt: poisonedDueAt,
    }

    expect(validateAdjustmentDraft(draft, now)).toEqual({
      valid: false,
      errors: { proposedDueAt: 'Choose a future time' },
    })
    expect(() => buildAdjustmentRequest({
      task: { id: 't1' }, draft, now, id: 'adj-poisoned-due',
    })).toThrow('Choose a future time')
  })
})
