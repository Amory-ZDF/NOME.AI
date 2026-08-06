import { afterEach, expect, test, vi } from 'vitest'
import { createMemoryStorage } from '../test/memoryStorage'
import { createMockRepository, STORAGE_KEY } from './mockRepository'
import { createSeedState } from '../data/mockData'

afterEach(() => vi.useRealTimers())

test('persists an immutable transaction across repository instances', async () => {
  // Catches a production mutation that omits saving an update to storage.
  const storage = createMemoryStorage()
  const first = createMockRepository({ storage, latencyMs: 0, seedFactory: () => ({ tasks: [{ id: 't1', status: 'pending' }] }) })
  await first.update((state) => ({ ...state, tasks: state.tasks.map((task) => ({ ...task, status: 'completed' })) }))
  const second = createMockRepository({ storage, latencyMs: 0, seedFactory: () => ({ tasks: [] }) })
  expect((await second.bootstrap()).tasks[0].status).toBe('completed')
})

test('falls back to seed data when the stored version is incompatible', async () => {
  // Catches a production mutation that accepts envelopes from a different version.
  const storage = createMemoryStorage({ [STORAGE_KEY]: JSON.stringify({ version: 99, data: { tasks: [] } }) })
  const repository = createMockRepository({ storage, latencyMs: 0, seedFactory: () => ({ tasks: [{ id: 'seed' }] }) })
  expect((await repository.bootstrap()).tasks).toEqual([{ id: 'seed' }])
})

test('recovers from corrupt persisted JSON with seed data', async () => {
  // Catches a production mutation that lets JSON parsing errors escape bootstrap.
  const storage = createMemoryStorage({ [STORAGE_KEY]: '{invalid json' })
  const repository = createMockRepository({ storage, latencyMs: 0, seedFactory: () => ({ tasks: [{ id: 'seed' }] }) })

  expect((await repository.bootstrap()).tasks).toEqual([{ id: 'seed' }])
})

test.each([
  ['missing data', { version: 1 }],
  ['null data', { version: 1, data: null }],
  ['string data', { version: 1, data: 'bad' }],
  ['array data', { version: 1, data: [] }],
])('replaces a current-version envelope with %s with seed data', async (_, envelope) => {
  // Catches a production mutation that accepts a versioned envelope without a plain state object.
  const storage = createMemoryStorage({ [STORAGE_KEY]: JSON.stringify(envelope) })
  const repository = createMockRepository({ storage, latencyMs: 0, seedFactory: () => ({ tasks: [{ id: 'seed' }] }) })

  expect(await repository.bootstrap()).toEqual({ tasks: [{ id: 'seed' }] })
  expect(JSON.parse(storage.getItem(STORAGE_KEY))).toEqual({ version: 1, data: { tasks: [{ id: 'seed' }] } })
})

test('returns cloned read results so callers cannot mutate stored state', async () => {
  // Catches a production mutation that returns a reference to persisted state.
  const repository = createMockRepository({ storage: createMemoryStorage(), latencyMs: 0, seedFactory: () => ({ tasks: [{ id: 't1', status: 'pending' }] }) })
  const selected = await repository.read((state) => state.tasks[0])
  selected.status = 'completed'

  expect((await repository.read((state) => state.tasks[0])).status).toBe('pending')
})

test('reset discards the previous transaction and stores a versioned seed envelope', async () => {
  // Catches a production mutation that omits removeItem before bootstrapping again.
  const storage = createMemoryStorage()
  const repository = createMockRepository({ storage, latencyMs: 0, seedFactory: () => ({ tasks: [{ id: 'seed', status: 'pending' }] }) })
  await repository.update((state) => ({ ...state, tasks: [{ id: 'seed', status: 'completed' }] }))

  expect(await repository.reset()).toEqual({ tasks: [{ id: 'seed', status: 'pending' }] })
  expect(JSON.parse(storage.getItem(STORAGE_KEY))).toEqual({ version: 1, data: { tasks: [{ id: 'seed', status: 'pending' }] } })
})

test('reset remains usable when called without repository method binding', async () => {
  // Catches reset delegating through `this.bootstrap`, which breaks when reset is destructured.
  const repository = createMockRepository({
    storage: createMemoryStorage(), latencyMs: 0,
    seedFactory: () => ({ tasks: [{ id: 'seed' }] }),
  })
  const { reset } = repository

  await expect(reset()).resolves.toEqual({ tasks: [{ id: 'seed' }] })
})

test.each([
  ['missing required collections', {}],
  ['a null collection', { ...createSeedState(), tasks: null }],
  ['an id-bearing entity without an id', { ...createSeedState(), tasks: [{ status: 'pending' }] }],
])('repairs persisted state with %s from the complete seed schema', async (_, data) => {
  // Catches current-version but structurally incompatible state reaching page/store consumers.
  const storage = createMemoryStorage({ [STORAGE_KEY]: JSON.stringify({ version: 1, data }) })
  const repository = createMockRepository({ storage, latencyMs: 0, seedFactory: createSeedState })

  const result = await repository.bootstrap()

  expect(result.tasks[0].id).toBe('t-overdue')
  expect(result.settings).toMatchObject({ dailyGoalHours: 4 })
})

test.each([
  ['an object without a sessionId', [{}]],
  ['a null session', [null]],
  ['a blank sessionId', [{ sessionId: ' ' }]],
])('repairs persisted sessions containing %s even though the seed collection is empty', async (_, sessions) => {
  // Catches identifier validation being inferred only from nonempty seed samples.
  const storage = createMemoryStorage({
    [STORAGE_KEY]: JSON.stringify({ version: 1, data: { ...createSeedState(), sessions } }),
  })
  const repository = createMockRepository({ storage, latencyMs: 0, seedFactory: createSeedState })

  expect((await repository.bootstrap()).sessions).toEqual([])
  expect(JSON.parse(storage.getItem(STORAGE_KEY)).data.sessions).toEqual([])
})

test('repairs persisted adjustment requests without stable identifiers', async () => {
  // Catches task-adjustment schema validation being skipped because its seed collection is empty.
  const storage = createMemoryStorage({
    [STORAGE_KEY]: JSON.stringify({ version: 1, data: { ...createSeedState(), taskAdjustments: [{ taskId: 't1' }] } }),
  })
  const repository = createMockRepository({ storage, latencyMs: 0, seedFactory: createSeedState })

  expect((await repository.bootstrap()).taskAdjustments).toEqual([])
  expect(JSON.parse(storage.getItem(STORAGE_KEY)).data.taskAdjustments).toEqual([])
})

test('migrates legacy v1 state without task adjustments while preserving user changes', async () => {
  const legacy = createSeedState()
  delete legacy.taskAdjustments
  legacy.tasks = legacy.tasks.map((task) => (task.id === 't1' ? { ...task, status: 'completed' } : task))
  legacy.notes = legacy.notes.map((note) => (note.id === 'n1' ? { ...note, title: 'My edited note' } : note))
  legacy.sessions = [{ sessionId: 'legacy-session' }]
  legacy.settings = { ...legacy.settings, tone: 88 }
  const storage = createMemoryStorage({
    [STORAGE_KEY]: JSON.stringify({ version: 1, data: legacy }),
  })
  const repository = createMockRepository({ storage, latencyMs: 0, seedFactory: createSeedState })

  const migrated = await repository.bootstrap()

  expect(migrated.tasks.find((task) => task.id === 't1')).toMatchObject({ status: 'completed' })
  expect(migrated.notes.find((note) => note.id === 'n1')).toMatchObject({ title: 'My edited note' })
  expect(migrated.sessions).toEqual([{ sessionId: 'legacy-session' }])
  expect(migrated.settings).toMatchObject({ tone: 88 })
  expect(migrated.taskAdjustments).toEqual([])
  expect(JSON.parse(storage.getItem(STORAGE_KEY)).data).toMatchObject({
    sessions: [{ sessionId: 'legacy-session' }],
    taskAdjustments: [],
  })
})

test('honors configured latency before resolving repository calls', async () => {
  // Catches a production mutation that removes the asynchronous latency boundary.
  vi.useFakeTimers()
  const repository = createMockRepository({ storage: createMemoryStorage(), latencyMs: 25, seedFactory: () => ({ tasks: [] }) })
  let settled = false
  const operation = repository.bootstrap().then(() => { settled = true })

  await vi.advanceTimersByTimeAsync(24)
  expect(settled).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  await operation
  expect(settled).toBe(true)
})

test('creates independent serializable seed snapshots with every frontend collection', () => {
  // Catches a production mutation that omits a collection or shares mutable seed references.
  const first = createSeedState()
  first.tasks[0].status = 'completed'
  const second = createSeedState()

  expect(Object.keys(second).sort()).toEqual([
    'achievements', 'bankExerciseSets', 'bankQuestions', 'bankRecommendations', 'errorPatternData',
    'errorTypeMeta', 'errors', 'exerciseSets', 'greeting', 'knowledgeGraphData', 'learningSummary',
    'moduleStats', 'noteFolders', 'notes', 'profileOverview', 'progressTimeline', 'sessions', 'settings', 'student', 'taskAdjustments', 'tasks',
  ])
  expect(second.tasks[0].status).toBe('pending')
  expect(JSON.parse(JSON.stringify(second)).student.id).toBe('stu-001')
})
