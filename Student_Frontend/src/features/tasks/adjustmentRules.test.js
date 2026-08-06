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
})
