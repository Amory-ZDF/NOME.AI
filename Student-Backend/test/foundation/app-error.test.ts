import { describe, expect, it } from 'vitest'

import { AppError } from '../../src/common/errors/app-error.js'

describe('AppError', () => {
  it.each([399, 600, 400.5, Number.NaN])('rejects invalid HTTP status %s', (status) => {
    expect(() => new AppError('Invalid status', status, 'INVALID_STATUS')).toThrow(
      'AppError status must be an integer between 400 and 599',
    )
  })

  it.each([
    ['BigInt', 1n],
    ['undefined', undefined],
    ['non-finite number', Number.POSITIVE_INFINITY],
    ['non-plain object', new Date('2026-08-10T00:00:00.000Z')],
    ['nested undefined', { nested: undefined }],
  ])('rejects JSON-unsafe %s data', (_case, data) => {
    expect(() => new AppError('Unsafe data', 400, 'UNSAFE_DATA', data as never)).toThrow(
      'AppError data must be JSON-safe',
    )
  })

  it('rejects cyclic data', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic

    expect(() => new AppError('Unsafe data', 400, 'UNSAFE_DATA', cyclic as never)).toThrow(
      'AppError data must be JSON-safe',
    )
  })

  it('keeps JSON-safe data and a private cause', () => {
    const cause = new Error('private cause')
    const error = new AppError(
      'Public message',
      503,
      'UPSTREAM_UNAVAILABLE',
      { retryable: true, attempts: [1, 2], detail: null },
      { cause },
    )

    expect(error.data).toEqual({ retryable: true, attempts: [1, 2], detail: null })
    expect(error.cause).toBe(cause)
  })
})
