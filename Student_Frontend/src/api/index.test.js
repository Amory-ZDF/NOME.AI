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
