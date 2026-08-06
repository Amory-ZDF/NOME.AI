// ============================================================
// NOME.AI Student — HTTP client
// Single swap point between the frontend and a real backend.
//
// Frontend/backend decoupling contract:
//   - The UI never imports mock data directly for reads/writes;
//     every data access goes through src/api endpoint functions.
//   - When VITE_API_BASE_URL is set, all calls go to the real
//     REST API (see API_INTERFACE.md, aligned with PRD §8).
//   - When it is absent (current stage: frontend-only), the same
//     endpoint signatures are served by the local mock adapter,
//     so no UI code changes are needed when the backend lands.
// ============================================================

const BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

export const isMockMode = !BASE_URL

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'NETWORK_ERROR', cause } = {}) {
    super(message, { cause })
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

const hasOwn = (value, key) => value !== null
  && typeof value === 'object'
  && Object.prototype.hasOwnProperty.call(value, key)

async function request(path, options = {}) {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    })
    const status = res.status ?? 0
    if (res.ok && (status === 204 || status === 205)) return null

    let payload
    try {
      payload = await res.json()
    } catch (cause) {
      if (!res.ok) {
        throw new ApiError(`API ${options.method || 'GET'} ${path} failed: ${status}`, {
          status, code: `HTTP_${status}`, cause,
        })
      }
      throw new ApiError('API response was not valid JSON', { status, code: 'INVALID_RESPONSE', cause })
    }

    if (!res.ok || (hasOwn(payload, 'code') && payload.code !== 0)) {
      throw new ApiError(
        payload?.message || `API ${options.method || 'GET'} ${path} failed: ${status}`,
        { status, code: payload?.code ?? `HTTP_${status}`, cause: payload },
      )
    }

    return hasOwn(payload, 'data') ? payload.data : payload
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(error instanceof Error ? error.message : 'Network request failed', { cause: error })
  }
}

export const http = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: (path) => request(path, { method: 'DELETE' }),
}
