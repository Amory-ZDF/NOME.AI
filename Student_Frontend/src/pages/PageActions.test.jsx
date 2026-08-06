import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { useLocation } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import App from '../App'
import { bankExerciseSets, createSeedState, exerciseSets } from '../data/mockData'
import { createAppServices } from '../store/services'
import { renderStudentApp } from '../test/renderApp'

afterEach(() => vi.useRealTimers())

function createApi(overrides = {}) {
  return {
    bootstrap: () => Promise.resolve(createSeedState()),
    completeTask: (id) => Promise.resolve({ task: { id, status: 'completed' } }),
    reportTaskAdjustment: () => Promise.resolve({}),
    createTask: (task) => Promise.resolve({ task }),
    addErrors: (errors) => Promise.resolve({ errors }),
    markErrorMastered: () => Promise.resolve({}),
    submitRedo: () => Promise.resolve({}),
    createNote: (note) => Promise.resolve({ note }),
    updateNote: () => Promise.resolve({}),
    getExerciseSet: (taskId) => Promise.resolve(Object.values(exerciseSets).find((set) => set.taskId === taskId)),
    getBankExerciseSet: (setId) => Promise.resolve(bankExerciseSets[setId]),
    submitSession: (session) => Promise.resolve({ sessionId: session.sessionId }),
    generateVariant: (sourceQuestionId) => Promise.resolve({
      exerciseSet: {
        id: `variant-${sourceQuestionId}`,
        taskId: `variant-task-${sourceQuestionId}`,
        sourceQuestionId,
        title: 'Variant practice',
        subject: 'A-Level Math',
        questions: [{ ...exerciseSets['set-t1'].questions[0], id: `variant-${sourceQuestionId}-q1`, order: 1, variantOf: sourceQuestionId }],
      },
      task: { id: `variant-task-${sourceQuestionId}`, title: 'Independent transfer practice', exerciseSetId: `variant-${sourceQuestionId}`, type: 'ai_recommended', status: 'pending', sourceQuestionId },
    }),
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

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function attemptTaskExercise() {
  await screen.findByText('IELTS Reading · Cambridge 18 Test 2 P1')

  fireEvent.click(screen.getAllByRole('radio')[1])
  fireEvent.click(screen.getByRole('button', { name: /Submit answer from answer area.*check my answer/i }))

  fireEvent.click(screen.getByTitle('Question 2'))
  fireEvent.click(screen.getAllByRole('radio')[1])
  fireEvent.click(screen.getByRole('button', { name: /Submit answer from answer area.*check my answer/i }))

  fireEvent.click(screen.getByTitle('Question 3'))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '25%' } })
  fireEvent.click(screen.getByRole('button', { name: /Submit answer from answer area.*check my answer/i }))
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
  const checkbox = within(taskRow).getByRole('checkbox', { name: /Physics Chapter 3/i })

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
  fireEvent.click(screen.getByRole('button', { name: /Submit answer from answer area.*check my answer/i }))
  fireEvent.click(await screen.findByRole('button', { name: /Finish/i }))

  expect(screen.getByTestId('location')).toHaveTextContent('/bank/exercise/bq3')
  await act(async () => { rejectSession(new Error('session failed')) })
  expect(screen.getByTestId('location')).toHaveTextContent('/bank/exercise/bq3')
  expect(await screen.findByText('session failed')).toBeInTheDocument()
})

test('Exercise disables every whole-set submit control while session persistence is unresolved', async () => {
  // Catches alternate submit entry points bypassing the active whole-set transaction.
  const sessionWrite = deferred()
  const submitSession = vi.fn(() => sessionWrite.promise)
  const api = createApi({ submitSession })
  renderStudentApp(<App services={servicesFor(api)} />, { route: '/exercise/t2' })
  await attemptTaskExercise()

  const submit = screen.getByRole('button', { name: 'Submit' })
  const finish = screen.getByRole('button', { name: /Finish/i })
  const reviewAndSubmit = screen.getByRole('button', { name: /Review & submit the whole set/i })
  fireEvent.click(submit)

  expect(submit).toBeDisabled()
  expect(finish).toBeDisabled()
  expect(reviewAndSubmit).toBeDisabled()
  fireEvent.click(finish)
  fireEvent.click(reviewAndSubmit)
  expect(submitSession).toHaveBeenCalledTimes(1)

  await act(async () => { sessionWrite.reject(new Error('stop test transaction')) })
})

test('Exercise keeps the whole-set transaction locked while task completion is unresolved', async () => {
  // Catches the saveSession pending key clearing before completeTask settles and allowing a duplicate transaction.
  const sessionWrite = deferred()
  const taskWrite = deferred()
  const submitSession = vi.fn(() => sessionWrite.promise)
  const completeTask = vi.fn(() => taskWrite.promise)
  const api = createApi({ submitSession, completeTask })
  renderStudentApp(
    <>
      <App services={servicesFor(api)} />
      <LocationProbe />
    </>,
    { route: '/exercise/t2' },
  )
  await attemptTaskExercise()

  const submit = screen.getByRole('button', { name: 'Submit' })
  fireEvent.click(submit)
  await act(async () => { sessionWrite.resolve({ sessionId: 'persisted-session' }) })
  await waitFor(() => expect(completeTask).toHaveBeenCalledTimes(1))

  expect(screen.getByTestId('location')).toHaveTextContent('/exercise/t2')
  expect(submit).toBeDisabled()
  fireEvent.click(submit)
  expect(submitSession).toHaveBeenCalledTimes(1)
  expect(completeTask).toHaveBeenCalledTimes(1)

  await act(async () => { taskWrite.resolve({}) })
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/summary/persisted-session'))
})

test('Notes disables title editing for the duration of its own write', async () => {
  // Catches title input remaining writable while an updateNote action for that note is unresolved.
  const noteWrite = deferred()
  const updateNote = vi.fn(() => noteWrite.promise)
  const api = createApi({ updateNote })
  renderStudentApp(<App services={servicesFor(api)} />, { route: '/notes' })
  const title = await screen.findByDisplayValue('Trigonometry Formula Derivations')

  fireEvent.change(title, { target: { value: 'Edited title' } })
  fireEvent.blur(title)

  expect(updateNote).toHaveBeenCalledTimes(1)
  expect(title).toBeDisabled()
  await act(async () => { noteWrite.resolve({ note: { id: 'n1', title: 'Edited title' } }) })
  await waitFor(() => expect(title).not.toBeDisabled())
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
