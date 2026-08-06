import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { AppProvider, useApp } from './AppStore'
import { createAppServices } from './services'

const bootData = {
  tasks: [{ id: 't1', type: 'teacher_assigned', status: 'pending' }],
  taskAdjustments: [],
  sessions: {},
  errors: [],
  notes: [],
  noteFolders: [],
  settings: { tone: 50 },
}

const completeHints = () => [1, 2, 3, 4, 5].map((level) => ({
  level,
  title: `Hint ${level}`,
  content: `Hint content ${level}`,
}))

const validQuestion = (overrides = {}) => ({
  id: 'q1',
  order: 1,
  type: 'calculation',
  topic: 'Calculus - Differentiation',
  difficulty: 2,
  content: 'Differentiate x squared.',
  acceptKeywords: ['2x'],
  correctDisplay: '2x',
  errorType: 'method',
  hints: completeHints(),
  ...overrides,
})

const validExerciseSet = (overrides = {}) => ({
  taskId: 't1',
  title: 'Task set',
  subject: 'A-Level Math',
  questions: [validQuestion()],
  ...overrides,
})

const validVariant = (overrides = {}) => {
  const sourceQuestionId = overrides.sourceQuestionId || 'q-source'
  const exerciseSet = {
    ...validExerciseSet({
      id: 'variant-1',
      taskId: 'variant-task-1',
      title: 'Variant',
      sourceQuestionId,
      questions: [validQuestion({ id: 'variant-q1', variantOf: sourceQuestionId })],
    }),
    ...overrides.exerciseSet,
  }
  const task = overrides.task === null
    ? null
    : {
        id: 'variant-task-1',
        title: 'Variant',
        exerciseSetId: exerciseSet.id,
        type: 'ai_recommended',
        status: 'pending',
        sourceQuestionId,
        ...overrides.task,
      }
  return { exerciseSet, task }
}

const validError = (overrides = {}) => ({
  id: 'e1',
  questionId: 'q-error',
  subject: 'A-Level Math',
  errorType: 'calculation',
  questionSummary: 'Differentiate the function.',
  questionContent: 'Differentiate x squared.',
  errorDescription: 'A calculation slip.',
  relatedTopic: 'Calculus - Differentiation',
  topicId: 'calculus-differentiation',
  firstOccurredAt: '2026-08-01T00:00:00.000Z',
  lastOccurredAt: '2026-08-01T00:00:00.000Z',
  repeatCount: 1,
  status: 'pending_review',
  studentAnswer: 'x',
  correctAnswer: '2x',
  analysis: 'Apply the power rule.',
  acceptKeywords: ['2x'],
  redoHistory: [],
  verificationVariantId: null,
  variantVerifiedAt: null,
  ...overrides,
})

const scheduledErrorVariant = (error = validError({
  status: 'verification_due',
  redoHistory: [{ attemptedAt: '2026-08-06T00:00:00.000Z', answer: '2x', isCorrect: true, timeSpent: 20 }],
})) => {
  const generated = validVariant({
    sourceQuestionId: error.questionId,
    task: { verificationForErrorId: error.id },
  })
  return {
    ...generated,
    error: { ...error, verificationVariantId: generated.exerciseSet.id, variantVerifiedAt: null },
  }
}

function createApi(overrides = {}) {
  return {
    bootstrap: () => Promise.resolve(bootData),
    completeTask: () => Promise.resolve({ task: { id: 't1', status: 'completed' } }),
    reportTaskAdjustment: (_, request) => Promise.resolve({ request, task: { id: 't1', status: 'pending', adjustmentStatus: 'submitted' } }),
    createTask: (task) => Promise.resolve({ task }),
    addErrors: (items) => Promise.resolve({ errors: items }),
    upsertErrors: (items) => Promise.resolve({ errors: items }),
    getSessionSummary: () => Promise.resolve({ accuracy: 50, errorDistribution: { calculation: 1 } }),
    markErrorMastered: () => Promise.resolve({ error: { id: 'e1', status: 'mastered' } }),
    submitRedo: () => Promise.resolve({ error: { id: 'e1' } }),
    scheduleErrorVariant: () => Promise.resolve(scheduledErrorVariant()),
    verifyErrorVariant: (_, result) => Promise.resolve({
      error: validError({
        status: result.isCorrect ? 'verification_due' : 'reviewing',
        redoHistory: [{ attemptedAt: '2026-08-06T00:00:00.000Z', answer: '2x', isCorrect: true, timeSpent: 20 }],
        verificationVariantId: result.variantId,
        variantVerifiedAt: result.isCorrect ? result.verifiedAt : null,
        variantVerification: result,
      }),
    }),
    createNote: (note) => Promise.resolve({ note }),
    updateNote: () => Promise.resolve({ note: { id: 'n1' } }),
    getExerciseSet: (taskId) => Promise.resolve(validExerciseSet({ taskId })),
    getBankExerciseSet: (setId) => Promise.resolve(validExerciseSet({ id: setId, taskId: null, title: 'Bank set' })),
    submitSession: () => Promise.resolve({ sessionId: 's1' }),
    generateVariant: (sourceQuestionId) => Promise.resolve(validVariant({ sourceQuestionId })),
    updateSettings: () => Promise.resolve({ settings: bootData.settings }),
    ...overrides,
  }
}

function Probe() {
  const { bootStatus, bootError, retryBootstrap, completeTask, requestTaskAdjustment, isActionPending, tasks, taskAdjustments } = useApp()
  return (
    <div>
      <output data-testid="boot-status">{bootStatus}</output>
      <output data-testid="boot-error">{bootError?.message || ''}</output>
      <output data-testid="task-id">{tasks[0]?.id || ''}</output>
      <output data-testid="task-status">{tasks[0]?.status || ''}</output>
      <output data-testid="task-two-status">{tasks[1]?.status || ''}</output>
      <output data-testid="adjustment-count">{taskAdjustments.length}</output>
      <output data-testid="pending-complete">{String(isActionPending('task:complete:t1'))}</output>
      <button onClick={() => { retryBootstrap() }}>Retry</button>
      <button onClick={() => { completeTask('t1').catch(() => {}) }}>Complete</button>
      <button onClick={() => { requestTaskAdjustment(tasks[0], { reason: 'difficulty', details: '', availableMinutes: 20, proposedDueAt: '2026-08-08T10:00:00.000Z' }).catch(() => {}) }}>Adjust</button>
    </div>
  )
}

function renderProvider(api) {
  return render(
    <AppProvider services={createAppServices({
      apiClient: api,
      now: () => new Date('2026-08-06T00:00:00.000Z'),
      createId: () => 'generated-id',
    })}>
      <Probe />
    </AppProvider>,
  )
}

async function renderApp(api, serviceOverrides = {}) {
  let current
  function Capture() {
    current = useApp()
    return <output data-testid="capture-status">{current.bootStatus}</output>
  }
  const view = render(
    <AppProvider services={createAppServices({
      apiClient: api,
      now: () => new Date('2026-08-06T00:00:00.000Z'),
      createId: () => 'generated-id',
      ...serviceOverrides,
    })}>
      <Capture />
    </AppProvider>,
  )
  await screen.findByText('ready', { selector: '[data-testid="capture-status"]' })
  return { view, get app() { return current } }
}

test('deduplicates concurrent exercise loads, exposes the exact pending key, and caches the set', async () => {
  // Catches duplicate reads and cache commits that use the returned set ID instead of the requested task ID.
  let resolveLoad
  const getExerciseSet = vi.fn(() => new Promise((resolve) => { resolveLoad = resolve }))
  const harness = await renderApp(createApi({ getExerciseSet }))
  let first
  let second

  act(() => {
    first = harness.app.loadExerciseSet({ taskId: 't1' })
    second = harness.app.loadExerciseSet({ taskId: 't1' })
  })

  expect(second).toBe(first)
  expect(getExerciseSet).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(harness.app.isActionPending('exercise:load:t1')).toBe(true))
  const set = validExerciseSet({ taskId: 't1', title: 'Loaded set' })
  await act(async () => {
    resolveLoad(set)
    await Promise.all([first, second])
  })

  expect(harness.app.exerciseCache['task:t1']).toEqual(set)
  expect(harness.app.isActionPending('exercise:load:t1')).toBe(false)
  await expect(harness.app.loadExerciseSet({ taskId: 't1' })).resolves.toEqual(set)
  expect(getExerciseSet).toHaveBeenCalledTimes(1)
})

test('loads bank sets through the bank API and retries cleanly after a failed load', async () => {
  // Catches failed loads getting stuck in the in-flight map or dispatching to the wrong read endpoint.
  let attempts = 0
  const getBankExerciseSet = vi.fn((id) => {
    attempts += 1
    return attempts === 1
      ? Promise.reject(new Error('bank offline'))
      : Promise.resolve(validExerciseSet({ id, taskId: null, title: 'Bank set' }))
  })
  const harness = await renderApp(createApi({ getBankExerciseSet }))

  await act(async () => {
    await expect(harness.app.loadExerciseSet({ bankSetId: 'bq1' })).rejects.toThrow('bank offline')
  })
  expect(harness.app.exerciseCache['bank:bq1']).toBeUndefined()
  expect(harness.app.isActionPending('exercise:load:bq1')).toBe(false)

  await act(async () => {
    await expect(harness.app.loadExerciseSet({ bankSetId: 'bq1' })).resolves.toMatchObject({ id: 'bq1' })
  })
  expect(getBankExerciseSet).toHaveBeenCalledTimes(2)
  expect(harness.app.exerciseCache['bank:bq1']).toMatchObject({ id: 'bq1' })
})

test.each([
  ['a null question', validExerciseSet({ questions: [null] })],
  ['invalid choice options', validExerciseSet({ questions: [validQuestion({ type: 'choice', options: null, correctIndex: 0 })] })],
  ['missing hints', validExerciseSet({ questions: [validQuestion({ hints: null })] })],
])('rejects and never caches an exercise response with %s, then retries the same route', async (_, malformedSet) => {
  const recoveredSet = validExerciseSet({ taskId: 'invalid-task', title: 'Recovered set' })
  const getExerciseSet = vi.fn()
    .mockResolvedValueOnce(malformedSet)
    .mockResolvedValueOnce(recoveredSet)
  const harness = await renderApp(createApi({ getExerciseSet }))

  await act(async () => {
    await expect(harness.app.loadExerciseSet({ taskId: 'invalid-task' }))
      .rejects.toThrow('Exercise data is incomplete or invalid.')
  })
  expect(harness.app.exerciseCache['task:invalid-task']).toBeUndefined()
  expect(harness.app.isActionPending('exercise:load:invalid-task')).toBe(false)

  await act(async () => {
    await expect(harness.app.loadExerciseSet({ taskId: 'invalid-task' })).resolves.toEqual(recoveredSet)
  })
  expect(getExerciseSet).toHaveBeenCalledTimes(2)
  expect(harness.app.exerciseCache['task:invalid-task']).toEqual(recoveredSet)
})

test.each([
  ['a missing task ID', validExerciseSet({ taskId: undefined })],
  ['a different task ID', validExerciseSet({ taskId: 'another-task' })],
])('rejects a renderable task set with %s before caching, then retries the requested task', async (_, wrongSet) => {
  const recoveredSet = validExerciseSet({ taskId: 'expected-task', title: 'Expected task set' })
  const getExerciseSet = vi.fn()
    .mockResolvedValueOnce(wrongSet)
    .mockResolvedValueOnce(recoveredSet)
  const harness = await renderApp(createApi({ getExerciseSet }))

  await act(async () => {
    await expect(harness.app.loadExerciseSet({ taskId: 'expected-task' }))
      .rejects.toThrow('Exercise data is incomplete or invalid.')
  })
  expect(harness.app.exerciseCache['task:expected-task']).toBeUndefined()
  expect(harness.app.isActionPending('exercise:load:expected-task')).toBe(false)

  await act(async () => {
    await expect(harness.app.loadExerciseSet({ taskId: 'expected-task' })).resolves.toEqual(recoveredSet)
  })
  expect(getExerciseSet).toHaveBeenCalledTimes(2)
  expect(harness.app.exerciseCache['task:expected-task']).toEqual(recoveredSet)
})

test('accepts a renderable bank set without inventing a returned-ID provenance requirement', async () => {
  const bankSet = validExerciseSet({ id: undefined, taskId: undefined, title: 'ID-free bank set' })
  const getBankExerciseSet = vi.fn(() => Promise.resolve(bankSet))
  const harness = await renderApp(createApi({ getBankExerciseSet }))

  await act(async () => {
    await expect(harness.app.loadExerciseSet({ bankSetId: 'bank-route-id' })).resolves.toEqual(bankSet)
  })
  expect(harness.app.exerciseCache['bank:bank-route-id']).toEqual(bankSet)
})

test.each([
  ['task first', ['task', 'bank']],
  ['bank first', ['bank', 'task']],
])('keeps task and bank cache entries separate when the raw IDs match: %s', async (_, order) => {
  // Catches either source returning a cached set loaded through the other route.
  const getExerciseSet = vi.fn((id) => Promise.resolve(validExerciseSet({ kind: 'task', taskId: id })))
  const getBankExerciseSet = vi.fn((id) => Promise.resolve(validExerciseSet({ kind: 'bank', id, taskId: null, title: 'Bank set' })))
  const harness = await renderApp(createApi({ getExerciseSet, getBankExerciseSet }))
  const results = {}

  for (const source of order) {
    await act(async () => {
      results[source] = source === 'task'
        ? await harness.app.loadExerciseSet({ taskId: 'same' })
        : await harness.app.loadExerciseSet({ bankSetId: 'same' })
    })
  }

  expect(results.task).toMatchObject({ kind: 'task', taskId: 'same' })
  expect(results.bank).toMatchObject({ kind: 'bank', id: 'same' })
  expect(harness.app.exerciseCache['task:same']).toEqual(results.task)
  expect(harness.app.exerciseCache['bank:same']).toEqual(results.bank)
  expect(getExerciseSet).toHaveBeenCalledTimes(1)
  expect(getBankExerciseSet).toHaveBeenCalledTimes(1)
})

test('deduplicates same-source loads while task and bank collisions run independently under one public pending key', async () => {
  // Catches the shared raw ID deduping different sources or clearing public pending after only one source settles.
  let resolveTask
  let resolveBank
  const getExerciseSet = vi.fn(() => new Promise((resolve) => { resolveTask = resolve }))
  const getBankExerciseSet = vi.fn(() => new Promise((resolve) => { resolveBank = resolve }))
  const harness = await renderApp(createApi({ getExerciseSet, getBankExerciseSet }))
  let taskLoad
  let duplicateTaskLoad
  let bankLoad

  act(() => {
    taskLoad = harness.app.loadExerciseSet({ taskId: 'same' })
    duplicateTaskLoad = harness.app.loadExerciseSet({ taskId: 'same' })
    bankLoad = harness.app.loadExerciseSet({ bankSetId: 'same' })
  })

  expect(duplicateTaskLoad).toBe(taskLoad)
  expect(getExerciseSet).toHaveBeenCalledTimes(1)
  expect(getBankExerciseSet).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(harness.app.isActionPending('exercise:load:same')).toBe(true))

  await act(async () => {
    resolveTask(validExerciseSet({ kind: 'task', taskId: 'same' }))
    await taskLoad
  })
  expect(harness.app.isActionPending('exercise:load:same')).toBe(true)

  await act(async () => {
    resolveBank(validExerciseSet({ kind: 'bank', id: 'same', taskId: null, title: 'Bank set' }))
    await bankLoad
  })
  expect(harness.app.isActionPending('exercise:load:same')).toBe(false)
  expect(harness.app.exerciseCache['task:same']).toMatchObject({ kind: 'task' })
  expect(harness.app.exerciseCache['bank:same']).toMatchObject({ kind: 'bank' })
})

test('persists a session before completing its task and merges the returned task', async () => {
  // Catches session/task ordering reversal and completion results being ignored by task state.
  const events = []
  const api = createApi({
    submitSession: async (session) => { events.push(`session:${session.sessionId}`); return { sessionId: session.sessionId } },
    completeTask: async (id) => {
      events.push(`task:${id}`)
      return { task: { id, type: 'teacher_assigned', status: 'completed', completedAt: '2026-08-06T00:01:00.000Z' } }
    },
  })
  const harness = await renderApp(api)
  const session = { sessionId: 's-complete', taskId: 't1', completedAt: '2026-08-06T00:00:00.000Z', questions: [] }

  let operation
  act(() => { operation = harness.app.saveSession(session) })
  await waitFor(() => expect(harness.app.isActionPending('exercise:submit:s-complete')).toBe(true))
  await act(async () => { await operation })

  expect(events).toEqual(['session:s-complete', 'task:t1'])
  expect(harness.app.lastSession).toMatchObject({ sessionId: 's-complete', taskId: 't1' })
  expect(harness.app.tasks[0]).toMatchObject({ id: 't1', status: 'completed', completedAt: '2026-08-06T00:01:00.000Z' })
  expect(harness.app.isActionPending('exercise:submit:s-complete')).toBe(false)
})

test('keeps a saved session and safely retries task completion without submitting it twice', async () => {
  // Catches completion failure rolling back durable work or a retry colliding with duplicate session storage.
  const submitSession = vi.fn((session) => Promise.resolve({ sessionId: session.sessionId }))
  let completionAttempts = 0
  const completeTask = vi.fn((id) => {
    completionAttempts += 1
    return completionAttempts === 1
      ? Promise.reject(new Error('completion offline'))
      : Promise.resolve({ task: { id, type: 'teacher_assigned', status: 'completed' } })
  })
  const harness = await renderApp(createApi({ submitSession, completeTask }))
  const session = { sessionId: 's-retry', taskId: 't1', completedAt: '2026-08-06T00:00:00.000Z', questions: [] }

  await act(async () => {
    await expect(harness.app.saveSession(session)).resolves.toMatchObject({ completionPending: true })
  })
  expect(harness.app.lastSession).toMatchObject({ sessionId: 's-retry' })
  expect(harness.app.tasks[0]).toMatchObject({ id: 't1', status: 'pending' })
  expect(harness.app.toast).toMatchObject({ message: 'Session saved; task completion will retry' })

  await act(async () => {
    await expect(harness.app.saveSession(session)).resolves.toMatchObject({ completionPending: false })
  })
  expect(submitSession).toHaveBeenCalledTimes(1)
  expect(completeTask).toHaveBeenCalledTimes(2)
  expect(harness.app.tasks[0]).toMatchObject({ id: 't1', status: 'completed' })
})

test.each([
  ['bank failure before task success', ['bank', 'task']],
  ['task success before bank failure', ['task', 'bank']],
])('serializes every session so a rollback cannot overwrite a successful lastSession: %s', async (_, order) => {
  // Catches task and bank sessions using different collection queues and racing whole-state rollback snapshots.
  const starts = []
  const deferred = {}
  const submitSession = vi.fn((session) => {
    const kind = session.taskId ? 'task' : 'bank'
    starts.push(kind)
    return new Promise((resolve, reject) => { deferred[kind] = { resolve, reject } })
  })
  const harness = await renderApp(createApi({
    submitSession,
    completeTask: (id) => Promise.resolve({ task: { id, type: 'teacher_assigned', status: 'completed' } }),
  }))
  const sessions = {
    task: { sessionId: `s-task-${order[0]}`, taskId: 't1', completedAt: '2026-08-06T00:00:00.000Z', questions: [] },
    bank: { sessionId: `s-bank-${order[0]}`, taskId: null, completedAt: '2026-08-06T00:00:00.000Z', questions: [] },
  }
  const operations = {}

  act(() => {
    for (const kind of order) operations[kind] = harness.app.saveSession(sessions[kind])
  })
  const bankSettlement = operations.bank.catch((error) => error)

  expect(starts).toEqual([order[0]])
  const first = order[0]
  if (first === 'bank') {
    await act(async () => { deferred.bank.reject(new Error('bank failed')); await bankSettlement })
    await waitFor(() => expect(starts).toEqual(['bank', 'task']))
    await act(async () => { deferred.task.resolve({ sessionId: sessions.task.sessionId }); await operations.task })
  } else {
    await act(async () => { deferred.task.resolve({ sessionId: sessions.task.sessionId }); await operations.task })
    await waitFor(() => expect(starts).toEqual(['task', 'bank']))
    await act(async () => { deferred.bank.reject(new Error('bank failed')); await bankSettlement })
  }

  expect(harness.app.lastSession).toMatchObject({ sessionId: sessions.task.sessionId, taskId: 't1' })
  expect(harness.app.tasks.find((task) => task.id === 't1')).toMatchObject({ status: 'completed' })
})

test.each([
  ['task action first', ['task-action', 'session']],
  ['session first', ['session', 'task-action']],
])('serializes session completion with existing task actions: %s', async (_, order) => {
  // Catches a failed sibling task rollback restoring a snapshot from before the session completed t1.
  const starts = []
  let resolveSession
  let rejectTaskTwo
  const submitSession = vi.fn((session) => {
    starts.push(`submit:${session.taskId}`)
    return new Promise((resolve) => { resolveSession = resolve })
  })
  const completeTask = vi.fn((id) => {
    starts.push(`complete:${id}`)
    if (id === 't2') return new Promise((_, reject) => { rejectTaskTwo = reject })
    return Promise.resolve({ task: { id, type: 'teacher_assigned', status: 'completed' } })
  })
  const harness = await renderApp(createApi({
    bootstrap: () => Promise.resolve({
      ...bootData,
      tasks: [
        { id: 't1', type: 'teacher_assigned', status: 'pending' },
        { id: 't2', type: 'teacher_assigned', status: 'pending' },
      ],
    }),
    submitSession,
    completeTask,
  }))
  const session = { sessionId: 's-cross-task', taskId: 't1', completedAt: '2026-08-06T00:00:00.000Z', questions: [] }
  let sessionOperation
  let taskTwoSettlement

  act(() => {
    for (const operation of order) {
      if (operation === 'session') {
        sessionOperation = harness.app.saveSession(session)
      } else {
        taskTwoSettlement = harness.app.completeTask('t2').catch((error) => error)
      }
    }
  })

  expect(starts).toEqual([order[0] === 'session' ? 'submit:t1' : 'complete:t2'])
  if (order[0] === 'session') {
    await act(async () => {
      resolveSession({ sessionId: session.sessionId })
      await sessionOperation
    })
    await waitFor(() => expect(starts).toEqual(['submit:t1', 'complete:t1', 'complete:t2']))
    await act(async () => { rejectTaskTwo(new Error('t2 failed')); await taskTwoSettlement })
  } else {
    await act(async () => { rejectTaskTwo(new Error('t2 failed')); await taskTwoSettlement })
    await waitFor(() => expect(starts).toEqual(['complete:t2', 'submit:t1']))
    await act(async () => {
      resolveSession({ sessionId: session.sessionId })
      await sessionOperation
    })
  }

  expect(harness.app.lastSession).toMatchObject({ sessionId: session.sessionId, taskId: 't1' })
  expect(harness.app.tasks).toEqual([
    expect.objectContaining({ id: 't1', status: 'completed' }),
    expect.objectContaining({ id: 't2', status: 'pending' }),
  ])
  expect(submitSession).toHaveBeenCalledTimes(1)
  expect(harness.app.isActionPending('exercise:submit:s-cross-task')).toBe(false)
  expect(harness.app.isActionPending('task:complete:t2')).toBe(false)
})

test.each([
  ['null response', null],
  ['empty response', {}],
  ['wrong task id', { task: { id: 't2', status: 'completed' } }],
  ['pending task status', { task: { id: 't1', status: 'pending' } }],
])('keeps completion pending for a malformed completion result: %s', async (_, invalidCompletion) => {
  // Catches a resolved but unconfirmed completion being treated as success or merged into another task.
  let completionAttempt = 0
  const submitSession = vi.fn((session) => Promise.resolve({ sessionId: session.sessionId }))
  const completeTask = vi.fn(() => {
    completionAttempt += 1
    return Promise.resolve(completionAttempt === 1
      ? invalidCompletion
      : { task: { id: 't1', type: 'teacher_assigned', status: 'completed' } })
  })
  const harness = await renderApp(createApi({
    bootstrap: () => Promise.resolve({
      ...bootData,
      tasks: [
        { id: 't1', type: 'teacher_assigned', status: 'pending' },
        { id: 't2', type: 'teacher_assigned', status: 'pending' },
      ],
    }),
    submitSession,
    completeTask,
  }))
  const session = { sessionId: `s-invalid-${completionAttempt}-${String(invalidCompletion)}`, taskId: 't1', completedAt: '2026-08-06T00:00:00.000Z', questions: [] }

  await act(async () => {
    await expect(harness.app.saveSession(session)).resolves.toMatchObject({
      sessionId: session.sessionId,
      completionPending: true,
    })
  })
  expect(harness.app.lastSession).toMatchObject({ sessionId: session.sessionId })
  expect(harness.app.tasks).toEqual([
    expect.objectContaining({ id: 't1', status: 'pending' }),
    expect.objectContaining({ id: 't2', status: 'pending' }),
  ])
  expect(harness.app.toast).toMatchObject({ message: 'Session saved; task completion will retry' })

  await act(async () => {
    await expect(harness.app.saveSession(session)).resolves.toMatchObject({ completionPending: false })
  })
  expect(submitSession).toHaveBeenCalledTimes(1)
  expect(completeTask).toHaveBeenCalledTimes(2)
  expect(harness.app.tasks.find((task) => task.id === 't1')).toMatchObject({ status: 'completed' })
})

test('adopts a canonical session ID and retries it without another session POST', async () => {
  // Catches canonical IDs being shown but not remembered as already persisted.
  const submitSession = vi.fn(() => Promise.resolve({ sessionId: 'canonical-session' }))
  const harness = await renderApp(createApi({ submitSession }))
  const request = { sessionId: 'request-session', taskId: null, completedAt: '2026-08-06T00:00:00.000Z', questions: [] }

  let firstResult
  await act(async () => { firstResult = await harness.app.saveSession(request) })
  expect(firstResult).toMatchObject({ sessionId: 'canonical-session' })
  expect(harness.app.lastSession).toMatchObject({ sessionId: 'canonical-session' })

  await act(async () => {
    await expect(harness.app.saveSession(harness.app.lastSession)).resolves.toMatchObject({ sessionId: 'canonical-session' })
  })
  expect(submitSession).toHaveBeenCalledTimes(1)
})

test('indexes a successful save only under its canonical session ID', async () => {
  const submitSession = vi.fn(() => Promise.resolve({ sessionId: 'canonical-session' }))
  const harness = await renderApp(createApi({ submitSession }))
  const request = { sessionId: 'request-session', taskId: null, completedAt: '2026-08-06T00:00:00.000Z', questions: [] }

  await act(async () => { await harness.app.saveSession(request) })

  expect(harness.app.sessions['canonical-session']).toMatchObject({
    sessionId: 'canonical-session',
    taskId: null,
  })
  expect(harness.app.sessions['request-session']).toBeUndefined()
})

test('keeps bootstrapped sessions unchanged when persistence fails', async () => {
  const existingSession = { sessionId: 'existing-session', taskId: null, questions: [] }
  const harness = await renderApp(createApi({
    bootstrap: () => Promise.resolve({
      ...bootData,
      sessions: { 'existing-session': existingSession },
    }),
    submitSession: () => Promise.reject(new Error('session offline')),
  }))

  await act(async () => {
    await expect(harness.app.saveSession({ sessionId: 'failed-session', taskId: null, questions: [] }))
      .rejects.toThrow('session offline')
  })

  expect(harness.app.sessions).toEqual({ 'existing-session': existingSession })
  expect(harness.app.sessions['failed-session']).toBeUndefined()
})

test.each([
  ['null', null],
  ['empty object', {}],
  ['blank ID', { sessionId: '   ' }],
  ['mistyped ID', { sessionId: 42 }],
])('falls back to the request session ID for a malformed submit response: %s', async (_, response) => {
  // Catches durable session writes returning an unusable ID to the page/store.
  const submitSession = vi.fn(() => Promise.resolve(response))
  const harness = await renderApp(createApi({ submitSession }))
  const request = { sessionId: 'request-fallback', taskId: null, completedAt: '2026-08-06T00:00:00.000Z', questions: [] }

  let result
  await act(async () => { result = await harness.app.saveSession(request) })

  expect(result).toMatchObject({ sessionId: 'request-fallback', completionPending: false })
  expect(harness.app.lastSession).toMatchObject({ sessionId: 'request-fallback' })
  await act(async () => { await harness.app.saveSession(harness.app.lastSession) })
  expect(submitSession).toHaveBeenCalledTimes(1)
})

test('does not associate a canonical response ID that already belongs to another session', async () => {
  // Catches a conflicting server ID replacing the request identity and making retries target the wrong record.
  const submitSession = vi.fn(() => Promise.resolve({ sessionId: 'existing-session' }))
  const harness = await renderApp(createApi({
    bootstrap: () => Promise.resolve({
      ...bootData,
      sessions: { 'existing-session': { sessionId: 'existing-session', taskId: null } },
    }),
    submitSession,
  }))
  const request = { sessionId: 'new-request', taskId: null, completedAt: '2026-08-06T00:00:00.000Z', questions: [] }

  let result
  await act(async () => { result = await harness.app.saveSession(request) })

  expect(result).toMatchObject({ sessionId: 'new-request' })
  expect(harness.app.lastSession).toMatchObject({ sessionId: 'new-request' })
  await act(async () => { await harness.app.saveSession(harness.app.lastSession) })
  expect(submitSession).toHaveBeenCalledTimes(1)
})

test('rolls back lastSession when session persistence itself fails', async () => {
  // Catches optimistic session state being retained even though no durable save occurred.
  const harness = await renderApp(createApi({ submitSession: () => Promise.reject(new Error('session offline')) }))

  await act(async () => {
    await expect(harness.app.saveSession({ sessionId: 's-fail', taskId: 't1', questions: [] })).rejects.toThrow('session offline')
  })

  expect(harness.app.lastSession).toBeNull()
  expect(harness.app.tasks[0]).toMatchObject({ status: 'pending' })
  expect(harness.app.isActionPending('exercise:submit:s-fail')).toBe(false)
})

test('stores generated variants in cache and adds their task only once', async () => {
  // Catches an L6 response that is returned to the page but never becomes store-visible state.
  let resolveVariant
  const result = validVariant()
  const generateVariant = vi.fn(() => new Promise((resolve) => { resolveVariant = resolve }))
  const harness = await renderApp(createApi({ generateVariant }))
  const source = { id: 'q-source', topic: 'Calculus - Differentiation' }
  let first

  act(() => { first = harness.app.generateVariant(source) })
  await waitFor(() => expect(harness.app.isActionPending('exercise:variant:q-source')).toBe(true))
  await act(async () => { resolveVariant(result); await first })

  expect(generateVariant).toHaveBeenCalledWith('q-source')
  expect(harness.app.exerciseCache['set:variant-1']).toEqual(result.exerciseSet)
  expect(harness.app.tasks).toContainEqual(result.task)

  generateVariant.mockResolvedValueOnce(result)
  await act(async () => { await harness.app.generateVariant(source) })
  expect(harness.app.tasks.filter((task) => task.id === 'variant-task-1')).toHaveLength(1)
})

test.each([
  ['a missing task', () => validVariant({ sourceQuestionId: 'q-invalid-variant', task: null })],
  ['a missing task ID', () => validVariant({ sourceQuestionId: 'q-invalid-variant', task: { id: '' } })],
  ['a missing exercise-set ID', () => validVariant({ sourceQuestionId: 'q-invalid-variant', exerciseSet: { id: '' } })],
  ['a mismatched exercise-set ID', () => validVariant({ sourceQuestionId: 'q-invalid-variant', task: { exerciseSetId: 'another-set' } })],
  ['a non-recommended task type', () => validVariant({ sourceQuestionId: 'q-invalid-variant', task: { type: 'teacher_assigned' } })],
  ['a non-pending task status', () => validVariant({ sourceQuestionId: 'q-invalid-variant', task: { status: 'completed' } })],
  ['an empty generated question list', () => validVariant({ sourceQuestionId: 'q-invalid-variant', exerciseSet: { questions: [] } })],
  ['a missing set source', () => validVariant({ sourceQuestionId: 'q-invalid-variant', exerciseSet: { sourceQuestionId: undefined } })],
  ['the wrong set source', () => validVariant({ sourceQuestionId: 'q-invalid-variant', exerciseSet: { sourceQuestionId: 'another-source' } })],
  ['a missing task source', () => validVariant({ sourceQuestionId: 'q-invalid-variant', task: { sourceQuestionId: undefined } })],
  ['the wrong task source', () => validVariant({ sourceQuestionId: 'q-invalid-variant', task: { sourceQuestionId: 'another-source' } })],
  ['a missing question source', () => validVariant({ sourceQuestionId: 'q-invalid-variant', exerciseSet: { questions: [validQuestion({ id: 'variant-q1', variantOf: undefined })] } })],
  ['the wrong question source', () => validVariant({ sourceQuestionId: 'q-invalid-variant', exerciseSet: { questions: [validQuestion({ id: 'variant-q1', variantOf: 'another-source' })] } })],
])('rejects a generated variant with %s without mutating cache or tasks, then retries', async (_, makeMalformedResult) => {
  const recoveredResult = validVariant({ sourceQuestionId: 'q-invalid-variant' })
  const generateVariant = vi.fn()
    .mockResolvedValueOnce(makeMalformedResult())
    .mockResolvedValueOnce(recoveredResult)
  const harness = await renderApp(createApi({ generateVariant }))
  const originalTasks = [...harness.app.tasks]
  const source = { id: 'q-invalid-variant', topic: 'Calculus - Differentiation' }

  await act(async () => {
    await expect(harness.app.generateVariant(source))
      .rejects.toThrow('The generated variant is incomplete. Please try again.')
  })
  expect(harness.app.exerciseCache).toEqual({})
  expect(harness.app.tasks).toEqual(originalTasks)
  expect(harness.app.isActionPending('exercise:variant:q-invalid-variant')).toBe(false)

  await act(async () => {
    await expect(harness.app.generateVariant(source)).resolves.toEqual(recoveredResult)
  })
  expect(generateVariant).toHaveBeenCalledTimes(2)
  expect(harness.app.exerciseCache['set:variant-1']).toEqual(recoveredResult.exerciseSet)
  expect(harness.app.tasks).toContainEqual(recoveredResult.task)
})

test('does not consume a late exercise load after provider unmount', async () => {
  // Catches new exercise actions bypassing the existing mounted/action-generation guard.
  let resolveLoad
  let titleReads = 0
  const harness = await renderApp(createApi({
    getExerciseSet: () => new Promise((resolve) => { resolveLoad = resolve }),
  }))
  const operation = harness.app.loadExerciseSet({ taskId: 't1' })
  harness.view.unmount()

  await act(async () => {
    resolveLoad({ ...validExerciseSet({ taskId: 't1' }), get title() { titleReads += 1; return 'Late set' } })
    await operation
  })
  expect(titleReads).toBe(0)
})

test('exposes loading before bootstrap data becomes ready', async () => {
  // Catches a provider mutation that reports ready before data is available to consumers.
  renderProvider(createApi())

  expect(screen.getByTestId('boot-status')).toHaveTextContent('loading')
  await waitFor(() => expect(screen.getByTestId('boot-status')).toHaveTextContent('ready'))
  expect(screen.getByTestId('task-status')).toHaveTextContent('pending')
})

test('exposes a failed bootstrap and recovers to ready when retried', async () => {
  // Catches a bootstrap rejection that leaves consumers stuck in loading or cannot be retried.
  let attempt = 0
  renderProvider(createApi({
    bootstrap: () => {
      attempt += 1
      return attempt === 1 ? Promise.reject(new Error('offline')) : Promise.resolve(bootData)
    },
  }))

  expect(await screen.findByTestId('boot-status')).toHaveTextContent('error')
  expect(screen.getByTestId('boot-error')).toHaveTextContent('offline')

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(screen.getByTestId('boot-status')).toHaveTextContent('loading')
  expect(await screen.findByTestId('boot-status')).toHaveTextContent('ready')
})

test('ignores a stale bootstrap completion after a replacement service becomes ready', async () => {
  // Catches a stale bootstrap response that overwrites data from the current service.
  let resolveFirstBootstrap
  const firstServices = createAppServices({
    apiClient: createApi({ bootstrap: () => new Promise((resolve) => { resolveFirstBootstrap = resolve }) }),
    now: () => new Date('2026-08-06T00:00:00.000Z'),
    createId: () => 'first-id',
  })
  const secondServices = createAppServices({
    apiClient: createApi({ bootstrap: () => Promise.resolve({ ...bootData, tasks: [{ id: 'current-task', status: 'completed' }] }) }),
    now: () => new Date('2026-08-06T00:00:00.000Z'),
    createId: () => 'second-id',
  })
  const view = render(<AppProvider services={firstServices}><Probe /></AppProvider>)

  view.rerender(<AppProvider services={secondServices}><Probe /></AppProvider>)

  expect(await screen.findByTestId('boot-status')).toHaveTextContent('ready')
  expect(screen.getByTestId('task-id')).toHaveTextContent('current-task')

  await act(async () => {
    resolveFirstBootstrap({ ...bootData, tasks: [{ id: 'stale-task', status: 'pending' }] })
  })
  expect(screen.getByTestId('task-id')).toHaveTextContent('current-task')
})

test('does not consume deferred bootstrap data after the provider unmounts', async () => {
  // Characterizes the mounted/request guard: removing it reads late bootstrap data after unmount.
  let resolveBootstrap
  let collectionReads = 0
  const lateData = {
    get tasks() { collectionReads += 1; return [] },
    get errors() { collectionReads += 1; return [] },
    get notes() { collectionReads += 1; return [] },
    get noteFolders() { collectionReads += 1; return [] },
    get settings() { collectionReads += 1; return {} },
  }
  const view = renderProvider(createApi({
    bootstrap: () => new Promise((resolve) => { resolveBootstrap = resolve }),
  }))

  view.unmount()
  await act(async () => {
    resolveBootstrap(lateData)
  })

  expect(collectionReads).toBe(0)
})

test('serializes different task keys so one rollback cannot undo another successful task write', async () => {
  // Catches queues keyed only by action ID, which let a stale whole-task snapshot undo a sibling write.
  let rejectFirst
  let resolveSecond
  const starts = []
  const api = createApi({
    bootstrap: () => Promise.resolve({
      ...bootData,
      tasks: [{ id: 't1', status: 'pending' }, { id: 't2', status: 'pending' }],
    }),
    completeTask: (id) => new Promise((resolve, reject) => {
      starts.push(id)
      if (id === 't1') rejectFirst = reject
      else resolveSecond = resolve
    }),
  })

  function TwoTaskProbe() {
    const { tasks, completeTask } = useApp()
    return (
      <div>
        <output data-testid="t1-status">{tasks.find((task) => task.id === 't1')?.status}</output>
        <output data-testid="t2-status">{tasks.find((task) => task.id === 't2')?.status}</output>
        <button onClick={() => completeTask('t1').catch(() => {})}>Complete first</button>
        <button onClick={() => completeTask('t2').catch(() => {})}>Complete second</button>
      </div>
    )
  }

  render(
    <AppProvider services={createAppServices({ apiClient: api })}>
      <TwoTaskProbe />
    </AppProvider>,
  )
  await waitFor(() => expect(screen.getByTestId('t1-status')).toHaveTextContent('pending'))

  fireEvent.click(screen.getByRole('button', { name: 'Complete first' }))
  fireEvent.click(screen.getByRole('button', { name: 'Complete second' }))
  expect(starts).toEqual(['t1'])

  await act(async () => { rejectFirst(new Error('first failed')) })
  await waitFor(() => expect(starts).toEqual(['t1', 't2']))
  await act(async () => { resolveSecond({ task: { id: 't2', status: 'completed' } }) })

  await waitFor(() => expect(screen.getByTestId('t2-status')).toHaveTextContent('completed'))
  expect(screen.getByTestId('t1-status')).toHaveTextContent('pending')
})

test('allows writes to different collections to start concurrently', async () => {
  // Characterizes collection-scoped queues: replacing them with one global queue blocks unrelated writes.
  let resolveTask
  let resolveNote
  const starts = []
  const api = createApi({
    completeTask: () => new Promise((resolve) => { starts.push('tasks'); resolveTask = resolve }),
    createNote: () => new Promise((resolve) => { starts.push('notes'); resolveNote = resolve }),
  })

  function CrossCollectionProbe() {
    const { bootStatus, completeTask, addNote } = useApp()
    return (
      <div>
        <output>{bootStatus}</output>
        <button onClick={() => completeTask('t1').catch(() => {})}>Complete task</button>
        <button onClick={() => addNote({ title: 'Concurrent note' }).catch(() => {})}>Create note</button>
      </div>
    )
  }

  render(
    <AppProvider services={createAppServices({
      apiClient: api,
      createId: () => 'concurrent-note',
      now: () => new Date('2026-08-06T00:00:00.000Z'),
    })}>
      <CrossCollectionProbe />
    </AppProvider>,
  )
  await screen.findByText('ready')
  fireEvent.click(screen.getByRole('button', { name: 'Complete task' }))
  fireEvent.click(screen.getByRole('button', { name: 'Create note' }))

  expect(starts).toEqual(['tasks', 'notes'])
  await act(async () => {
    resolveTask({ task: { id: 't1', status: 'completed' } })
    resolveNote({ note: { id: 'concurrent-note' } })
  })
})

test('authors task/error/note/session IDs and reads the injected clock once for each timestamped action', async () => {
  // Catches caller-provided/global IDs or repeated clock reads producing inconsistent action metadata.
  const calls = { task: null, errors: null, redo: null, note: null, session: null }
  const api = createApi({
    createTask: async (task) => { calls.task = task; return { task } },
    addErrors: async (errors) => { calls.errors = errors; return { errors } },
    submitRedo: async (_, attempt) => { calls.redo = attempt; return { error: { id: 'e1' } } },
    createNote: async (note) => { calls.note = note; return { note } },
    submitSession: async (session) => { calls.session = session; return { sessionId: session.sessionId } },
  })
  let nowCalls = 0
  let idCalls = 0
  const services = createAppServices({
    apiClient: api,
    now: () => { nowCalls += 1; return new Date('2026-08-06T12:34:56.000Z') },
    createId: () => `generated-${++idCalls}`,
  })
  let actions

  function CreationProbe() {
    const app = useApp()
    actions = app
    return <output>{app.bootStatus}</output>
  }

  render(<AppProvider services={services}><CreationProbe /></AppProvider>)
  await screen.findByText('ready')
  const bootClockReads = nowCalls

  await act(async () => {
    await actions.addTask({ title: 'Task' })
    await actions.addErrors([{ questionId: 'q-new', redoHistory: [] }])
    await actions.recordRedo('e1', { answer: 'x', isCorrect: false, timeSpent: 1 })
    await actions.addNote({ title: 'Note' })
    await actions.saveSession({ questions: [{ result: { attempts: [{ answer: 'x', isCorrect: false }] } }] })
  })

  expect(calls.task.id).toBe('generated-1')
  expect(calls.errors[0]).toMatchObject({ id: 'generated-2', firstOccurredAt: '2026-08-06', lastOccurredAt: '2026-08-06' })
  expect(calls.redo.attemptedAt).toBe('2026-08-06T12:34:56.000Z')
  expect(calls.note).toMatchObject({ id: 'generated-3', createdAt: '2026-08-06', updatedAt: '2026-08-06' })
  expect(calls.session).toMatchObject({ sessionId: 'generated-4', completedAt: '2026-08-06T12:34:56.000Z' })
  expect(calls.session.questions[0].result.attempts[0].submittedAt).toBe('2026-08-06T12:34:56.000Z')
  expect(nowCalls - bootClockReads).toBe(4)
})

test('settles a deferred provider action without consuming success data after unmount', async () => {
  // Characterizes the action generation guard: removing it runs the note commit after unmount.
  let resolveCreate
  let operation
  let noteReads = 0
  const api = createApi({
    createNote: () => new Promise((resolve) => { resolveCreate = resolve }),
  })

  function AddNoteProbe() {
    const { bootStatus, addNote } = useApp()
    return <button onClick={() => { operation = addNote({ title: 'Late note' }) }}>{bootStatus}</button>
  }

  const view = render(
    <AppProvider services={createAppServices({ apiClient: api, createId: () => 'late-note', now: () => new Date('2026-08-06T00:00:00.000Z') })}>
      <AddNoteProbe />
    </AppProvider>,
  )
  await screen.findByRole('button', { name: 'ready' })
  fireEvent.click(screen.getByRole('button', { name: 'ready' }))
  view.unmount()

  await act(async () => {
    resolveCreate({ get note() { noteReads += 1; return { id: 'server-note' } } })
  })
  await expect(operation).resolves.toBeDefined()
  expect(noteReads).toBe(0)
})

test('settles a deferred provider rejection without reading it for rollback toast after unmount', async () => {
  // Characterizes late rejection guarding while ensuring queue-finally keeps the caller Promise settled.
  let rejectCreate
  let operation
  let messageReads = 0
  const failure = { get message() { messageReads += 1; return 'late failure' } }
  const api = createApi({
    createNote: () => new Promise((_, reject) => { rejectCreate = reject }),
  })

  function AddNoteProbe() {
    const { bootStatus, addNote } = useApp()
    return <button onClick={() => { operation = addNote({ title: 'Late note' }) }}>{bootStatus}</button>
  }

  const view = render(
    <AppProvider services={createAppServices({ apiClient: api, createId: () => 'late-note', now: () => new Date('2026-08-06T00:00:00.000Z') })}>
      <AddNoteProbe />
    </AppProvider>,
  )
  await screen.findByRole('button', { name: 'ready' })
  fireEvent.click(screen.getByRole('button', { name: 'ready' }))
  const settlement = operation.then(
    (value) => ({ value }),
    (error) => ({ error }),
  )
  view.unmount()

  await act(async () => { rejectCreate(failure) })
  expect((await settlement).error).toBe(failure)
  expect(messageReads).toBe(0)
})

test('keeps completed tasks in state and commits the persisted completion timestamp', async () => {
  // Catches a completion flow that filters history away or ignores the server's completedAt field.
  const api = createApi({
    completeTask: () => Promise.resolve({ task: { id: 't1', status: 'completed', completedAt: '2026-08-06T12:00:00.000Z', isOverdue: false } }),
  })
  renderProvider(api)
  await screen.findByText('ready', { selector: '[data-testid="boot-status"]' })

  fireEvent.click(screen.getByRole('button', { name: 'Complete' }))

  await waitFor(() => expect(screen.getByTestId('task-status')).toHaveTextContent('completed'))
  expect(screen.getByTestId('task-id')).toHaveTextContent('t1')
})

test('builds and optimistically persists an adjustment request with injected services', async () => {
  // Catches a store action that forwards UI draft data instead of building the domain request and state.
  let requestCall
  const api = createApi({
    reportTaskAdjustment: (_, request) => {
      requestCall = request
      return Promise.resolve({ request, task: { id: 't1', status: 'pending', adjustmentStatus: 'submitted' } })
    },
  })
  renderProvider(api)
  await screen.findByText('ready', { selector: '[data-testid="boot-status"]' })

  fireEvent.click(screen.getByRole('button', { name: 'Adjust' }))

  await waitFor(() => expect(screen.getByTestId('adjustment-count')).toHaveTextContent('1'))
  expect(requestCall).toEqual({
    id: 'generated-id', taskId: 't1', reason: 'difficulty', details: '', availableMinutes: 20,
    proposedDueAt: '2026-08-08T10:00:00.000Z', createdAt: '2026-08-06T00:00:00.000Z', status: 'submitted',
  })
})

test('rejects a duplicate task action and rolls back an adjustment failure without losing the task', async () => {
  // Catches duplicate task writes and a failed adjustment that leaves an optimistic request/task mutation behind.
  let rejectAdjustment
  const api = createApi({
    reportTaskAdjustment: () => new Promise((_, reject) => { rejectAdjustment = reject }),
  })
  let actions
  function AdjustmentProbe() {
    actions = useApp()
    return <output>{actions.bootStatus}</output>
  }
  render(<AppProvider services={createAppServices({
    apiClient: api,
    now: () => new Date('2026-08-06T00:00:00.000Z'),
    createId: () => 'generated-id',
  })}><AdjustmentProbe /></AppProvider>)
  await screen.findByText('ready')
  const draft = { reason: 'difficulty', details: '', availableMinutes: 20, proposedDueAt: '2026-08-08T10:00:00.000Z' }
  const first = actions.requestTaskAdjustment(actions.tasks[0], draft)
  const firstSettlement = first.catch((error) => error)

  await expect(actions.requestTaskAdjustment(actions.tasks[0], draft)).rejects.toThrow('already in progress')
  await waitFor(() => expect(actions.tasks).toMatchObject([{ id: 't1', status: 'pending', adjustmentStatus: 'submitted' }]))
  expect(actions.taskAdjustments).toHaveLength(1)

  await act(async () => { rejectAdjustment(new Error('offline')) })
  expect((await firstSettlement).message).toBe('offline')
  expect(actions.tasks).toMatchObject([{ id: 't1', status: 'pending' }])
  expect(actions.taskAdjustments).toEqual([])
})

test.each([
  ['completed teacher task', { id: 't1', type: 'teacher_assigned', status: 'completed' }],
  ['pending non-teacher task', { id: 't1', type: 'error_review', status: 'pending' }],
  ['teacher task with a submitted adjustment', { id: 't1', type: 'teacher_assigned', status: 'pending', adjustmentStatus: 'submitted' }],
])('rejects adjustment for a %s without mutating or calling the API', async (_, task) => {
  const reportTaskAdjustment = vi.fn(() => Promise.resolve({}))
  let actions
  function EligibilityProbe() {
    actions = useApp()
    return <output>{actions.bootStatus}</output>
  }
  render(<AppProvider services={createAppServices({
    apiClient: createApi({
      bootstrap: () => Promise.resolve({ ...bootData, tasks: [task] }),
      reportTaskAdjustment,
    }),
    now: () => new Date('2026-08-06T00:00:00.000Z'),
    createId: () => 'generated-id',
  })}><EligibilityProbe /></AppProvider>)
  await screen.findByText('ready')
  const before = actions.tasks[0]
  const draft = { reason: 'difficulty', details: '', availableMinutes: 20, proposedDueAt: '2026-08-08T10:00:00.000Z' }

  await expect(actions.requestTaskAdjustment(actions.tasks[0], draft)).rejects.toThrow(/pending teacher-assigned task/i)

  expect(reportTaskAdjustment).not.toHaveBeenCalled()
  expect(actions.tasks[0]).toEqual(before)
  expect(actions.taskAdjustments).toEqual([])
})

test('rejects a second adjustment after the first submitted request settles', async () => {
  const reportTaskAdjustment = vi.fn((_, request) => Promise.resolve({
    request,
    task: { id: 't1', type: 'teacher_assigned', status: 'pending', adjustmentStatus: 'submitted' },
  }))
  let actions
  function RepeatProbe() {
    actions = useApp()
    return <output>{actions.bootStatus}</output>
  }
  render(<AppProvider services={createAppServices({
    apiClient: createApi({ reportTaskAdjustment }),
    now: () => new Date('2026-08-06T00:00:00.000Z'),
    createId: () => `generated-${reportTaskAdjustment.mock.calls.length + 1}`,
  })}><RepeatProbe /></AppProvider>)
  await screen.findByText('ready')
  const draft = { reason: 'difficulty', details: '', availableMinutes: 20, proposedDueAt: '2026-08-08T10:00:00.000Z' }

  await act(async () => { await actions.requestTaskAdjustment(actions.tasks[0], draft) })
  await expect(actions.requestTaskAdjustment(actions.tasks[0], draft)).rejects.toThrow(/pending teacher-assigned task/i)

  expect(reportTaskAdjustment).toHaveBeenCalledTimes(1)
  expect(actions.tasks[0]).toMatchObject({ status: 'pending', adjustmentStatus: 'submitted' })
  expect(actions.taskAdjustments).toHaveLength(1)
})

test('loads and caches one exact session summary under its required pending key', async () => {
  // Catches duplicate summary reads, the wrong cache key, or pending state clearing before the request settles.
  let resolveSummary
  const getSessionSummary = vi.fn(() => new Promise((resolve) => { resolveSummary = resolve }))
  const harness = await renderApp(createApi({ getSessionSummary }))
  let first
  let duplicate

  act(() => {
    first = harness.app.loadSessionSummary('session/one')
    duplicate = harness.app.loadSessionSummary('session/one')
  })
  await expect(duplicate).rejects.toThrow('already in progress')
  await waitFor(() => expect(harness.app.isActionPending('summary:session/one')).toBe(true))
  const summary = { accuracy: 50, errorDistribution: { calculation: 1 }, wrongQuestions: [{ id: 'q1' }] }
  await act(async () => {
    resolveSummary(summary)
    await first
  })

  expect(getSessionSummary).toHaveBeenCalledTimes(1)
  expect(harness.app.sessionSummaries['session/one']).toEqual(summary)
  expect(harness.app.isActionPending('summary:session/one')).toBe(false)
  await expect(harness.app.loadSessionSummary('session/one')).resolves.toEqual(summary)
  expect(getSessionSummary).toHaveBeenCalledTimes(1)
})

test('preserves an existing summary and clears pending when a refresh request fails', async () => {
  // Catches a failed summary load erasing another session's cached diagnostic data.
  const getSessionSummary = vi.fn((id) => (
    id === 'session-ok'
      ? Promise.resolve({ accuracy: 100, errorDistribution: {} })
      : Promise.reject(new Error('summary offline'))
  ))
  const harness = await renderApp(createApi({ getSessionSummary }))
  await act(async () => { await harness.app.loadSessionSummary('session-ok') })

  await act(async () => {
    await expect(harness.app.loadSessionSummary('session-fail')).rejects.toThrow('summary offline')
  })
  expect(harness.app.sessionSummaries).toEqual({
    'session-ok': { accuracy: 100, errorDistribution: {} },
  })
  expect(harness.app.isActionPending('summary:session-fail')).toBe(false)
})

test('optimistically merges session errors idempotently and rolls back the whole merge on API failure', async () => {
  // Catches recurrence retries duplicating cards or a failed batch leaving optimistic evidence behind.
  let rejectUpsert
  const existing = validError({
    occurrenceKeys: ['session:s1:question:q-error'],
    occurrenceRecords: [{ key: 'session:s1:question:q-error', occurredAt: '2026-08-01T00:00:00.000Z' }],
    occurrences: ['2026-08-01T00:00:00.000Z'],
  })
  const incoming = validError({
    id: 'incoming-id',
    firstOccurredAt: '2026-08-06T00:00:00.000Z',
    lastOccurredAt: '2026-08-06T00:00:00.000Z',
    occurrenceKeys: ['session:s2:question:q-error'],
    occurrenceRecords: [{ key: 'session:s2:question:q-error', occurredAt: '2026-08-06T00:00:00.000Z' }],
    occurrences: ['2026-08-06T00:00:00.000Z'],
  })
  const upsertErrors = vi.fn(() => new Promise((_, reject) => { rejectUpsert = reject }))
  const harness = await renderApp(createApi({
    bootstrap: () => Promise.resolve({ ...bootData, errors: [existing] }),
    upsertErrors,
  }))
  let operation

  act(() => { operation = harness.app.addSessionErrors([incoming]) })
  await waitFor(() => expect(harness.app.isActionPending('errors:add')).toBe(true))
  expect(harness.app.errors).toHaveLength(1)
  expect(harness.app.errors[0]).toMatchObject({ id: 'e1', repeatCount: 2 })
  await expect(harness.app.addSessionErrors([incoming])).rejects.toThrow('already in progress')

  await act(async () => {
    rejectUpsert(new Error('errors offline'))
    await operation.catch(() => undefined)
  })
  expect(harness.app.errors).toEqual([existing])
  expect(harness.app.isActionPending('errors:add')).toBe(false)
})

test('commits the canonical persisted error collection returned by an upsert', async () => {
  // Catches the store retaining an optimistic incoming ID instead of the server's canonical card identity.
  const canonical = validError({ id: 'canonical-id', questionId: 'q-canonical' })
  const harness = await renderApp(createApi({
    upsertErrors: () => Promise.resolve({ errors: [canonical] }),
  }))

  await act(async () => {
    await harness.app.addSessionErrors([validError({ id: 'temporary-id', questionId: 'q-canonical' })])
  })
  expect(harness.app.errors).toEqual([canonical])
})

test('records a redo with the injected clock, exact pending key, canonical commit, and rollback', async () => {
  // Catches the store using legacy review transitions or failing to restore verification evidence after rejection.
  let rejectRedo
  const original = validError({ verificationVariantId: 'old-variant', variantVerifiedAt: '2026-08-02' })
  const submitRedo = vi.fn(() => new Promise((_, reject) => { rejectRedo = reject }))
  const harness = await renderApp(createApi({
    bootstrap: () => Promise.resolve({ ...bootData, errors: [original] }),
    submitRedo,
  }))
  let operation

  act(() => {
    operation = harness.app.recordRedo('e1', { answer: '2x', isCorrect: true, timeSpent: 20 })
  })
  await waitFor(() => expect(harness.app.isActionPending('error:redo:e1')).toBe(true))
  expect(harness.app.errors[0]).toMatchObject({
    status: 'verification_due',
    verificationVariantId: null,
    variantVerifiedAt: null,
    redoHistory: [expect.objectContaining({ attemptedAt: '2026-08-06T00:00:00.000Z', isCorrect: true })],
  })
  await expect(harness.app.recordRedo('e1', { answer: '2x', isCorrect: true, timeSpent: 20 }))
    .rejects.toThrow('already in progress')

  await act(async () => {
    rejectRedo(new Error('redo offline'))
    await operation.catch(() => undefined)
  })
  expect(harness.app.errors).toEqual([original])
  expect(harness.app.isActionPending('error:redo:e1')).toBe(false)
})

test('atomically consumes a provenance-checked scheduled variant and rolls back malformed or failed responses', async () => {
  // Catches caching an unrelated task/set or linking the error before all three persisted entities agree.
  const due = validError({
    status: 'verification_due',
    redoHistory: [{ attemptedAt: '2026-08-06T00:00:00.000Z', answer: '2x', isCorrect: true, timeSpent: 20 }],
  })
  const good = scheduledErrorVariant(due)
  const scheduleErrorVariant = vi.fn()
    .mockResolvedValueOnce({ ...good, task: { ...good.task, verificationForErrorId: 'another-error' } })
    .mockResolvedValueOnce(good)
  const harness = await renderApp(createApi({
    bootstrap: () => Promise.resolve({ ...bootData, errors: [due] }),
    scheduleErrorVariant,
  }))

  await act(async () => {
    await expect(harness.app.scheduleErrorVariant('e1')).rejects.toThrow('The generated verification variant is incomplete. Please try again.')
  })
  expect(harness.app.errors).toEqual([due])
  expect(harness.app.exerciseCache).toEqual({})
  expect(harness.app.tasks).toEqual(bootData.tasks)
  expect(harness.app.isActionPending('error:variant:e1')).toBe(false)

  await act(async () => { await harness.app.scheduleErrorVariant('e1') })
  expect(harness.app.errors).toEqual([good.error])
  expect(harness.app.exerciseCache[`set:${good.exerciseSet.id}`]).toEqual(good.exerciseSet)
  expect(harness.app.tasks).toContainEqual(good.task)
  expect(harness.app.isActionPending('error:variant:e1')).toBe(false)
})

test('does not roll back an unrelated task write when scheduling a verification variant fails', async () => {
  // Catches an error-collection request restoring a stale task snapshot even though it made no optimistic task edit.
  const due = validError({
    status: 'verification_due',
    redoHistory: [{ attemptedAt: '2026-08-06T00:00:00.000Z', answer: '2x', isCorrect: true, timeSpent: 20 }],
  })
  let rejectSchedule
  const scheduleErrorVariant = () => new Promise((_, reject) => { rejectSchedule = reject })
  const harness = await renderApp(createApi({
    bootstrap: () => Promise.resolve({ ...bootData, errors: [due] }),
    scheduleErrorVariant,
    completeTask: (id) => Promise.resolve({ task: { id, type: 'teacher_assigned', status: 'completed' } }),
  }))
  const schedule = harness.app.scheduleErrorVariant('e1').catch((error) => error)

  await act(async () => { await harness.app.completeTask('t1') })
  expect(harness.app.tasks[0].status).toBe('completed')
  await act(async () => { rejectSchedule(new Error('variant offline')); await schedule })

  expect(harness.app.tasks[0].status).toBe('completed')
  expect(harness.app.errors).toEqual([due])
})

test('verifies the linked variant optimistically and rejects mastery until complete evidence exists', async () => {
  // Catches mastery being reachable from a correct redo alone or the exact gate message being hidden.
  const due = validError({
    status: 'verification_due',
    redoHistory: [{ attemptedAt: '2026-08-06T00:00:00.000Z', answer: '2x', isCorrect: true, timeSpent: 20 }],
    verificationVariantId: 'variant-1',
  })
  const verifyErrorVariant = vi.fn((_, result) => Promise.resolve({
    error: {
      ...due,
      variantVerifiedAt: result.verifiedAt,
      variantVerification: result,
    },
  }))
  const markErrorMastered = vi.fn(() => Promise.resolve({ error: { ...due, status: 'mastered' } }))
  const harness = await renderApp(createApi({
    bootstrap: () => Promise.resolve({ ...bootData, errors: [due] }),
    verifyErrorVariant,
    markErrorMastered,
  }))

  await expect(harness.app.markErrorMastered('e1')).rejects.toThrow('Complete the independent variant before marking this mastered')
  expect(markErrorMastered).not.toHaveBeenCalled()

  await act(async () => {
    await harness.app.verifyErrorVariant('e1', { variantId: 'variant-1', isCorrect: true })
  })
  expect(verifyErrorVariant).toHaveBeenCalledWith('e1', {
    variantId: 'variant-1',
    isCorrect: true,
    verifiedAt: '2026-08-06T00:00:00.000Z',
  })
  expect(harness.app.errors[0]).toMatchObject({
    variantVerifiedAt: '2026-08-06T00:00:00.000Z',
    variantVerification: { variantId: 'variant-1', isCorrect: true },
  })
  expect(harness.app.isActionPending('error:variant:e1')).toBe(false)

  await act(async () => { await harness.app.markErrorMastered('e1') })
  expect(markErrorMastered).toHaveBeenCalledTimes(1)
  expect(harness.app.isActionPending('error:master:e1')).toBe(false)
})

test('rolls back a valid optimistic mastery transition when the API rejects it', async () => {
  // Catches the UI displaying mastered after the backend rechecks and rejects the gate.
  const verified = validError({
    status: 'verification_due',
    redoHistory: [{ attemptedAt: '2026-08-06T00:00:00.000Z', answer: '2x', isCorrect: true, timeSpent: 20 }],
    verificationVariantId: 'variant-1',
    variantVerifiedAt: '2026-08-06T00:01:00.000Z',
    variantVerification: { variantId: 'variant-1', isCorrect: true, verifiedAt: '2026-08-06T00:01:00.000Z' },
  })
  let rejectMastery
  const harness = await renderApp(createApi({
    bootstrap: () => Promise.resolve({ ...bootData, errors: [verified] }),
    markErrorMastered: () => new Promise((_, reject) => { rejectMastery = reject }),
  }))
  let operation

  act(() => { operation = harness.app.markErrorMastered('e1') })
  await waitFor(() => expect(harness.app.isActionPending('error:master:e1')).toBe(true))
  expect(harness.app.errors[0].status).toBe('mastered')
  await act(async () => {
    rejectMastery(new Error('mastery rejected'))
    await operation.catch(() => undefined)
  })
  expect(harness.app.errors).toEqual([verified])
  expect(harness.app.isActionPending('error:master:e1')).toBe(false)
})
