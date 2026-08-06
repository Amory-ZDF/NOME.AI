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
    'moduleStats', 'noteFolders', 'notes', 'profileOverview', 'progressTimeline', 'settings', 'student', 'tasks',
  ])
  expect(second.tasks[0].status).toBe('pending')
  expect(JSON.parse(JSON.stringify(second)).student.id).toBe('stu-001')
})
