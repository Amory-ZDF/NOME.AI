import { afterEach, expect, test } from 'vitest'
import {
  addErrors,
  bootstrap,
  completeTask,
  createNote,
  createTask,
  markErrorMastered,
  reportTaskAdjustment,
  resetMockState,
  submitRedo,
  submitSession,
  updateNote,
  updateSettings,
} from './index'

afterEach(async () => {
  await resetMockState()
})

test('completeTask survives a fresh bootstrap', async () => {
  // Catches a mock adapter mutation that acknowledges completion without storing it.
  await resetMockState()
  await completeTask('t1')

  const data = await bootstrap()
  expect(data.tasks.find((task) => task.id === 't1').status).toBe('completed')
})

test('createTask returns and persists the created task', async () => {
  // Catches a mock adapter mutation that returns success without adding a task to repository state.
  await resetMockState()
  const task = { id: 't-new', title: 'New task', status: 'pending' }

  await expect(createTask(task)).resolves.toEqual({ task })
  await expect(bootstrap()).resolves.toMatchObject({ tasks: expect.arrayContaining([task]) })
})

test('reportTaskAdjustment persists the task adjustment status', async () => {
  // Catches a mock adapter mutation that drops adjustment requests after acknowledging them.
  await resetMockState()

  await expect(reportTaskAdjustment('t1')).resolves.toMatchObject({
    task: { id: 't1', status: 'adjustment_requested' },
  })
  await expect(bootstrap()).resolves.toMatchObject({
    tasks: expect.arrayContaining([expect.objectContaining({ id: 't1', status: 'adjustment_requested' })]),
  })
})

test('addErrors returns and persists the submitted errors', async () => {
  // Catches a mock adapter mutation that accepts error writes without recording them.
  await resetMockState()
  const items = [{ id: 'e-new', questionId: 'q-new', status: 'pending_review', redoHistory: [] }]

  await expect(addErrors(items)).resolves.toEqual({ errors: items })
  await expect(bootstrap()).resolves.toMatchObject({ errors: expect.arrayContaining(items) })
})

test('markErrorMastered persists the new error status', async () => {
  // Catches a mock adapter mutation that acknowledges mastering without changing stored status.
  await resetMockState()

  await expect(markErrorMastered('e1')).resolves.toMatchObject({ error: { id: 'e1', status: 'mastered' } })
  await expect(bootstrap()).resolves.toMatchObject({
    errors: expect.arrayContaining([expect.objectContaining({ id: 'e1', status: 'mastered' })]),
  })
})

test('submitRedo persists redo history and error review state', async () => {
  // Catches a mock adapter mutation that loses a redo attempt between requests.
  await resetMockState()
  const attempt = { attemptedAt: '2026-08-06', answer: '0', isCorrect: false, timeSpent: 30 }

  await expect(submitRedo('e1', attempt)).resolves.toMatchObject({
    error: expect.objectContaining({ id: 'e1', redoHistory: expect.arrayContaining([attempt]), repeatCount: 3, status: 'pending_review' }),
  })
  await expect(bootstrap()).resolves.toMatchObject({
    errors: expect.arrayContaining([expect.objectContaining({ id: 'e1', redoHistory: expect.arrayContaining([attempt]) })]),
  })
})

test('createNote returns and persists the note', async () => {
  // Catches a mock adapter mutation that reports a note ID without saving the note.
  await resetMockState()
  const note = { id: 'n-new', title: 'New note', tags: [], content: [], updatedAt: '2026-08-06' }

  await expect(createNote(note)).resolves.toEqual({ note })
  await expect(bootstrap()).resolves.toMatchObject({ notes: expect.arrayContaining([note]) })
})

test('updateNote returns and persists the note patch', async () => {
  // Catches a mock adapter mutation that drops note edits after returning success.
  await resetMockState()

  await expect(updateNote('n1', { title: 'Edited title' })).resolves.toMatchObject({
    note: { id: 'n1', title: 'Edited title' },
  })
  await expect(bootstrap()).resolves.toMatchObject({
    notes: expect.arrayContaining([expect.objectContaining({ id: 'n1', title: 'Edited title' })]),
  })
})

test('submitSession returns an ID and persists the session', async () => {
  // Catches a mock adapter mutation that reports a session ID but loses the session record.
  await resetMockState()
  const session = { sessionId: 's-new', score: 88 }

  await expect(submitSession(session)).resolves.toEqual({ sessionId: 's-new' })
  await expect(bootstrap()).resolves.toMatchObject({ sessions: [session] })
})

test('updateSettings returns and persists the merged settings', async () => {
  // Catches a mock adapter mutation that acknowledges settings changes without merging them into storage.
  await resetMockState()

  await expect(updateSettings({ tone: 80 })).resolves.toMatchObject({ settings: { tone: 80, dailyGoalHours: 4 } })
  await expect(bootstrap()).resolves.toMatchObject({ settings: { tone: 80, dailyGoalHours: 4 } })
})

test.each([
  ['task updater', () => completeTask('missing')],
  ['error updater', () => markErrorMastered('missing')],
  ['note updater', () => updateNote('missing', { title: 'No target' })],
])('%s rejects an unknown target with a typed not-found error', async (_, command) => {
  // Catches mock update commands silently resolving `{ entity: undefined }` for missing IDs.
  await resetMockState()

  await expect(command()).rejects.toMatchObject({
    name: 'ApiError', status: 404, code: 'NOT_FOUND',
  })
})

test('createTask rejects invalid and duplicate entities without changing stored tasks', async () => {
  // Catches mock creates accepting missing IDs or appending an existing entity twice.
  await resetMockState()
  const before = (await bootstrap()).tasks

  await expect(createTask({ title: 'Missing id' })).rejects.toMatchObject({ name: 'ApiError', code: 'INVALID_INPUT' })
  await expect(createTask({ ...before[0] })).rejects.toMatchObject({ name: 'ApiError', code: 'DUPLICATE_ID' })
  await expect(bootstrap()).resolves.toMatchObject({ tasks: before })
})

test('createNote and submitSession reject duplicate or invalid entities', async () => {
  // Catches non-task creator families accepting duplicate IDs or malformed payloads.
  await resetMockState()
  await expect(createNote({ title: 'Missing id' })).rejects.toMatchObject({ name: 'ApiError', code: 'INVALID_INPUT' })
  await expect(createNote({ id: 'n1', title: 'Duplicate' })).rejects.toMatchObject({ name: 'ApiError', code: 'DUPLICATE_ID' })
  await expect(submitSession({ score: 10 })).rejects.toMatchObject({ name: 'ApiError', code: 'INVALID_INPUT' })

  const session = { sessionId: 's-duplicate', questions: [] }
  await submitSession(session)
  await expect(submitSession(session)).rejects.toMatchObject({ name: 'ApiError', code: 'DUPLICATE_ID' })
})

test('addErrors deduplicates a submitted batch and persisted question IDs', async () => {
  // Catches batch duplicates being added twice or persisted dedupe returning a phantom success.
  await resetMockState()
  const first = { id: 'e-batch-1', questionId: 'q-batch', redoHistory: [] }
  const duplicate = { id: 'e-batch-2', questionId: 'q-batch', redoHistory: [] }

  await expect(addErrors([first, duplicate])).resolves.toEqual({ errors: [first] })
  await expect(addErrors([{ ...duplicate, id: 'e-batch-3' }])).resolves.toEqual({ errors: [] })
  expect((await bootstrap()).errors.filter((error) => error.questionId === 'q-batch')).toEqual([first])
})

test('addErrors rejects malformed items with a typed error', async () => {
  // Catches malformed batch entities reaching repository state and later crashing consumers.
  await resetMockState()

  await expect(addErrors([{ id: '', questionId: 'q-bad' }])).rejects.toMatchObject({
    name: 'ApiError', code: 'INVALID_INPUT',
  })
})

test('addErrors rejects duplicate entity IDs without changing persisted errors', async () => {
  // Catches distinct questions sharing an entity ID and corrupting the seed-derived ID invariant.
  await resetMockState()
  const before = (await bootstrap()).errors

  await expect(addErrors([
    { id: 'e-shared', questionId: 'q-one' },
    { id: 'e-shared', questionId: 'q-two' },
  ])).rejects.toMatchObject({ name: 'ApiError', code: 'DUPLICATE_ID' })
  await expect(addErrors([{ id: before[0].id, questionId: 'q-new-id-collision' }])).rejects.toMatchObject({
    name: 'ApiError', code: 'DUPLICATE_ID',
  })
  expect((await bootstrap()).errors).toEqual(before)
})
