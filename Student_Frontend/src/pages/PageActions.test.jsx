import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { useLocation } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import App from '../App'
import { createSeedState } from '../data/mockData'
import { createAppServices } from '../store/services'
import { renderStudentApp } from '../test/renderApp'

afterEach(() => vi.useRealTimers())

function createApi(overrides = {}) {
  return {
    bootstrap: () => Promise.resolve(createSeedState()),
    completeTask: () => Promise.resolve({}),
    reportTaskAdjustment: () => Promise.resolve({}),
    createTask: (task) => Promise.resolve({ task }),
    addErrors: (errors) => Promise.resolve({ errors }),
    markErrorMastered: () => Promise.resolve({}),
    submitRedo: () => Promise.resolve({}),
    createNote: (note) => Promise.resolve({ note }),
    updateNote: () => Promise.resolve({}),
    submitSession: (session) => Promise.resolve({ sessionId: session.sessionId }),
    updateSettings: (patch) => Promise.resolve({ settings: patch }),
    ...overrides,
  }
}

function servicesFor(api) {
  return createAppServices({
    apiClient: api,
    now: () => new Date('2026-08-06T12:34:56.000Z'),
    createId: () => 'generated-id',
  })
}

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}</output>
}

test('a failed Home completion rolls back and never schedules local removal', async () => {
  // Catches an ignored completion Promise scheduling removal before persistence succeeds.
  let rejectCompletion
  const api = createApi({
    completeTask: () => new Promise((_, reject) => { rejectCompletion = reject }),
  })
  renderStudentApp(<App services={servicesFor(api)} />)
  const taskTitle = await screen.findByText('Physics Chapter 3 · Momentum Conservation Practice')
  const taskRow = taskTitle.closest('.group')
  const checkbox = within(taskRow).getAllByRole('button')[0]

  fireEvent.click(checkbox)
  expect(taskTitle).toHaveClass('line-through')
  await act(async () => { rejectCompletion(new Error('completion failed')) })
  await waitFor(() => expect(taskTitle).not.toHaveClass('line-through'))

  vi.useFakeTimers()
  await vi.advanceTimersByTimeAsync(1000)
  expect(screen.getByText('Physics Chapter 3 · Momentum Conservation Practice')).toBeInTheDocument()
  expect(screen.queryByText('Marked complete')).not.toBeInTheDocument()
})

test('Profile keeps settings open and withholds success feedback when saving fails', async () => {
  // Catches settings writes being ignored while the modal closes and reports success immediately.
  let rejectSettings
  const api = createApi({
    updateSettings: () => new Promise((_, reject) => { rejectSettings = reject }),
  })
  renderStudentApp(<App services={servicesFor(api)} />, { route: '/profile?settings=1' })
  expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument()

  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '6' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))

  expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
  expect(screen.queryByText('Settings saved and applied')).not.toBeInTheDocument()
  await act(async () => { rejectSettings(new Error('settings failed')) })
  expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
  expect(await screen.findByText('settings failed')).toBeInTheDocument()
})

test('Exercise waits for session persistence and stays on the exercise when it fails', async () => {
  // Catches ignored session Promises navigating to a summary before the write settles or after failure.
  let rejectSession
  const api = createApi({
    submitSession: () => new Promise((_, reject) => { rejectSession = reject }),
  })
  renderStudentApp(
    <>
      <App services={servicesFor(api)} />
      <LocationProbe />
    </>,
    { route: '/bank/exercise/bq3' },
  )
  const radios = await screen.findAllByRole('radio')
  fireEvent.click(radios[0])
  fireEvent.click(screen.getAllByRole('button', { name: /check my answer/i })[0])
  fireEvent.click(await screen.findByRole('button', { name: /Finish/i }))

  expect(screen.getByTestId('location')).toHaveTextContent('/bank/exercise/bq3')
  await act(async () => { rejectSession(new Error('session failed')) })
  expect(screen.getByTestId('location')).toHaveTextContent('/bank/exercise/bq3')
  expect(await screen.findByText('session failed')).toBeInTheDocument()
})

test('Bank upload waits for task creation and retains the modal when creation fails', async () => {
  // Catches upload-created task Promises being ignored while success UI proceeds immediately.
  let rejectTask
  const api = createApi({
    createTask: () => new Promise((_, reject) => { rejectTask = reject }),
  })
  const view = renderStudentApp(<App services={servicesFor(api)} />, { route: '/bank' })
  fireEvent.click(await screen.findByRole('button', { name: /Upload paper/i }))
  expect(screen.getByRole('heading', { name: 'Upload exam paper' })).toBeInTheDocument()

  const fileInput = view.container.querySelector('input[type="file"]')
  fireEvent.change(fileInput, { target: { files: [new File(['paper'], 'paper.pdf', { type: 'application/pdf' })] } })

  expect(screen.getByRole('heading', { name: 'Upload exam paper' })).toBeInTheDocument()
  expect(screen.queryByText(/Paper uploaded:/)).not.toBeInTheDocument()
  await act(async () => { rejectTask(new Error('task creation failed')) })
  expect(screen.getByRole('heading', { name: 'Upload exam paper' })).toBeInTheDocument()
  expect(await screen.findByText('task creation failed')).toBeInTheDocument()
})

test('Error redo withholds result UI and stays editable when recording fails', async () => {
  // Characterizes the caught error-action Promise: removing the await reveals result UI before persistence.
  const api = createApi({ submitRedo: () => Promise.reject(new Error('redo failed')) })
  renderStudentApp(<App services={servicesFor(api)} />, { route: '/errors/review/e1' })
  const answer = await screen.findByPlaceholderText(/full solution independently/i)

  fireEvent.change(answer, { target: { value: '5' } })
  fireEvent.click(screen.getByRole('button', { name: /Submit answer/i }))

  expect(await screen.findByText('redo failed')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Submit answer/i })).toBeInTheDocument()
  expect(screen.queryByText('Correct this time!')).not.toBeInTheDocument()
})
