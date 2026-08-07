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
  getSessionSummary,
  markErrorMastered,
  reportTaskAdjustment,
  resetMockState,
  scheduleErrorVariant,
  submitRedo,
  submitSession,
  upsertErrors,
  updateNote,
  updateSettings,
  verifyErrorVariant,
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

const makeError = (overrides = {}) => {
  const id = overrides.id ?? 'e-new'
  const questionId = overrides.questionId ?? 'q-new'
  const occurrenceKey = `card:${id}:question:${questionId}`
  return {
    id, questionId, subject: 'A-Level Math', errorType: 'calculation',
    questionSummary: 'Differentiate f(x)', questionContent: '<p>Differentiate f(x)</p>',
    errorDescription: 'Sign error', relatedTopic: 'Differentiation', topicId: 'calculus-deriv',
    firstOccurredAt: '2026-08-06', lastOccurredAt: '2026-08-06',
    occurrences: ['2026-08-06'],
    occurrenceKeys: [occurrenceKey],
    occurrenceRecords: [{ key: occurrenceKey, occurredAt: '2026-08-06' }],
    hasIncompleteOccurrenceHistory: false,
    repeatCount: 1,
    status: 'pending_review', studentAnswer: 'x', correctAnswer: '2x', analysis: 'Check signs',
    acceptKeywords: ['2x'], redoHistory: [], ...overrides,
  }
}

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

const mutateStoredState = (recipe) => {
  const storageKey = 'nome-ai.student-state.v1'
  const envelope = JSON.parse(localStorage.getItem(storageKey))
  recipe(envelope.data)
  localStorage.setItem(storageKey, JSON.stringify(envelope))
}

const prepareScheduledError = async () => {
  await resetMockState()
  await submitRedo('e1', {
    attemptedAt: '2026-08-06T10:00:00.000Z',
    answer: '5',
    isCorrect: true,
    timeSpent: 45,
  })
  return scheduleErrorVariant('e1')
}

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

  await expect(addErrors(items)).resolves.toMatchObject({
    errors: expect.arrayContaining([expect.objectContaining(items[0])]),
  })
  await expect(bootstrap()).resolves.toMatchObject({
    errors: expect.arrayContaining([expect.objectContaining(items[0])]),
  })
})

test('submitRedo persists aligned wrong-redo recurrence evidence that survives a later upsert', async () => {
  // Catches reload/upsert normalization erasing a plan-required wrong-redo repeat increment.
  await resetMockState()
  const attempt = { attemptedAt: '2026-08-06', answer: '0', isCorrect: false, timeSpent: 30 }
  const legacyKey = 'legacy:q-err-1:2026-07-30'
  const redoKey = 'redo:error:e1:2026-08-06'

  const submitted = await submitRedo('e1', attempt)
  expect(submitted).toMatchObject({
    error: expect.objectContaining({
      id: 'e1',
      redoHistory: expect.arrayContaining([attempt]),
      repeatCount: 3,
      status: 'pending_review',
      firstOccurredAt: '2026-07-30',
      lastOccurredAt: '2026-08-06',
      occurrences: ['2026-07-30', '2026-08-06'],
      occurrenceKeys: [legacyKey, redoKey],
      occurrenceRecords: [
        { key: legacyKey, occurredAt: '2026-07-30' },
        { key: redoKey, occurredAt: '2026-08-06' },
      ],
    }),
  })
  const persisted = (await bootstrap()).errors.find((item) => item.id === 'e1')
  expect(persisted).toMatchObject({
    repeatCount: 3,
    occurrenceKeys: [legacyKey, redoKey],
    occurrenceRecords: [
      { key: legacyKey, occurredAt: '2026-07-30' },
      { key: redoKey, occurredAt: '2026-08-06' },
    ],
  })

  const nextSessionKey = 'session:s-after-redo:question:q-err-1'
  const recurringSession = makeError({
    id: 'fresh-after-redo',
    questionId: 'q-err-1',
    firstOccurredAt: '2026-08-07',
    lastOccurredAt: '2026-08-07',
    occurrences: ['2026-08-07'],
    occurrenceKeys: [nextSessionKey],
    occurrenceRecords: [{ key: nextSessionKey, occurredAt: '2026-08-07' }],
  })
  const upserted = (await upsertErrors([recurringSession])).errors.find((item) => item.id === 'e1')

  expect(upserted).toMatchObject({
    repeatCount: 4,
    occurrenceKeys: [legacyKey, redoKey, nextSessionKey],
    hasIncompleteOccurrenceHistory: true,
  })
  expect((await bootstrap()).errors.find((item) => item.id === 'e1')).toEqual(upserted)
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

test.each(['expression', 'habit'])('accepts the documented %s session error type', async (errorType) => {
  // Catches the session boundary lagging behind the seven-type diagnostic contract.
  await resetMockState()
  const question = makeSessionQuestion({ id: `q-${errorType}`, errorType })

  await expect(submitSession(makeSession({ sessionId: `s-${errorType}`, questions: [question] })))
    .resolves.toEqual({ sessionId: `s-${errorType}` })
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
  const duplicate = makeError({
    id: 'e-batch-2',
    questionId: 'q-batch',
    occurrences: first.occurrences,
    occurrenceKeys: first.occurrenceKeys,
    occurrenceRecords: first.occurrenceRecords,
  })

  const firstResult = await addErrors([first, duplicate])
  const retryResult = await addErrors([{ ...duplicate, id: 'e-batch-3' }])
  const canonical = expect.objectContaining({
    id: first.id,
    questionId: first.questionId,
    repeatCount: 1,
    occurrenceKeys: first.occurrenceKeys,
  })

  expect(firstResult.errors.filter((error) => error.questionId === 'q-batch')).toEqual([canonical])
  expect(retryResult.errors.filter((error) => error.questionId === 'q-batch')).toEqual([canonical])
  expect((await bootstrap()).errors.filter((error) => error.questionId === 'q-batch')).toEqual([canonical])
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

test('computes a cloned summary from the exact persisted session and rejects unknown identifiers', async () => {
  // Catches summaries being derived from seed data, a different session, or a caller-mutable cached object.
  await resetMockState()
  const session = makeSession({
    sessionId: 'summary/session',
    questions: [
      makeSessionQuestion(),
      makeSessionQuestion({
        id: 'q-summary-wrong',
        topic: 'Calculus',
        errorType: 'calculation',
        result: {
          status: 'wrong',
          attempts: [{ answer: '41', submittedAt: '2026-08-06T12:00:00.000Z', isCorrect: false }],
          hintsUsed: 2,
          solvedAtHintLevel: null,
        },
      }),
    ],
  })
  await submitSession(session)

  const summary = await getSessionSummary('summary/session')
  expect(summary).toMatchObject({
    accuracy: 50,
    correctCount: 1,
    wrongCount: 1,
    errorDistribution: { calculation: 1 },
    wrongQuestions: [expect.objectContaining({ id: 'q-summary-wrong' })],
  })
  summary.wrongQuestions[0].id = 'caller-mutation'
  await expect(getSessionSummary('summary/session')).resolves.toMatchObject({
    wrongQuestions: [expect.objectContaining({ id: 'q-summary-wrong' })],
  })
  await expect(getSessionSummary('missing')).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' })
  await expect(getSessionSummary('   ')).rejects.toMatchObject({ status: 400, code: 'INVALID_INPUT' })
})

test('upserts recurring errors idempotently by occurrence identity and preserves one canonical card ID', async () => {
  // Catches retrying the same session occurrence inflating recurrence or replacing the durable card identity.
  await resetMockState()
  const first = makeError({
    id: 'error-first',
    questionId: 'question-recurring',
    firstOccurredAt: '2026-08-01T10:00:00.000Z',
    lastOccurredAt: '2026-08-01T10:00:00.000Z',
    occurrences: ['2026-08-01T10:00:00.000Z'],
    occurrenceKeys: ['session:s-one:question:question-recurring'],
    occurrenceRecords: [{ key: 'session:s-one:question:question-recurring', occurredAt: '2026-08-01T10:00:00.000Z' }],
  })
  const repeated = makeError({
    id: 'error-retry-id',
    questionId: 'question-recurring',
    errorDescription: 'Second diagnosis',
    firstOccurredAt: '2026-08-06T10:00:00.000Z',
    lastOccurredAt: '2026-08-06T10:00:00.000Z',
    occurrences: ['2026-08-06T10:00:00.000Z'],
    occurrenceKeys: ['session:s-two:question:question-recurring'],
    occurrenceRecords: [{ key: 'session:s-two:question:question-recurring', occurredAt: '2026-08-06T10:00:00.000Z' }],
  })

  await upsertErrors([first])
  await upsertErrors([first])
  const { errors } = await upsertErrors([repeated])
  const merged = errors.find((item) => item.questionId === 'question-recurring')

  expect(merged).toMatchObject({
    id: 'error-first',
    repeatCount: 2,
    firstOccurredAt: '2026-08-01T10:00:00.000Z',
    lastOccurredAt: '2026-08-06T10:00:00.000Z',
    errorDescription: 'Second diagnosis',
    occurrenceKeys: [
      'session:s-one:question:question-recurring',
      'session:s-two:question:question-recurring',
    ],
  })
  expect((await bootstrap()).errors.filter((item) => item.questionId === 'question-recurring')).toEqual([merged])
})

test('rejects malformed or colliding error upserts atomically', async () => {
  // Catches a partially merged batch or duplicate entity ID corrupting a different question's identity.
  await resetMockState()
  const before = (await bootstrap()).errors

  await expect(upsertErrors([
    makeError({ id: 'valid-before-failure', questionId: 'q-valid-before-failure' }),
    makeError({ id: '', questionId: 'q-invalid' }),
  ])).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  await expect(upsertErrors([
    makeError({ id: before[0].id, questionId: 'different-question' }),
  ])).rejects.toMatchObject({ code: 'DUPLICATE_ID' })

  expect((await bootstrap()).errors).toEqual(before)
})

const strictOccurrenceCases = [
  ['missing occurrence keys', { occurrenceKeys: undefined }],
  ['missing occurrence records', { occurrenceRecords: undefined }],
  ['repeat count above the unique identity count', { repeatCount: 2 }],
  ['repeat count below the unique identity count', {
    occurrenceKeys: ['occurrence-a', 'occurrence-b'],
    occurrenceRecords: [
      { key: 'occurrence-a', occurredAt: '2026-08-05' },
      { key: 'occurrence-b', occurredAt: '2026-08-06' },
    ],
    repeatCount: 1,
  }],
  ['a forged legacy aggregate marker', { hasIncompleteOccurrenceHistory: true }],
]

const errorBatchWriters = [
  ['addErrors', addErrors],
  ['upsertErrors', upsertErrors],
]

test.each(errorBatchWriters.flatMap(([writerName, write]) => (
  strictOccurrenceCases.map(([caseName, patch]) => [writerName, caseName, write, patch])
)))('%s rejects an untrusted occurrence aggregate atomically: %s', async (_, __, write, patch) => {
  // Catches incoming cards claiming recurrence totals that cannot be derived from stable identities.
  await resetMockState()
  const before = (await bootstrap()).errors
  const validBeforeFailure = makeError({
    id: 'strict-identity-valid',
    questionId: 'strict-identity-valid-question',
  })
  const invalid = makeError({
    id: 'strict-identity-invalid',
    questionId: 'strict-identity-invalid-question',
    ...patch,
  })

  await expect(write([validBeforeFailure, invalid]))
    .rejects.toMatchObject({ code: 'INVALID_INPUT' })
  expect((await bootstrap()).errors).toEqual(before)
})

test.each(errorBatchWriters.flatMap(([writerName, write]) => ([
  [writerName, 'a forged mastered status', write, { status: 'mastered' }],
  [writerName, 'a fake correct redo', write, {
    redoHistory: [{ attemptedAt: '2026-08-06', answer: '2x', isCorrect: true, timeSpent: 10 }],
  }],
  [writerName, 'a fake verification audit', write, {
    verificationVariantId: 'forged-variant',
    variantVerifiedAt: '2026-08-07',
    variantVerification: { variantId: 'forged-variant', isCorrect: true, verifiedAt: '2026-08-07' },
  }],
])))('%s rejects fresh recurrence evidence containing %s atomically', async (_, __, write, patch) => {
  // Catches lifecycle evidence being raw-persisted or silently sanitized instead of rejected at the boundary.
  await resetMockState()
  const before = (await bootstrap()).errors
  const validBeforeFailure = makeError({
    id: 'fresh-lifecycle-valid',
    questionId: 'fresh-lifecycle-valid-question',
  })
  const forged = makeError({
    id: 'fresh-lifecycle-forged',
    questionId: 'fresh-lifecycle-forged-question',
    ...patch,
  })

  await expect(write([validBeforeFailure, forged]))
    .rejects.toMatchObject({ code: 'INVALID_INPUT' })
  expect((await bootstrap()).errors).toEqual(before)
})

test.each(errorBatchWriters)('%s snapshots validated recurrence evidence before the async write', async (_, write) => {
  // Catches caller mutation during repository latency bypassing validation of lifecycle and identities.
  await resetMockState()
  const item = makeError({
    id: 'snapshot-error',
    questionId: 'snapshot-question',
  })
  const originalOccurrenceKeys = [...item.occurrenceKeys]
  const batch = [item]

  const operation = write(batch)
  item.status = 'mastered'
  item.redoHistory.push({ attemptedAt: '2026-08-07', answer: '2x', isCorrect: true, timeSpent: 10 })
  item.verificationVariantId = 'forged-variant'
  item.variantVerifiedAt = '2026-08-08'
  item.variantVerification = { variantId: 'forged-variant', isCorrect: true, verifiedAt: '2026-08-08' }
  item.occurrences.push('2026-08-07')
  item.occurrenceKeys.push('forged-occurrence')
  item.occurrenceRecords.push({ key: 'forged-occurrence', occurredAt: '2026-08-07' })
  item.repeatCount = 2
  batch.push(makeError({ id: 'late-pushed-error', questionId: 'late-pushed-question' }))

  const { errors } = await operation
  const stored = errors.find((error) => error.id === 'snapshot-error')
  expect(stored).toMatchObject({
    status: 'pending_review',
    redoHistory: [],
    verificationVariantId: null,
    variantVerifiedAt: null,
    variantVerification: null,
    occurrenceKeys: originalOccurrenceKeys,
    repeatCount: 1,
  })
  expect(errors.some((error) => error.id === 'late-pushed-error')).toBe(false)
})

test('rejects incoming legacy aggregates but safely migrates an already persisted aggregate', async () => {
  await resetMockState()
  const before = (await bootstrap()).errors
  const legacy = makeError({
    id: 'legacy-add-error',
    questionId: 'legacy-add-question',
    firstOccurredAt: '2026-08-01',
    lastOccurredAt: '2026-08-01',
    occurrences: undefined,
    occurrenceKeys: undefined,
    occurrenceRecords: undefined,
    hasIncompleteOccurrenceHistory: true,
    repeatCount: 4,
  })

  await expect(addErrors([legacy])).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  expect((await bootstrap()).errors).toEqual(before)

  mutateStoredState((state) => { state.errors = [legacy] })
  await expect(bootstrap()).resolves.toMatchObject({
    errors: [expect.objectContaining({
      id: legacy.id,
      repeatCount: 4,
      hasIncompleteOccurrenceHistory: true,
    })],
  })

  const fresh = makeError({
    id: 'fresh-after-legacy',
    questionId: legacy.questionId,
    firstOccurredAt: '2026-08-06',
    lastOccurredAt: '2026-08-06',
  })
  const { errors } = await upsertErrors([fresh])
  expect(errors).toEqual([
    expect.objectContaining({
      id: legacy.id,
      questionId: legacy.questionId,
      repeatCount: 5,
      hasIncompleteOccurrenceHistory: true,
      occurrenceKeys: expect.arrayContaining(fresh.occurrenceKeys),
    }),
  ])
})

test('persists the redo, scheduled variant, correct verification, and guarded mastery as one provenance chain', async () => {
  // Catches lifecycle transitions that save only a task/set/error fragment or accept an unrelated verification.
  await resetMockState()
  const attempt = { attemptedAt: '2026-08-06T10:00:00.000Z', answer: '5', isCorrect: true, timeSpent: 45 }
  await expect(submitRedo('e1', attempt)).resolves.toMatchObject({
    error: { id: 'e1', status: 'verification_due', redoHistory: [expect.objectContaining(attempt)] },
  })

  const scheduled = await scheduleErrorVariant('e1')
  expect(scheduled).toMatchObject({
    error: { id: 'e1', questionId: 'q-err-1', status: 'verification_due', verificationVariantId: 'variant-q-err-1-1' },
    exerciseSet: {
      id: 'variant-q-err-1-1',
      sourceQuestionId: 'q-err-1',
      questions: [expect.objectContaining({ variantOf: 'q-err-1' })],
    },
    task: {
      id: 'task-variant-q-err-1-1',
      exerciseSetId: 'variant-q-err-1-1',
      sourceQuestionId: 'q-err-1',
      verificationForErrorId: 'e1',
    },
  })
  const afterSchedule = await bootstrap()
  expect(afterSchedule.exerciseSets[scheduled.exerciseSet.id]).toEqual(scheduled.exerciseSet)
  expect(afterSchedule.tasks).toContainEqual(scheduled.task)
  expect(afterSchedule.errors.find((item) => item.id === 'e1')).toEqual(scheduled.error)

  await expect(verifyErrorVariant('e1', {
    variantId: scheduled.exerciseSet.id,
    isCorrect: true,
    verifiedAt: '2026-08-06T11:00:00.000Z',
  })).resolves.toMatchObject({
    error: {
      id: 'e1',
      status: 'verification_due',
      variantVerifiedAt: '2026-08-06T11:00:00.000Z',
      variantVerification: { variantId: scheduled.exerciseSet.id, isCorrect: true },
    },
  })
  await expect(markErrorMastered('e1')).resolves.toMatchObject({ error: { id: 'e1', status: 'mastered' } })
  await expect(bootstrap()).resolves.toMatchObject({
    errors: expect.arrayContaining([expect.objectContaining({ id: 'e1', status: 'mastered' })]),
  })
})

test('rejects mastery and mismatched verification without changing persisted lifecycle evidence', async () => {
  // Catches bypassing the independent-variant gate or accepting a forged variant ID.
  await resetMockState()
  await expect(markErrorMastered('e1')).rejects.toMatchObject({
    status: 409,
    code: 'MASTERY_GATE_NOT_MET',
    message: 'Complete the independent variant before marking this mastered',
  })
  await submitRedo('e1', { attemptedAt: '2026-08-06T10:00:00.000Z', answer: '5', isCorrect: true, timeSpent: 45 })
  const scheduled = await scheduleErrorVariant('e1')
  const before = (await bootstrap()).errors.find((item) => item.id === 'e1')

  await expect(verifyErrorVariant('e1', {
    variantId: 'variant-for-another-error',
    isCorrect: true,
    verifiedAt: '2026-08-06T11:00:00.000Z',
  })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  expect((await bootstrap()).errors.find((item) => item.id === 'e1')).toEqual(before)
  expect(scheduled.error.verificationVariantId).toBe(scheduled.exerciseSet.id)
})

test('rejects verification when the persisted variant task no longer proves the exact error provenance', async () => {
  // Catches trusting only the caller's variant ID after the durable task/error relationship was corrupted.
  await resetMockState()
  await submitRedo('e1', { attemptedAt: '2026-08-06T10:00:00.000Z', answer: '5', isCorrect: true, timeSpent: 45 })
  const scheduled = await scheduleErrorVariant('e1')
  const envelope = JSON.parse(localStorage.getItem('nome-ai.student-state.v1'))
  envelope.data.tasks = envelope.data.tasks.map((task) => (
    task.id === scheduled.task.id ? { ...task, verificationForErrorId: 'another-error' } : task
  ))
  localStorage.setItem('nome-ai.student-state.v1', JSON.stringify(envelope))
  const before = (await bootstrap()).errors.find((item) => item.id === 'e1')

  await expect(verifyErrorVariant('e1', {
    variantId: scheduled.exerciseSet.id,
    isCorrect: true,
    verifiedAt: '2026-08-06T11:00:00.000Z',
  })).rejects.toMatchObject({ code: 'INVALID_INPUT' })

  expect((await bootstrap()).errors.find((item) => item.id === 'e1')).toEqual(before)
})

test('rejects malformed verification evidence with a typed validation error', async () => {
  // Catches null or partial audit evidence reaching the transition helper and throwing an untyped runtime error.
  await resetMockState()

  await expect(verifyErrorVariant('e1', null)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  await expect(verifyErrorVariant('e1', { variantId: 'v1', isCorrect: true })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
})

test('rejects invalid, missing, or out-of-order lifecycle targets without partial task/set writes', async () => {
  // Catches target validation happening after a generated variant has already been persisted.
  await resetMockState()
  const before = await bootstrap()

  await expect(scheduleErrorVariant('missing')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  await expect(scheduleErrorVariant('e1')).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  await expect(submitRedo('missing', { attemptedAt: '2026-08-06', answer: 'x', isCorrect: true, timeSpent: 1 }))
    .rejects.toMatchObject({ code: 'NOT_FOUND' })
  await expect(verifyErrorVariant('missing', { variantId: 'v1', isCorrect: true, verifiedAt: '2026-08-06' }))
    .rejects.toMatchObject({ code: 'NOT_FOUND' })

  const after = await bootstrap()
  expect(after.tasks).toEqual(before.tasks)
  expect(after.exerciseSets).toEqual(before.exerciseSets)
  expect(after.errors).toEqual(before.errors)
})

test('uses the documented real diagnosis routes and request bodies', async () => {
  // Catches the real adapter drifting while equivalent mock-mode lifecycle tests remain green.
  const get = vi.fn((path) => Promise.resolve({ path }))
  const post = vi.fn((path, body) => Promise.resolve({ path, body }))
  const patch = vi.fn((path, body) => Promise.resolve({ path, body }))
  vi.resetModules()
  vi.doMock('./client', () => ({
    ApiError: class ApiError extends Error {},
    http: { get, post, patch },
    isMockMode: false,
  }))

  try {
    const realApi = await import('./index')
    const items = [makeError()]
    const attempt = { attemptedAt: '2026-08-06', answer: '2x', isCorrect: true, timeSpent: 12 }
    const verification = { variantId: 'variant/1', isCorrect: true, verifiedAt: '2026-08-07' }
    await realApi.getSessionSummary('session/id')
    await realApi.upsertErrors(items)
    await realApi.submitRedo('error/id', attempt)
    await realApi.scheduleErrorVariant('error/id')
    await realApi.verifyErrorVariant('error/id', verification)
    await realApi.markErrorMastered('error/id')

    expect(get).toHaveBeenCalledWith('/api/summary/session%2Fid')
    expect(post).toHaveBeenNthCalledWith(1, '/api/errors/batch', { items })
    expect(post).toHaveBeenNthCalledWith(2, '/api/errors/error%2Fid/redo', attempt)
    expect(post).toHaveBeenNthCalledWith(3, '/api/errors/error%2Fid/variant')
    expect(post).toHaveBeenNthCalledWith(4, '/api/errors/error%2Fid/verification', verification)
    expect(patch).toHaveBeenCalledWith('/api/errors/error%2Fid', { status: 'mastered' })
  } finally {
    vi.doUnmock('./client')
    vi.resetModules()
  }
})

test.each([
  ['set id differs from its persisted key', (state, scheduled) => {
    state.exerciseSets[scheduled.exerciseSet.id].id = 'tampered-set-id'
  }],
  ['set taskId is empty', (state, scheduled) => {
    state.exerciseSets[scheduled.exerciseSet.id].taskId = ''
  }],
  ['set taskId points to a different task', (state, scheduled) => {
    state.exerciseSets[scheduled.exerciseSet.id].taskId = 't1'
  }],
  ['set taskId identifies duplicate tasks', (state, scheduled) => {
    state.tasks.push(structuredClone(scheduled.task))
  }],
  ['linked task exerciseSetId differs', (state, scheduled) => {
    state.tasks = state.tasks.map((task) => (task.id === scheduled.task.id
      ? { ...task, exerciseSetId: 'another-set' }
      : task))
  }],
  ['linked task source differs', (state, scheduled) => {
    state.tasks = state.tasks.map((task) => (task.id === scheduled.task.id
      ? { ...task, sourceQuestionId: 'another-question' }
      : task))
  }],
  ['linked task error differs', (state, scheduled) => {
    state.tasks = state.tasks.map((task) => (task.id === scheduled.task.id
      ? { ...task, verificationForErrorId: 'another-error' }
      : task))
  }],
  ['generated set has no question', (state, scheduled) => {
    state.exerciseSets[scheduled.exerciseSet.id].questions = []
  }],
  ['generated question source differs', (state, scheduled) => {
    state.exerciseSets[scheduled.exerciseSet.id].questions[0].variantOf = 'another-question'
  }],
])('rejects verification atomically when the persisted provenance chain is broken: %s', async (_, tamper) => {
  // Catches partial provenance checks accepting a task/set that is merely adjacent to the linked IDs.
  const scheduled = await prepareScheduledError()
  mutateStoredState((state) => tamper(state, scheduled))
  const before = await bootstrap()

  await expect(verifyErrorVariant('e1', {
    variantId: scheduled.exerciseSet.id,
    isCorrect: true,
    verifiedAt: '2026-08-06T11:00:00.000Z',
  })).rejects.toMatchObject({ code: 'INVALID_INPUT' })

  expect((await bootstrap()).errors).toEqual(before.errors)
})

test('maps malformed and out-of-order redo evidence to typed validation errors without mutation', async () => {
  // Catches domain TypeError/RedoChronologyError escaping the API boundary or saving a rejected attempt.
  await resetMockState()
  const seedErrors = (await bootstrap()).errors

  await expect(submitRedo('e1', {
    attemptedAt: '2026-02-30',
    answer: '5',
    isCorrect: true,
    timeSpent: 10,
  })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  expect((await bootstrap()).errors).toEqual(seedErrors)

  const first = {
    attemptedAt: '2026-08-06T10:00:00.000Z',
    answer: '5',
    isCorrect: true,
    timeSpent: 10,
  }
  await submitRedo('e1', first)
  const beforeReplay = (await bootstrap()).errors
  await expect(submitRedo('e1', { ...first, answer: 'replayed' })).rejects.toMatchObject({
    code: 'INVALID_INPUT',
  })
  expect((await bootstrap()).errors).toEqual(beforeReplay)
})

test('rejects exact verification replay and an equal-time conflict without changing audit state', async () => {
  // Catches a no-op clone from recordVariantVerification being mistaken for an applied transition.
  const scheduled = await prepareScheduledError()
  const accepted = {
    variantId: scheduled.exerciseSet.id,
    isCorrect: true,
    verifiedAt: '2026-08-06T11:00:00.000Z',
  }
  await verifyErrorVariant('e1', accepted)
  const beforeReplay = (await bootstrap()).errors

  await expect(verifyErrorVariant('e1', accepted)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  expect((await bootstrap()).errors).toEqual(beforeReplay)

  await expect(verifyErrorVariant('e1', { ...accepted, isCorrect: false })).rejects.toMatchObject({
    code: 'INVALID_INPUT',
  })
  expect((await bootstrap()).errors).toEqual(beforeReplay)
})

test.each([
  ['unsupported question type', { type: 'essay' }],
  ['fractional difficulty', { difficulty: 2.5 }],
  ['out-of-range difficulty', { difficulty: 6 }],
  ['zero repeat count', { repeatCount: 0 }],
  ['fractional repeat count', { repeatCount: 1.5 }],
  ['fractional choice index', { options: ['A', 'B'], correctIndex: 0.5 }],
  ['out-of-range choice index', { options: ['A', 'B'], correctIndex: 2 }],
  ['fractional hint dependency', { hintDependency: 1.5 }],
  ['invalid first occurrence', { firstOccurredAt: '2026-02-30' }],
  ['invalid last occurrence', { lastOccurredAt: 'not-a-date' }],
  ['invalid occurrence timestamp', { occurrences: ['2026-08-40'] }],
  ['blank occurrence identity', { occurrenceKeys: [''] }],
  ['duplicate occurrence identities', { occurrenceKeys: ['occurrence-1', 'occurrence-1'] }],
  ['invalid occurrence record timestamp', {
    occurrenceKeys: ['occurrence-1'],
    occurrenceRecords: [{ key: 'occurrence-1', occurredAt: 'tomorrow' }],
  }],
  ['mismatched occurrence record identity', {
    occurrenceKeys: ['occurrence-1'],
    occurrenceRecords: [{ key: 'occurrence-2', occurredAt: '2026-08-06' }],
  }],
  ['incomplete redo evidence', { redoHistory: [{ attemptedAt: '2026-08-06', isCorrect: true }] }],
  ['invalid redo timestamp', {
    redoHistory: [{ attemptedAt: '2026-13-01', answer: '5', isCorrect: true, timeSpent: 10 }],
  }],
  ['invalid variant verification timestamp', {
    verificationVariantId: 'variant-1',
    variantVerifiedAt: 'not-a-date',
    variantVerification: { variantId: 'variant-1', isCorrect: true, verifiedAt: 'not-a-date' },
  }],
  ['mismatched variant verification id', {
    verificationVariantId: 'variant-1',
    variantVerifiedAt: '2026-08-07',
    variantVerification: { variantId: 'variant-2', isCorrect: true, verifiedAt: '2026-08-07' },
  }],
  ['non-record mark scheme point', { markSchemePoints: ['M1'] }],
  ['mistyped passage evidence', { passageEvidence: [42] }],
])('rejects an invalid extended ErrorItem atomically: %s', async (_, patch) => {
  // Catches a loose boundary admitting shapes that chronology, rendering, or persistence cannot trust.
  await resetMockState()
  const before = (await bootstrap()).errors
  const item = makeError({
    id: 'strict-error',
    questionId: 'strict-question',
    ...patch,
  })

  await expect(upsertErrors([item])).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  expect((await bootstrap()).errors).toEqual(before)
})

test.each(['expression', 'habit'])('upserts a valid %s error card under the seven-type contract', async (errorType) => {
  await resetMockState()
  const item = makeError({
    id: `error-${errorType}`,
    questionId: `question-${errorType}`,
    errorType,
    type: null,
    difficulty: null,
    occurrences: ['2026-08-06'],
    occurrenceKeys: [`session:s-${errorType}:question:question-${errorType}`],
    occurrenceRecords: [{
      key: `session:s-${errorType}:question:question-${errorType}`,
      occurredAt: '2026-08-06',
    }],
    markSchemePoints: [{ phrase: 'State the required evidence' }],
    passageEvidence: ['The passage states the evidence.'],
  })

  await expect(upsertErrors([item])).resolves.toMatchObject({
    errors: expect.arrayContaining([expect.objectContaining({ id: item.id, errorType })]),
  })
})

test('validates the optional verificationForErrorId task field', async () => {
  await resetMockState()
  const validTask = makeTask({ id: 'task-verification', verificationForErrorId: 'error-1' })
  await expect(createTask(validTask)).resolves.toEqual({ task: validTask })

  for (const [index, verificationForErrorId] of ['', '   ', null, 42].entries()) {
    await expect(createTask(makeTask({
      id: `task-invalid-verification-${index}`,
      verificationForErrorId,
    }))).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  }
})
