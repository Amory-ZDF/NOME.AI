# Student Module 0 — Test and State Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic automated testing, a persistent mock repository, normalized API failures, and observable async store state without changing the existing student layout.

**Architecture:** Tests run in Vitest/jsdom with React Testing Library. Mock mode reads and writes one versioned repository; real mode continues through the HTTP adapter. `AppStore` exposes loading, failure, and pending-action state while existing pages retain their markup.

**Tech Stack:** React 18.3.1, Vite 5.4.x, Vitest, React Testing Library, user-event, jsdom, localStorage.

## Global Constraints

- Modify only `Student_Frontend/`, `docs/superpowers/`, and the repository root lockfile created by npm.
- Preserve current routes, TopNav, Tailwind tokens, English UI copy, card density, and responsive layout.
- Do not add direct `mockData.js` imports to pages or components.
- Mock and real API modes must expose the same Promise-based signatures.
- Every behavior change starts with a failing test and ends with targeted tests, the full suite, `npm run build`, and a Playwright CLI smoke check.
- Commit each reviewable task locally; push `main` only after all Module 0 checks pass.

---

### Task 1: Install and configure the test harness

**Files:**
- Modify: `Student_Frontend/package.json`
- Modify: `Student_Frontend/vite.config.js`
- Modify: `Student_Frontend/index.html`
- Create: `Student_Frontend/public/favicon.svg`
- Create: `Student_Frontend/src/test/setup.js`
- Create: `Student_Frontend/src/test/renderApp.jsx`
- Create: `Student_Frontend/src/test/memoryStorage.js`
- Create: `Student_Frontend/src/App.smoke.test.jsx`
- Create: `Student_Frontend/package-lock.json` through `npm install`

**Interfaces:**
- Produces: `renderStudentApp(ui, { route })` for component tests.
- Produces: `createMemoryStorage(initial)` implementing the Storage methods used by the repository.
- Produces: npm scripts `test` and `test:watch`.

- [ ] **Step 1: Add exact test scripts and dependencies**

Set the scripts and dev dependencies to include:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@testing-library/user-event": "^14.5.2",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.19",
    "jsdom": "^25.0.1",
    "postcss": "^8.4.40",
    "tailwindcss": "^3.4.10",
    "vite": "^5.4.0",
    "vitest": "^2.1.9"
  }
}
```

- [ ] **Step 2: Configure Vitest and deterministic setup**

Extend `vite.config.js` with:

```js
test: {
  environment: 'jsdom',
  setupFiles: './src/test/setup.js',
  clearMocks: true,
  restoreMocks: true,
},
```

Create `src/test/setup.js`:

```js
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})
```

- [ ] **Step 3: Add the reusable render and storage helpers**

```jsx
// src/test/renderApp.jsx
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

export function renderStudentApp(ui, { route = '/' } = {}) {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>)
}
```

```js
// src/test/memoryStorage.js
export function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.has(key) ? values.get(key) : null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  }
}
```

- [ ] **Step 4: Add a baseline route smoke test**

```jsx
import { screen } from '@testing-library/react'
import App from './App'
import { renderStudentApp } from './test/renderApp'

test('renders the existing student home without changing navigation', async () => {
  renderStudentApp(<App />)
  expect(await screen.findByRole('heading', { name: /Good morning/i })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Tasks' })).toHaveAttribute('href', '/student/tasks')
})
```

- [ ] **Step 5: Add a real favicon to remove the known console 404**

Create a teal `public/favicon.svg` containing a white `N`, then add this exact line inside `<head>`:

```html
<link rel="icon" type="image/svg+xml" href="/student/favicon.svg" />
```

- [ ] **Step 6: Install and run the harness**

Run: `npm install`

Run: `npm test -- --run src/App.smoke.test.jsx`

Expected: one passing smoke test and no unhandled promise rejection.

- [ ] **Step 7: Commit the harness**

```bash
git add Student_Frontend/package.json Student_Frontend/package-lock.json Student_Frontend/vite.config.js Student_Frontend/index.html Student_Frontend/public/favicon.svg Student_Frontend/src/test Student_Frontend/src/App.smoke.test.jsx
git commit -m "test(student): add deterministic frontend harness"
```

### Task 2: Add the versioned persistent mock repository

**Files:**
- Create: `Student_Frontend/src/api/mockRepository.js`
- Create: `Student_Frontend/src/api/mockRepository.test.js`
- Modify: `Student_Frontend/src/data/mockData.js`

**Interfaces:**
- Produces: `createSeedState()` returning every frontend collection in one serializable object.
- Produces: `createMockRepository({ storage, latencyMs, seedFactory })`.
- Produces repository methods: `bootstrap()`, `read(selector)`, `update(recipe)`, and `reset()`.
- Repository key: `nome-ai.student-state.v1`; stored envelope: `{ version: 1, data }`.

- [ ] **Step 1: Write failing persistence and migration tests**

```js
import { createMemoryStorage } from '../test/memoryStorage'
import { createMockRepository, STORAGE_KEY } from './mockRepository'

test('persists an immutable transaction across repository instances', async () => {
  const storage = createMemoryStorage()
  const first = createMockRepository({ storage, latencyMs: 0, seedFactory: () => ({ tasks: [{ id: 't1', status: 'pending' }] }) })
  await first.update((state) => ({ ...state, tasks: state.tasks.map((task) => ({ ...task, status: 'completed' })) }))
  const second = createMockRepository({ storage, latencyMs: 0, seedFactory: () => ({ tasks: [] }) })
  expect((await second.bootstrap()).tasks[0].status).toBe('completed')
})

test('falls back to seed data when the stored version is incompatible', async () => {
  const storage = createMemoryStorage({ [STORAGE_KEY]: JSON.stringify({ version: 99, data: { tasks: [] } }) })
  const repository = createMockRepository({ storage, latencyMs: 0, seedFactory: () => ({ tasks: [{ id: 'seed' }] }) })
  expect((await repository.bootstrap()).tasks).toEqual([{ id: 'seed' }])
})
```

- [ ] **Step 2: Run the repository tests to verify failure**

Run: `npm test -- --run src/api/mockRepository.test.js`

Expected: FAIL because `mockRepository.js` does not exist.

- [ ] **Step 3: Implement cloning, version validation, latency, and reset**

```js
export const STORAGE_KEY = 'nome-ai.student-state.v1'
export const STORAGE_VERSION = 1
const clone = (value) => structuredClone(value)

export function createMockRepository({ storage = window.localStorage, latencyMs = 60, seedFactory }) {
  const wait = () => new Promise((resolve) => setTimeout(resolve, latencyMs))
  const load = () => {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return seedFactory()
    try {
      const envelope = JSON.parse(raw)
      return envelope.version === STORAGE_VERSION ? envelope.data : seedFactory()
    } catch {
      return seedFactory()
    }
  }
  const save = (data) => storage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, data }))

  const bootstrap = async () => { await wait(); const data = load(); save(data); return clone(data) }
  return {
    bootstrap,
    async read(selector) { await wait(); return clone(selector(load())) },
    async update(recipe) { await wait(); const next = recipe(clone(load())); save(next); return clone(next) },
    async reset() { storage.removeItem(STORAGE_KEY); return bootstrap() },
  }
}
```

Move only seed assembly into `createSeedState()` in `mockData.js`; retain all existing named exports so current pages keep working until their module migration.

- [ ] **Step 4: Run targeted tests**

Run: `npm test -- --run src/api/mockRepository.test.js`

Expected: both tests PASS.

- [ ] **Step 5: Commit the repository**

```bash
git add Student_Frontend/src/api/mockRepository.js Student_Frontend/src/api/mockRepository.test.js Student_Frontend/src/data/mockData.js
git commit -m "feat(student): persist mock application state"
```

### Task 3: Normalize HTTP and mock API behavior

**Files:**
- Modify: `Student_Frontend/src/api/client.js`
- Modify: `Student_Frontend/src/api/index.js`
- Create: `Student_Frontend/src/api/client.test.js`
- Create: `Student_Frontend/src/api/index.test.js`

**Interfaces:**
- Produces: `ApiError` with `status`, `code`, `message`, and `cause`.
- `http.get/post/patch/del` resolve the response `data`, not the envelope.
- Mock write endpoints persist changes through the singleton repository and resolve the same payload shape as real mode.
- Produces: `resetMockState()` for deterministic tests and manual demo resets.

- [ ] **Step 1: Write failing response-envelope and error tests**

```js
test('returns data from a successful API envelope', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ code: 0, message: 'ok', data: { id: 'x' } }) }))
  await expect(http.get('/api/example')).resolves.toEqual({ id: 'x' })
})

test('throws a typed error for an application failure', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ code: 4101, message: 'expired', data: null }) }))
  await expect(http.get('/api/example')).rejects.toMatchObject({ name: 'ApiError', code: 4101, message: 'expired' })
})
```

- [ ] **Step 2: Run the client test to verify failure**

Run: `npm test -- --run src/api/client.test.js`

Expected: FAIL because the current client returns the full envelope and throws a generic Error.

- [ ] **Step 3: Implement `ApiError` and envelope unwrapping**

```js
export class ApiError extends Error {
  constructor(message, { status = 0, code = 'NETWORK_ERROR', cause } = {}) {
    super(message, { cause })
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}
```

The request function must parse JSON once, throw `ApiError` when `!res.ok` or `payload.code !== 0`, and otherwise return `payload.data ?? payload` so a backend that has not adopted the envelope remains usable.

- [ ] **Step 4: Route current mock endpoints through the repository**

Create one singleton with `seedFactory: createSeedState`. Implement `bootstrap`, task writes, error writes, note writes, session writes, and settings writes by calling `repository.update`. Return concrete results such as `{ task }`, `{ errors }`, `{ note }`, `{ sessionId }`, and `{ settings }`.

- [ ] **Step 5: Test repository-backed API writes**

```js
test('completeTask survives a fresh bootstrap', async () => {
  await resetMockState()
  await completeTask('t1')
  const data = await bootstrap()
  expect(data.tasks.find((task) => task.id === 't1').status).toBe('completed')
})
```

Run: `npm test -- --run src/api/client.test.js src/api/index.test.js`

Expected: all API tests PASS.

- [ ] **Step 6: Commit the API adapter**

```bash
git add Student_Frontend/src/api/client.js Student_Frontend/src/api/client.test.js Student_Frontend/src/api/index.js Student_Frontend/src/api/index.test.js
git commit -m "feat(student): normalize persistent API adapter"
```

### Task 4: Make store boot and writes observable and recoverable

**Files:**
- Create: `Student_Frontend/src/store/services.js`
- Create: `Student_Frontend/src/store/services.test.js`
- Create: `Student_Frontend/src/store/actionRunner.js`
- Create: `Student_Frontend/src/store/actionRunner.test.js`
- Modify: `Student_Frontend/src/store/AppStore.jsx`
- Create: `Student_Frontend/src/store/AppStore.test.jsx`
- Modify: `Student_Frontend/src/App.jsx`

**Interfaces:**
- Produces: `runRecoverableAction({ key, snapshot, optimistic, request, commit, rollback, onError })`.
- App context adds `bootStatus`, `bootError`, `pendingActions`, `retryBootstrap()`, and `isActionPending(key)`.
- Existing action names remain available; each returns its Promise.
- Produces: `createAppServices({ apiClient, now, createId })`; `App` and `AppProvider` accept an optional `services` prop for deterministic tests.

- [ ] **Step 1: Write failing rollback tests for the action runner**

```js
test('rolls back optimistic state and reports a typed failure', async () => {
  const calls = []
  await expect(runRecoverableAction({
    snapshot: ['before'],
    optimistic: () => calls.push('optimistic'),
    request: () => Promise.reject(new Error('offline')),
    commit: () => calls.push('commit'),
    rollback: (snapshot) => calls.push(snapshot[0]),
    onError: (error) => calls.push(error.message),
  })).rejects.toThrow('offline')
  expect(calls).toEqual(['optimistic', 'before', 'offline'])
})
```

- [ ] **Step 2: Run the test to verify failure**

Run: `npm test -- --run src/store/actionRunner.test.js`

Expected: FAIL because `runRecoverableAction` is undefined.

- [ ] **Step 3: Implement the action runner and integrate it into AppStore**

```js
export async function runRecoverableAction({ snapshot, optimistic, request, commit, rollback, onError }) {
  optimistic()
  try {
    const result = await request()
    commit(result)
    return result
  } catch (error) {
    rollback(snapshot)
    onError(error)
    throw error
  }
}
```

Create deterministic default services:

```js
import * as api from '../api'

export const createAppServices = ({
  apiClient = api,
  now = () => new Date(),
  createId = () => crypto.randomUUID(),
} = {}) => ({ api: apiClient, now, createId })

export const defaultAppServices = createAppServices()
```

Initialize `bootStatus` as `loading`; set `ready` only after bootstrap resolves; set `error` and retain the exception when bootstrap rejects. Track action keys in a Set and remove them in `finally`. All timestamps and ids must come from `services.now()` and `services.createId()`. Do not render a blank page: `App.jsx` must show the existing shell with a centered retry card while boot is in `error`.

- [ ] **Step 4: Add provider tests for boot success, boot failure, retry, and duplicate-action state**

Mock `../api` and render a probe component that prints `bootStatus` and invokes `retryBootstrap`. Assert `loading → ready`, `loading → error`, and `error → ready` after retry.

Run: `npm test -- --run src/store/AppStore.test.jsx src/App.smoke.test.jsx`

Expected: provider tests and baseline smoke test PASS.

- [ ] **Step 5: Commit the store foundation**

```bash
git add Student_Frontend/src/store/services.js Student_Frontend/src/store/services.test.js Student_Frontend/src/store/actionRunner.js Student_Frontend/src/store/actionRunner.test.js Student_Frontend/src/store/AppStore.jsx Student_Frontend/src/store/AppStore.test.jsx Student_Frontend/src/App.jsx Student_Frontend/src/App.smoke.test.jsx
git commit -m "feat(student): add recoverable async store state"
```

### Task 5: Verify, commit any documentation alignment, and push Module 0

**Files:**
- Modify: `Student_Frontend/README.md`
- Modify: `Student_Frontend/API_INTERFACE.md`

**Interfaces:**
- Produces a clean, pushed Module 0 baseline consumed by all later plans.

- [ ] **Step 1: Update run instructions and mock persistence notes**

Document `npm test`, `npm run test:watch`, the versioned local key, and the exported `resetMockState()` test helper. Keep endpoint semantics unchanged in `API_INTERFACE.md`.

- [ ] **Step 2: Run the complete automated gate**

Run: `npm test -- --run`

Expected: every test PASS.

Run: `npm run build`

Expected: Vite production build succeeds.

- [ ] **Step 3: Run browser smoke and visual checks**

Start: `npm run dev -- --host 127.0.0.1 --port 4173`

Using Playwright CLI, open `/student/`, `/student/tasks`, `/student/notes`, `/student/bank`, and `/student/profile`. Confirm each page heading is present, navigation works, and `console error` returns zero errors including no favicon 404. Compare the Home and Tasks layouts with the Module 0 baseline screenshot; spacing and structure must remain unchanged.

- [ ] **Step 4: Commit documentation updates**

```bash
git add Student_Frontend/README.md Student_Frontend/API_INTERFACE.md
git commit -m "docs(student): document test and mock state foundation"
```

- [ ] **Step 5: Confirm scope and push**

Run: `git status --short`

Expected: no output.

Run: `git log --oneline origin/main..HEAD`

Expected: only the approved design commit and Module 0 commits.

Run: `git push origin main`

Expected: remote `main` advances to the Module 0 tip. Do not start Module 1 until the push succeeds.
