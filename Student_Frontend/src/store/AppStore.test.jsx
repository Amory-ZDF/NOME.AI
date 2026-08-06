import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test } from 'vitest'
import { AppProvider, useApp } from './AppStore'
import { createAppServices } from './services'

const bootData = {
  tasks: [{ id: 't1', status: 'pending' }],
  errors: [],
  notes: [],
  noteFolders: [],
  settings: { tone: 50 },
}

function createApi(overrides = {}) {
  return {
    bootstrap: () => Promise.resolve(bootData),
    completeTask: () => Promise.resolve({ task: { id: 't1', status: 'completed' } }),
    reportTaskAdjustment: () => Promise.resolve({ task: { id: 't1', status: 'adjustment_requested' } }),
    createTask: (task) => Promise.resolve({ task }),
    addErrors: (items) => Promise.resolve({ errors: items }),
    markErrorMastered: () => Promise.resolve({ error: { id: 'e1', status: 'mastered' } }),
    submitRedo: () => Promise.resolve({ error: { id: 'e1' } }),
    createNote: (note) => Promise.resolve({ note }),
    updateNote: () => Promise.resolve({ note: { id: 'n1' } }),
    submitSession: () => Promise.resolve({ sessionId: 's1' }),
    updateSettings: () => Promise.resolve({ settings: bootData.settings }),
    ...overrides,
  }
}

function Probe() {
  const { bootStatus, bootError, retryBootstrap, completeTask, isActionPending, tasks } = useApp()
  return (
    <div>
      <output data-testid="boot-status">{bootStatus}</output>
      <output data-testid="boot-error">{bootError?.message || ''}</output>
      <output data-testid="task-id">{tasks[0]?.id || ''}</output>
      <output data-testid="task-status">{tasks[0]?.status || ''}</output>
      <output data-testid="task-two-status">{tasks[1]?.status || ''}</output>
      <output data-testid="pending-complete">{String(isActionPending('completeTask:t1'))}</output>
      <button onClick={() => { retryBootstrap() }}>Retry</button>
      <button onClick={() => { completeTask('t1').catch(() => {}) }}>Complete</button>
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

test('keeps a duplicate action pending until every in-flight write settles', async () => {
  // Catches Set cleanup that clears an action key after the first of duplicate writes settles.
  const resolvers = []
  const api = createApi({
    completeTask: () => new Promise((resolve) => resolvers.push(resolve)),
  })
  renderProvider(api)
  await screen.findByText('ready', { selector: '[data-testid="boot-status"]' })

  fireEvent.click(screen.getByRole('button', { name: 'Complete' }))
  fireEvent.click(screen.getByRole('button', { name: 'Complete' }))
  expect(screen.getByTestId('pending-complete')).toHaveTextContent('true')

  resolvers[0]({ task: { id: 't1', status: 'completed' } })
  await waitFor(() => expect(screen.getByTestId('task-status')).toHaveTextContent('completed'))
  expect(screen.getByTestId('pending-complete')).toHaveTextContent('true')

  resolvers[1]({ task: { id: 't1', status: 'completed' } })
  await waitFor(() => expect(screen.getByTestId('pending-complete')).toHaveTextContent('false'))
})

test('serializes same-key writes so a failed request cannot roll back a later success', async () => {
  // Catches concurrent same-key requests that take stale snapshots and roll back successful UI state.
  const started = []
  let rejectFirst
  let resolveSecond
  const api = createApi({
    completeTask: () => new Promise((resolve, reject) => {
      started.push(started.length === 0 ? 'first' : 'second')
      if (started.length === 1) rejectFirst = reject
      else resolveSecond = resolve
    }),
  })
  renderProvider(api)
  await screen.findByText('ready', { selector: '[data-testid="boot-status"]' })

  fireEvent.click(screen.getByRole('button', { name: 'Complete' }))
  fireEvent.click(screen.getByRole('button', { name: 'Complete' }))
  expect(started).toEqual(['first'])
  expect(screen.getByTestId('pending-complete')).toHaveTextContent('true')

  await act(async () => {
    rejectFirst(new Error('offline'))
  })
  await waitFor(() => expect(started).toEqual(['first', 'second']))
  expect(screen.getByTestId('pending-complete')).toHaveTextContent('true')

  await act(async () => {
    resolveSecond({ task: { id: 't1', status: 'completed' } })
  })
  await waitFor(() => expect(screen.getByTestId('task-status')).toHaveTextContent('completed'))
  expect(screen.getByTestId('pending-complete')).toHaveTextContent('false')
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
