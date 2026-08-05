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

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
  if (!res.ok) throw new Error(`API ${options.method || 'GET'} ${path} failed: ${res.status}`)
  return res.json()
}

export const http = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: (path) => request(path, { method: 'DELETE' }),
}
