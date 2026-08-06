import { afterEach, expect, test, vi } from 'vitest'
import {
  addErrors,
  bootstrap,
  completeTask,
  createNote,
  createTask,
  generateVariant,
  getBankExerciseSet,
  getExerciseSet,
  markErrorMastered,
  reportTaskAdjustment,
  resetMockState,
  submitRedo,
  submitSession,
  updateNote,
  updateSettings,
} from './index'
import { isCompleteVariantResult } from '../features/exercise/exerciseContracts'

const makeTask = (overrides = {}) => ({
  id: 't-new', title: 'New task', type: 'ai_recommended', subject: 'A-Level Math',
  estimatedMinutes: 15, dueAt: null, assignedBy: null, priority: 'P2',
  isOverdue: false, status: 'pending', ...overrides,
})

const makeAdjustmentRequest = (overrides = {}) => ({
  id: 'adj-1', taskId: 't1', reason: 'difficulty', details: '', availableMinutes: 20,
  proposedDueAt: '2026-08-08T10:00:00Z', createdAt: '2026-08-06T10:00:00Z', status: 'submitted',
  ...overrides,
})

const makeNote = (overrides = {}) => ({
  id: 'n-new', title: 'New note', folderId: 'f-math', folderPath: 'A-Level Math',
  tags: [], linkedTopics: [], linkedErrors: [], source: 'typed',
  createdAt: '2026-08-06', updatedAt: '2026-08-06',
  content: [{ t: 'p', v: 'New content' }], aiSuggestions: [], ...overrides,
})

const makeError = (overrides = {}) => ({
  id: 'e-new', questionId: 'q-new', subject: 'A-Level Math', errorType: 'calculation',
  questionSummary: 'Differentiate f(x)', questionContent: '<p>Differentiate f(x)</p>',
  errorDescription: 'Sign error', relatedTopic: 'Differentiation', topicId: 'calculus-deriv',
  firstOccurredAt: '2026-08-06', lastOccurredAt: '2026-08-06', repeatCount: 1,
  status: 'pending_review', studentAnswer: 'x', correctAnswer: '2x', analysis: 'Check signs',
  acceptKeywords: ['2x'], redoHistory: [], ...overrides,
})

const makeSessionQuestion = (overrides = {}) => ({
  id: 'q-session', order: 1, type: 'choice', topic: 'Algebra', difficulty: 2,
  content: '<p>Choose B</p>', options: ['A', 'B'], correctIndex: 1,
  acceptKeywords: ['B'], correctDisplay: 'B', errorType: 'knowledge',
  hints: [{ level: 1, title: 'Read', content: 'Check each option' }],
  result: {
    status: 'correct',
    attempts: [{ answer: 'B', submittedAt: '2026-08-06T12:00:00.000Z', isCorrect: true }],
    hintsUsed: 0,
    solvedAtHintLevel: 0,
    handwritingUsed: true,
  },
  ...overrides,
})

const makeSession = (overrides = {}) => ({
  sessionId: 's-new', taskId: null, taskTitle: 'Independent practice', subject: 'A-Level Math',
  completedAt: '2026-08-06T12:00:00.000Z', timeSpent: 1, timeSpentSeconds: 30,
  questions: [makeSessionQuestion()], ...overrides,
})

afterEach(async () => {
  await resetMockState()
})

test('completeTask survives a fresh bootstrap', async () => {
  // Catches a mock adapter mutation that acknowledges completion without storing it.
  await resetMockState()
  const { task } = await completeTask('t1')

  const data = await bootstrap()
  expect(task).toMatchObject({ id: 't1', status: 'completed', isOverdue: false })
  expect(task.completedAt).toEqual(expect.any(String))
  expect(data.tasks.find((storedTask) => storedTask.id === 't1')).toMatchObject({
    status: 'completed', completedAt: task.completedAt, isOverdue: false,
  })
})

test('createTask returns and persists the created task', async () => {
  // Catches a mock adapter mutation that returns success without adding a task to repository state.
  await resetMockState()
  const task = makeTask()

  await expect(createTask(task)).resolves.toEqual({ task })
  await expect(bootstrap()).resolves.toMatchObject({ tasks: expect.arrayContaining([task]) })
})

test('an adjustment request keeps the task pending and persists the submitted request', async () => {
  // Catches a mock adapter mutation that drops the request or removes/completes the assigned task.
  await resetMockState()
  const request = makeAdjustmentRequest()

  await expect(reportTaskAdjustment('t1', request)).resolves.toMatchObject({
    request,
    task: { id: 't1', status: 'pending', adjustmentStatus: 'submitted' },
  })
  const data = await bootstrap()
  expect(data.tasks).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 't1', status: 'pending', adjustmentStatus: 'submitted' }),
  ]))
  expect(data.taskAdjustments).toContainEqual(request)
})

test('rejects adjustment requests for completed tasks without resurrecting them', async () => {
  await resetMockState()
  await completeTask('t1')

  await expect(reportTaskAdjustment('t1', makeAdjustmentRequest())).rejects.toThrow(/pending teacher-assigned task/i)

  const data = await bootstrap()
  expect(data.tasks.find((task) => task.id === 't1')).toMatchObject({ status: 'completed' })
  expect(data.taskAdjustments).toEqual([])
})

test('rejects adjustment requests for non-teacher tasks', async () => {
  await resetMockState()

  await expect(reportTaskAdjustment('t3', makeAdjustmentRequest({ id: 'adj-error', taskId: 't3' }))).rejects.toThrow(/pending teacher-assigned task/i)

  const data = await bootstrap()
  expect(data.tasks.find((task) => task.id === 't3')).toMatchObject({ type: 'error_review', status: 'pending' })
  expect(data.taskAdjustments).toEqual([])
})

test('rejects a repeat adjustment while a submitted request is active', async () => {
  await resetMockState()
  const first = makeAdjustmentRequest()
  await reportTaskAdjustment('t1', first)

  await expect(reportTaskAdjustment('t1', makeAdjustmentRequest({ id: 'adj-2' }))).rejects.toThrow(/pending teacher-assigned task/i)

  const data = await bootstrap()
  expect(data.tasks.find((task) => task.id === 't1')).toMatchObject({ status: 'pending', adjustmentStatus: 'submitted' })
  expect(data.taskAdjustments).toEqual([first])
})

test('sends the full adjustment request to the real endpoint', async () => {
  // Catches a real-mode adapter that silently replaces the teacher-facing request body with an empty object.
  const post = vi.fn(() => Promise.resolve({ request: { id: 'adj-1' }, task: { id: 't1' } }))
  vi.resetModules()
  vi.doMock('./client', () => ({
    ApiError: class ApiError extends Error {},
    http: { post },
    isMockMode: false,
  }))
  const realApi = await import('./index')
  const request = { id: 'adj-1', taskId: 't1', reason: 'difficulty' }

  await realApi.reportTaskAdjustment('t1', request)

  expect(post).toHaveBeenCalledWith('/api/tasks/t1/adjustment-request', request)
  vi.doUnmock('./client')
  vi.resetModules()
})

test('addErrors returns and persists the submitted errors', async () => {
  // Catches a mock adapter mutation that accepts error writes without recording them.
  await resetMockState()
  const items = [makeError()]

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
  const note = makeNote()

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

test('submitSession returns an ID and persists the session by session ID', async () => {
  // Catches a mock adapter mutation that reports a session ID but loses the session record.
  await resetMockState()
  const session = makeSession()

  await expect(submitSession(session)).resolves.toEqual({ sessionId: 's-new' })
  await expect(bootstrap()).resolves.toMatchObject({ sessions: { 's-new': session } })
})

test('reads task and bank exercise sets and rejects invalid or unknown identifiers', async () => {
  // Catches exercise reads that use the set key for task routes or silently return undefined.
  await resetMockState()

  const taskSet = await getExerciseSet('t1')
  expect(taskSet.taskId).toBe('t1')
  expect(taskSet.questions[0]).toMatchObject({ id: 'q1' })
  await expect(getBankExerciseSet('bq2')).resolves.toMatchObject({ questions: [{ id: 'bq2-q1' }] })
  await expect(getExerciseSet('missing')).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' })
  await expect(getBankExerciseSet('missing')).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' })
  await expect(getExerciseSet('   ')).rejects.toMatchObject({ status: 400, code: 'INVALID_INPUT' })
})

test('persists sessions and cycles deterministic variants atomically', async () => {
  // Catches variant generation that repeats one template, collides IDs, or saves only half the transaction.
  await resetMockState()
  const set = await getExerciseSet('t1')
  const session = makeSession({ sessionId: 's-variant', taskId: 't1' })

  await submitSession(session)
  const first = await generateVariant(set.questions[0].id)
  const second = await generateVariant(set.questions[0].id)
  const third = await generateVariant(set.questions[0].id)
  const data = await bootstrap()

  expect(data.sessions['s-variant']).toEqual(session)
  expect(first.exerciseSet.id).toBe('variant-q1-1')
  expect(second.exerciseSet.id).toBe('variant-q1-2')
  expect(third.exerciseSet.id).toBe('variant-q1-3')
  expect(new Set([first.task.id, second.task.id, third.task.id])).toHaveProperty('size', 3)
  expect(first.exerciseSet.questions[0].content).not.toBe(second.exerciseSet.questions[0].content)
  expect(third.exerciseSet.questions[0].content).toBe(first.exerciseSet.questions[0].content)
  for (const generated of [first, second, third]) {
    expect(data.exerciseSets[generated.exerciseSet.id]).toEqual(generated.exerciseSet)
    expect(data.tasks).toContainEqual(generated.task)
  }
})

test('chains variants through a different template while preserving source provenance', async () => {
  await resetMockState()
  const sourceSet = await getExerciseSet('t1')
  const first = await generateVariant(sourceSet.questions[0].id)
  const firstQuestion = first.exerciseSet.questions[0]

  const second = await generateVariant(firstQuestion.id)
  const secondQuestion = second.exerciseSet.questions[0]
  const data = await bootstrap()

  expect(secondQuestion.content).not.toBe(firstQuestion.content)
  expect(isCompleteVariantResult(second, firstQuestion.id)).toBe(true)
  expect(second.exerciseSet.sourceQuestionId).toBe(firstQuestion.id)
  expect(second.task.sourceQuestionId).toBe(firstQuestion.id)
  expect(secondQuestion.variantOf).toBe(firstQuestion.id)
  expect(data.exerciseSets[first.exerciseSet.id]).toEqual(first.exerciseSet)
  expect(data.exerciseSets[second.exerciseSet.id]).toEqual(second.exerciseSet)
  expect(data.tasks).toEqual(expect.arrayContaining([first.task, second.task]))
})

test('rejects a source with no distinct template without persisting a partial variant', async () => {
  await resetMockState()
  const sourceQuestion = (await getExerciseSet('t1')).questions[0]
  vi.resetModules()
  vi.doMock('../data/variantTemplates', () => ({
    VARIANT_TEMPLATES: {
      [sourceQuestion.topic]: [{
        ...structuredClone(sourceQuestion),
        content: `  \n${sourceQuestion.content.toUpperCase()}\t `,
      }],
    },
  }))

  try {
    const isolatedApi = await import('./index')
    await isolatedApi.resetMockState()
    const before = await isolatedApi.bootstrap()

    await expect(isolatedApi.generateVariant(sourceQuestion.id)).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
      code: 'INVALID_INPUT',
      message: `No distinct variant template is available for ${sourceQuestion.topic}`,
    })

    const after = await isolatedApi.bootstrap()
    expect(after.exerciseSets).toEqual(before.exerciseSets)
    expect(after.tasks).toEqual(before.tasks)
  } finally {
    vi.doUnmock('../data/variantTemplates')
    vi.resetModules()
  }
})

test('generates a variant from a bank question and rejects invalid or unknown sources', async () => {
  // Catches source lookup being limited to teacher task exercise sets.
  await resetMockState()

  await expect(generateVariant('bq2-q1')).resolves.toMatchObject({
    exerciseSet: { sourceQuestionId: 'bq2-q1', questions: [{ variantOf: 'bq2-q1' }] },
    task: { sourceQuestionId: 'bq2-q1', type: 'ai_recommended' },
  })
  await expect(generateVariant('missing')).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' })
  await expect(generateVariant('')).rejects.toMatchObject({ status: 400, code: 'INVALID_INPUT' })
})

test('uses the documented real exercise routes and request bodies', async () => {
  // Catches the real adapter drifting from the backend route contract while mock mode stays green.
  const get = vi.fn((path) => Promise.resolve({ path }))
  const post = vi.fn((path, body) => Promise.resolve({ path, body }))
  vi.resetModules()
  vi.doMock('./client', () => ({
    ApiError: class ApiError extends Error {},
    http: { get, post, patch: vi.fn() },
    isMockMode: false,
  }))

  try {
    const realApi = await import('./index')
    const session = makeSession({ sessionId: 's-real' })
    await realApi.getExerciseSet('task/id')
    await realApi.getBankExerciseSet('bank/id')
    await realApi.submitSession(session)
    await realApi.generateVariant('question/id')

    expect(get).toHaveBeenNthCalledWith(1, '/api/exercise-sets/task%2Fid')
    expect(get).toHaveBeenNthCalledWith(2, '/api/bank/exercise/bank%2Fid')
    expect(post).toHaveBeenNthCalledWith(1, '/api/sessions', session)
    expect(post).toHaveBeenNthCalledWith(2, '/api/questions/question%2Fid/variant')
  } finally {
    vi.doUnmock('./client')
    vi.resetModules()
  }
})

test('accepts documented optional question metadata and rejects mistyped metadata', async () => {
  // Catches explanation, variant, and handwriting metadata bypassing boundary validation.
  await resetMockState()
  const question = makeSessionQuestion({
    variantOf: 'q-source',
    sourceQuestionId: 'q-source',
    understandingExplanation: 'Understand the derivative as a rate of change.',
    scoringExplanation: 'Award one mark for the derivative and one for substitution.',
    passageEvidence: 'The passage states the figure directly.',
    errorPattern: 'Avoid replacing an explicit statement with an inference.',
  })
  await expect(submitSession(makeSession({ sessionId: 's-metadata', questions: [question] }))).resolves.toEqual({ sessionId: 's-metadata' })

  const invalidQuestions = [
    makeSessionQuestion({ variantOf: 42 }),
    makeSessionQuestion({ understandingExplanation: false }),
    makeSessionQuestion({ passageEvidence: [] }),
    makeSessionQuestion({ result: { ...makeSessionQuestion().result, handwritingUsed: 'yes' } }),
  ]
  for (const [index, invalidQuestion] of invalidQuestions.entries()) {
    await expect(submitSession(makeSession({ sessionId: `bad-${index}`, questions: [invalidQuestion] })))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' })
  }
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
  await expect(createNote(makeNote({ id: 'n1', title: 'Duplicate' }))).rejects.toMatchObject({ name: 'ApiError', code: 'DUPLICATE_ID' })
  await expect(submitSession({ score: 10 })).rejects.toMatchObject({ name: 'ApiError', code: 'INVALID_INPUT' })

  const session = makeSession({ sessionId: 's-duplicate' })
  await submitSession(session)
  await expect(submitSession(session)).rejects.toMatchObject({ name: 'ApiError', code: 'DUPLICATE_ID' })
})

test('addErrors deduplicates a submitted batch and persisted question IDs', async () => {
  // Catches batch duplicates being added twice or persisted dedupe returning a phantom success.
  await resetMockState()
  const first = makeError({ id: 'e-batch-1', questionId: 'q-batch' })
  const duplicate = makeError({ id: 'e-batch-2', questionId: 'q-batch' })

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
    makeError({ id: 'e-shared', questionId: 'q-one' }),
    makeError({ id: 'e-shared', questionId: 'q-two' }),
  ])).rejects.toMatchObject({ name: 'ApiError', code: 'DUPLICATE_ID' })
  await expect(addErrors([makeError({ id: before[0].id, questionId: 'q-new-id-collision' })])).rejects.toMatchObject({
    name: 'ApiError', code: 'DUPLICATE_ID',
  })
  expect((await bootstrap()).errors).toEqual(before)
})

test('createTask and createNote reject incomplete or mistyped documented entities without changing state', async () => {
  // Catches create validation stopping at a nonempty ID instead of enforcing the documented entity contract.
  await resetMockState()
  const before = await bootstrap()

  await expect(createTask({ id: 'task-id-only' })).rejects.toMatchObject({ name: 'ApiError', code: 'INVALID_INPUT' })
  await expect(createTask(makeTask({ id: 'task-bad-type', estimatedMinutes: '15' }))).rejects.toMatchObject({ name: 'ApiError', code: 'INVALID_INPUT' })
  await expect(createNote({ id: 'note-id-only' })).rejects.toMatchObject({ name: 'ApiError', code: 'INVALID_INPUT' })
  await expect(createNote(makeNote({ id: 'note-bad-type', content: 'plain text' }))).rejects.toMatchObject({ name: 'ApiError', code: 'INVALID_INPUT' })

  const after = await bootstrap()
  expect(after.tasks).toEqual(before.tasks)
  expect(after.notes).toEqual(before.notes)
})

test('updateNote rejects ID replacement and mistyped fields without changing the stored note', async () => {
  // Catches arbitrary shallow patches replacing identity or corrupting a documented field type.
  await resetMockState()
  const before = (await bootstrap()).notes

  await expect(updateNote('n1', { id: 'n2', title: 'Duplicate identity' })).rejects.toMatchObject({
    name: 'ApiError', code: 'INVALID_INPUT',
  })
  await expect(updateNote('n1', { tags: 'organized' })).rejects.toMatchObject({
    name: 'ApiError', code: 'INVALID_INPUT',
  })
  expect((await bootstrap()).notes).toEqual(before)
})

test('updateSettings rejects unsupported, out-of-range, and mistyped fields without changing settings', async () => {
  // Catches settings accepting arbitrary keys and values through an unchecked object merge.
  await resetMockState()
  const before = (await bootstrap()).settings
  const invalidPatches = [
    { tone: 'strict' },
    { tone: 101 },
    { dailyGoalHours: 0 },
    { reminderTask: 'yes' },
    { unknownSetting: true },
  ]

  for (const patch of invalidPatches) {
    await expect(updateSettings(patch)).rejects.toMatchObject({ name: 'ApiError', code: 'INVALID_INPUT' })
  }
  expect((await bootstrap()).settings).toEqual(before)
})

test('session and error commands reject incomplete critical shapes without changing state', async () => {
  // Catches session/error validation accepting ID-only records and incomplete redo attempts.
  await resetMockState()
  const before = await bootstrap()

  await expect(submitSession({ sessionId: 'session-id-only' })).rejects.toMatchObject({ name: 'ApiError', code: 'INVALID_INPUT' })
  await expect(addErrors([{ id: 'error-id-only', questionId: 'question-id-only' }])).rejects.toMatchObject({ name: 'ApiError', code: 'INVALID_INPUT' })
  await expect(submitRedo('e1', { isCorrect: true })).rejects.toMatchObject({ name: 'ApiError', code: 'INVALID_INPUT' })

  const after = await bootstrap()
  expect(after.sessions).toEqual(before.sessions)
  expect(after.errors).toEqual(before.errors)
})
