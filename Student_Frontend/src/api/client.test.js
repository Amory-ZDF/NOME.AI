import { afterEach, expect, test, vi } from 'vitest'
import { http } from './client'

afterEach(() => vi.unstubAllGlobals())

test('returns data from a successful API envelope', async () => {
  // Catches a client mutation that exposes the backend envelope to UI callers.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ code: 0, message: 'ok', data: { id: 'x' } }),
  }))

  await expect(http.get('/api/example')).resolves.toEqual({ id: 'x' })
})

test('returns null when a successful envelope owns null data', async () => {
  // Catches a client mutation that substitutes the envelope when data is intentionally null.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ code: 0, message: 'ok', data: null }),
  }))

  await expect(http.get('/api/example')).resolves.toBeNull()
})

test('returns a successful non-envelope payload unchanged', async () => {
  // Catches a client mutation that requires all backend responses to use the new envelope.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ id: 'legacy' }),
  }))

  await expect(http.get('/api/example')).resolves.toEqual({ id: 'legacy' })
})

test('throws a typed error for an application failure', async () => {
  // Catches a client mutation that treats a nonzero application code as success or loses its details.
  const payload = { code: 4101, message: 'expired', data: null }
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => payload,
  }))

  await expect(http.get('/api/example')).rejects.toMatchObject({
    name: 'ApiError', status: 200, code: 4101, message: 'expired', cause: payload,
  })
})

test('preserves HTTP response details in a typed error', async () => {
  // Catches a client mutation that flattens a failed HTTP response into a generic error.
  const payload = { code: 'RATE_LIMITED', message: 'Try again later', data: null }
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false,
    status: 429,
    json: async () => payload,
  }))

  await expect(http.post('/api/example', { retry: true })).rejects.toMatchObject({
    name: 'ApiError', status: 429, code: 'RATE_LIMITED', message: 'Try again later', cause: payload,
  })
})

test('wraps network failures while preserving the original cause', async () => {
  // Catches a client mutation that leaks transport exceptions without the public API error contract.
  const networkFailure = new TypeError('Network unavailable')
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(networkFailure))

  await expect(http.del('/api/example')).rejects.toMatchObject({
    name: 'ApiError', status: 0, code: 'NETWORK_ERROR', message: 'Network unavailable', cause: networkFailure,
  })
})

test('preserves HTTP status and code when an error response body is not JSON', async () => {
  // Catches JSON parsing masking the transport status of a non-JSON HTTP failure.
  const parseFailure = new SyntaxError('Unexpected token <')
  const json = vi.fn().mockRejectedValue(parseFailure)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json }))

  await expect(http.get('/api/example')).rejects.toMatchObject({
    name: 'ApiError', status: 500, code: 'HTTP_500', cause: parseFailure,
  })
  expect(json).toHaveBeenCalledTimes(1)
})

test.each([204, 205])('returns null for an empty %s success without parsing a body', async (status) => {
  // Catches empty successful responses being sent through JSON parsing or converted to errors.
  const json = vi.fn()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status, json }))

  await expect(http.del('/api/example')).resolves.toBeNull()
  expect(json).not.toHaveBeenCalled()
})
