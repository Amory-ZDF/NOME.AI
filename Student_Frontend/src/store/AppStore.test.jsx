import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
      <output data-testid="task-status">{tasks[0]?.status || ''}</output>
      <output data-testid="pending-complete">{String(isActionPending('completeTask:t1'))}</output>
      <button onClick={() => { retryBootstrap() }}>Retry</button>
      <button onClick={() => { completeTask('t1') }}>Complete</button>
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
  expect(await screen.findByTestId('boot-status')).toHaveTextContent('ready')
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

test('boots the replacement service after a prior bootstrap effect is cleaned up', async () => {
  // Catches an effect cleanup that permanently marks a still-mounted provider as unmounted.
  const firstServices = createAppServices({
    apiClient: createApi({ bootstrap: () => new Promise(() => {}) }),
    now: () => new Date('2026-08-06T00:00:00.000Z'),
    createId: () => 'first-id',
  })
  const secondServices = createAppServices({
    apiClient: createApi(),
    now: () => new Date('2026-08-06T00:00:00.000Z'),
    createId: () => 'second-id',
  })
  const view = render(<AppProvider services={firstServices}><Probe /></AppProvider>)

  view.rerender(<AppProvider services={secondServices}><Probe /></AppProvider>)

  expect(await screen.findByTestId('boot-status')).toHaveTextContent('ready')
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
