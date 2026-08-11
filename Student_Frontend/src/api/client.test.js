import { afterEach, expect, test, vi } from 'vitest'
import { ApiError, http } from './client'

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

test.each([
  ['get', ['/api/example'], 'GET', undefined],
  ['post', ['/api/example', { value: 1 }], 'POST', JSON.stringify({ value: 1 })],
  ['patch', ['/api/example', { value: 1 }], 'PATCH', JSON.stringify({ value: 1 })],
  ['del', ['/api/example'], 'DELETE', undefined],
])('merges safe request init for http.%s without allowing method or body overrides', async (method, args, expectedMethod, expectedBody) => {
  // Catches AbortSignal being dropped or callers replacing the endpoint method/body through request init.
  const controller = new AbortController()
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ code: 0, data: { ok: true } }),
  })
  vi.stubGlobal('fetch', fetchMock)
  const init = {
    signal: controller.signal,
    headers: { Authorization: 'Bearer test', 'Content-Type': 'text/plain' },
    method: 'TRACE',
    body: 'unsafe override',
  }

  await http[method](...args, init)

  const [, requestInit] = fetchMock.mock.calls[0]
  expect(requestInit).toMatchObject({
    method: expectedMethod,
    signal: controller.signal,
    headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
  })
  if (expectedBody === undefined) expect(requestInit).not.toHaveProperty('body')
  else expect(requestInit.body).toBe(expectedBody)
})

test('exposes failed response data on ApiError for strict endpoint-level sanitization', async () => {
  // Catches real processing failures losing the durable failed job envelope before the API adapter sees it.
  const data = { job: { id: 'job-1', status: 'failed' } }
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false,
    status: 422,
    json: async () => ({ code: 'PROCESSING_FAILED', message: 'Processing failed', data }),
  }))

  const error = await http.post('/api/material-uploads/job-1/process').catch((caught) => caught)
  expect(error).toBeInstanceOf(ApiError)
  expect(error).toMatchObject({ code: 'PROCESSING_FAILED', status: 422, data })
})

test('preserves fetch AbortError instead of wrapping it as a network ApiError', async () => {
  // Catches callers being unable to distinguish intentional cancellation from a transport failure.
  const abortError = new DOMException('The operation was aborted.', 'AbortError')
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError))

  await expect(http.get('/api/example', { signal: new AbortController().signal })).rejects.toBe(abortError)
})
