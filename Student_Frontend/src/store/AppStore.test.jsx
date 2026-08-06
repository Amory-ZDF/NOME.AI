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

function createApi(overrides = {}) {
  return {
    bootstrap: () => Promise.resolve(bootData),
    completeTask: () => Promise.resolve({ task: { id: 't1', status: 'completed' } }),
    reportTaskAdjustment: (_, request) => Promise.resolve({ request, task: { id: 't1', status: 'pending', adjustmentStatus: 'submitted' } }),
    createTask: (task) => Promise.resolve({ task }),
    addErrors: (items) => Promise.resolve({ errors: items }),
    markErrorMastered: () => Promise.resolve({ error: { id: 'e1', status: 'mastered' } }),
    submitRedo: () => Promise.resolve({ error: { id: 'e1' } }),
    createNote: (note) => Promise.resolve({ note }),
    updateNote: () => Promise.resolve({ note: { id: 'n1' } }),
    getExerciseSet: (taskId) => Promise.resolve({ taskId, title: 'Task set', subject: 'Math', questions: [] }),
    getBankExerciseSet: (setId) => Promise.resolve({ id: setId, taskId: null, title: 'Bank set', subject: 'Math', questions: [] }),
    submitSession: () => Promise.resolve({ sessionId: 's1' }),
    generateVariant: () => Promise.resolve({
      exerciseSet: { id: 'variant-1', taskId: 'variant-task-1', title: 'Variant', subject: 'Math', questions: [] },
      task: { id: 'variant-task-1', status: 'pending' },
    }),
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
  const set = { taskId: 't1', title: 'Loaded set', subject: 'Math', questions: [{ id: 'q1' }] }
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
      : Promise.resolve({ id, title: 'Bank set', subject: 'Math', questions: [] })
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
  ['task first', ['task', 'bank']],
  ['bank first', ['bank', 'task']],
])('keeps task and bank cache entries separate when the raw IDs match: %s', async (_, order) => {
  // Catches either source returning a cached set loaded through the other route.
  const getExerciseSet = vi.fn((id) => Promise.resolve({ kind: 'task', taskId: id, questions: [] }))
  const getBankExerciseSet = vi.fn((id) => Promise.resolve({ kind: 'bank', id, questions: [] }))
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
    resolveTask({ kind: 'task', taskId: 'same', questions: [] })
    await taskLoad
  })
  expect(harness.app.isActionPending('exercise:load:same')).toBe(true)

  await act(async () => {
    resolveBank({ kind: 'bank', id: 'same', questions: [] })
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
  const result = {
    exerciseSet: { id: 'variant-1', taskId: 'variant-task-1', title: 'Variant', subject: 'Math', questions: [] },
    task: { id: 'variant-task-1', type: 'ai_recommended', status: 'pending' },
  }
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
    resolveLoad({ taskId: 't1', get title() { titleReads += 1; return 'Late set' }, questions: [] })
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
