import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import App from '../App'
import { createSeedState } from '../data/mockData'
import { gradeAnswerLocal } from '../features/exercise/answerRules'
import { createAppServices } from '../store/services'
import { renderStudentApp } from '../test/renderApp'

const hints = [1, 2, 3, 4, 5].map((level) => ({
  level,
  title: `Layer ${level} title`,
  content: `Private layer ${level} guidance`,
}))

function question(overrides = {}) {
  return {
    id: 'flow-q1',
    order: 1,
    type: 'calculation',
    topic: 'Calculus - Differentiation',
    difficulty: 3,
    content: 'What is 6 × 7?',
    acceptKeywords: ['42'],
    correctDisplay: '42',
    errorType: 'calculation',
    hints,
    ...overrides,
  }
}

function exerciseSet(overrides = {}) {
  return {
    taskId: 't-flow',
    title: 'Engine-backed practice',
    subject: 'A-Level Math',
    questions: [question()],
    ...overrides,
  }
}

function linkedVerificationFixture() {
  const task = {
    id: 'verification-task',
    title: 'Independent verification',
    exerciseSetId: 'verification-set',
    type: 'ai_recommended',
    status: 'pending',
    sourceQuestionId: 'source-question',
    verificationForErrorId: 'verification-error',
  }
  const error = {
    id: 'verification-error',
    questionId: 'source-question',
    subject: 'A-Level Math',
    errorType: 'calculation',
    questionSummary: 'Source error',
    questionContent: 'What is 5 + 5?',
    errorDescription: 'Calculation slip',
    relatedTopic: 'Addition',
    topicId: 'addition',
    firstOccurredAt: '2026-08-01T10:00:00.000Z',
    lastOccurredAt: '2026-08-01T10:00:00.000Z',
    repeatCount: 1,
    status: 'verification_due',
    studentAnswer: '9',
    correctAnswer: '10',
    analysis: 'Check the arithmetic.',
    acceptKeywords: ['10'],
    redoHistory: [{
      attemptedAt: '2026-08-06T12:00:00.000Z',
      answer: '10',
      isCorrect: true,
      timeSpent: 20,
    }],
    verificationVariantId: 'verification-set',
    variantVerifiedAt: null,
    variantVerification: null,
  }
  const set = exerciseSet({
    id: 'verification-set',
    taskId: task.id,
    title: task.title,
    sourceQuestionId: 'source-question',
    questions: [question({ id: 'verification-question', variantOf: 'source-question' })],
  })
  return { task, error, set }
}

function generatedVariant(overrides = {}, sourceQuestionId = 'flow-q1') {
  const generatedSet = exerciseSet({
    id: 'variant-set',
    taskId: 'variant-task',
    sourceQuestionId,
    questions: [question({ id: 'variant-q1', variantOf: sourceQuestionId })],
  })
  return {
    exerciseSet: generatedSet,
    task: {
      id: 'variant-task',
      title: 'Independent calculus transfer',
      exerciseSetId: 'variant-set',
      type: 'ai_recommended',
      status: 'pending',
      sourceQuestionId,
    },
    ...overrides,
  }
}

function createApi(overrides = {}) {
  const taskSet = exerciseSet()
  const bankSet = exerciseSet({ taskId: null, title: 'Bank engine practice' })
  // Mirrors src/api mockDiagnose: grade locally against acceptKeywords/correctIndex,
  // then return the diagnosis/hint shape the Exercise page consumes.
  const diagnoseAnswer = (question, progress) => {
    const isCorrect = gradeAnswerLocal(question, progress?.answer ?? '').isCorrect
    if (isCorrect) return Promise.resolve({ isCorrect: true, diagnosis: null, framework: null, hint: null, counterQuestion: null })
    const nextLevel = Math.min((progress?.hintLevel ?? 0) + 1, 5)
    const hint = question.hints.find((item) => item.level === nextLevel) ?? null
    return Promise.resolve({
      isCorrect: false,
      diagnosis: { isCorrect: false, errorType: question.errorType ?? 'knowledge', confidence: 0.9, counterQuestion: null, whereWrong: '', whyWrong: '' },
      framework: null,
      hint: hint ? { level: hint.level, title: hint.title, content: hint.content, nextStep: null } : null,
      counterQuestion: null,
    })
  }
  // Per-layer hint: same ladder as the static question hints, so the assertions
  // stay deterministic (the agent's real generation is covered end-to-end).
  const requestAgentHint = (question, progress) => {
    const nextLevel = Math.min((progress?.hintLevel ?? 0) + 1, 5)
    const hint = question.hints.find((item) => item.level === nextLevel) ?? null
    return Promise.resolve({
      isCorrect: false,
      diagnosis: null,
      framework: null,
      hint: hint ? { level: hint.level, title: hint.title, content: hint.content, nextStep: null } : null,
      counterQuestion: null,
    })
  }
  // One-shot diagnosis at settlement — same shape as the diagnoseAnswer stub.
  const diagnoseQuestion = (question, progress) => diagnoseAnswer(question, progress)
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
    getExerciseSet: (taskId) => Promise.resolve({ ...taskSet, taskId }),
    getBankExerciseSet: () => Promise.resolve(bankSet),
    submitSession: (session) => Promise.resolve({ sessionId: session.sessionId }),
    generateVariant: (sourceQuestionId) => Promise.resolve(generatedVariant({}, sourceQuestionId)),
    updateSettings: (patch) => Promise.resolve({ settings: patch }),
    diagnoseAnswer,
    replyCounterQuestion: (question, progress) => diagnoseAnswer(question, progress),
    requestAgentHint,
    diagnoseQuestion,
    ...overrides,
  }
}

function servicesFor(api) {
  return createAppServices({
    apiClient: api,
    now: () => new Date('2026-08-06T12:34:56.000Z'),
    createId: () => 'page-session',
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

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}</output>
}

function RouteControls() {
  const navigate = useNavigate()
  return (
    <>
      <button onClick={() => navigate('/bank/exercise/bank-next')}>Open bank route</button>
      <button onClick={() => navigate('/exercise/cache-task')}>Open task route</button>
      <button onClick={() => navigate('/exercise/verification-task')}>Open verification route</button>
    </>
  )
}

function UnmountableApp({ services }) {
  const [mounted, setMounted] = useState(true)
  return (
    <>
      {mounted && <App services={services} />}
      <button onClick={() => setMounted(false)}>Unmount exercise app</button>
      <LocationProbe />
    </>
  )
}

async function solve(answer = '42') {
  const input = await screen.findByRole('textbox', { name: /Your answer/i })
  await userEvent.clear(input)
  await userEvent.type(input, answer)
  await userEvent.click(screen.getByRole('button', { name: /Submit answer from answer area.*check my answer/i }))
}

test('loads task and bank routes through their store-backed API boundaries', async () => {
  const getExerciseSet = vi.fn((taskId) => Promise.resolve(exerciseSet({ taskId })))
  const getBankExerciseSet = vi.fn(() => Promise.resolve(exerciseSet({ taskId: null, title: 'Loaded bank route' })))

  const taskView = renderStudentApp(<App services={servicesFor(createApi({ getExerciseSet, getBankExerciseSet }))} />, { route: '/exercise/task-route' })
  expect(await screen.findByText('Engine-backed practice')).toBeInTheDocument()
  expect(getExerciseSet).toHaveBeenCalledWith('task-route')
  expect(getBankExerciseSet).not.toHaveBeenCalled()
  taskView.unmount()

  renderStudentApp(<App services={servicesFor(createApi({ getExerciseSet, getBankExerciseSet }))} />, { route: '/bank/exercise/bank-route' })
  expect(await screen.findByText('Loaded bank route')).toBeInTheDocument()
  expect(getBankExerciseSet).toHaveBeenCalledWith('bank-route')
})

test('shows loading and the existing missing-exercise treatment when loading fails', async () => {
  const load = deferred()
  const view = renderStudentApp(<App services={servicesFor(createApi({ getExerciseSet: () => load.promise }))} />, { route: '/exercise/missing' })

  expect(await screen.findByRole('status', { name: /Loading exercise/i })).toBeInTheDocument()
  await act(async () => { load.reject(new Error('exercise unavailable')) })
  expect(await screen.findByText(/doesn't exist or has expired/i)).toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('exercise unavailable')
  view.unmount()
})

test('retries a failed load for the same route and renders the recovered set', async () => {
  const getExerciseSet = vi.fn()
    .mockRejectedValueOnce(new Error('temporary exercise outage'))
    .mockResolvedValueOnce(exerciseSet({ taskId: 'retry-task', title: 'Recovered exercise set' }))
  renderStudentApp(<App services={servicesFor(createApi({ getExerciseSet }))} />, { route: '/exercise/retry-task' })

  expect(await screen.findByText(/doesn't exist or has expired/i)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Retry loading' }))

  expect(await screen.findByText('Recovered exercise set')).toBeInTheDocument()
  expect(getExerciseSet).toHaveBeenCalledTimes(2)
})

test('does not cache a malformed load and recovers when the same route is retried', async () => {
  const getExerciseSet = vi.fn()
    .mockResolvedValueOnce(exerciseSet({ taskId: 'retry-invalid-task', questions: [null] }))
    .mockResolvedValueOnce(exerciseSet({ taskId: 'retry-invalid-task', title: 'Recovered after invalid data' }))
  renderStudentApp(<App services={servicesFor(createApi({ getExerciseSet }))} />, { route: '/exercise/retry-invalid-task' })

  expect(await screen.findByText(/doesn't exist or has expired/i)).toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent(/exercise data is incomplete or invalid/i)
  await userEvent.click(screen.getByRole('button', { name: 'Retry loading' }))

  expect(await screen.findByText('Recovered after invalid data')).toBeInTheDocument()
  expect(getExerciseSet).toHaveBeenCalledTimes(2)
})

test.each([
  ['a null question', exerciseSet({ questions: [null] })],
  ['choice options that are not an array', exerciseSet({ questions: [question({ type: 'choice', options: null, correctIndex: 0 })] })],
  ['hints that are not an array', exerciseSet({ questions: [question({ hints: null })] })],
  ['a missing hint layer', exerciseSet({ questions: [question({ hints: hints.slice(0, 4) })] })],
  ['duplicate question IDs', exerciseSet({ questions: [question({ id: 'duplicate' }), question({ id: 'duplicate', order: 2 })] })],
  ['a non-finite question order', exerciseSet({ questions: [question({ order: Number.NaN })] })],
  ['a missing correct display', exerciseSet({ questions: [question({ correctDisplay: '', markScheme: undefined })] })],
])('rejects malformed loaded sets with %s before rendering a question', async (_label, malformedSet) => {
  renderStudentApp(
    <App services={servicesFor(createApi({ getExerciseSet: () => Promise.resolve({ ...malformedSet, taskId: 'malformed' }) }))} />,
    { route: '/exercise/malformed' },
  )

  expect(await screen.findByText(/doesn't exist or has expired/i)).toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent(/exercise data is incomplete or invalid/i)
})

test('accepts an API-supported IELTS reading question and renders its answer area', async () => {
  const readingSet = exerciseSet({
    taskId: 'reading-type',
    subject: 'IELTS Reading',
    questions: [question({ type: 'reading', topic: 'Reading Skills - Evidence' })],
  })
  renderStudentApp(
    <App services={servicesFor(createApi({ getExerciseSet: () => Promise.resolve(readingSet) }))} />,
    { route: '/exercise/reading-type' },
  )

  expect(await screen.findByText('Engine-backed practice')).toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: /Your answer/i })).toBeInTheDocument()
})

test('ignores stale task loads after a route change and after unmount', async () => {
  const taskLoad = deferred()
  const bankLoad = deferred()
  const getBankExerciseSet = vi.fn(() => bankLoad.promise)
  const view = renderStudentApp(
    <>
      <App services={servicesFor(createApi({ getExerciseSet: () => taskLoad.promise, getBankExerciseSet }))} />
      <RouteControls />
    </>,
    { route: '/exercise/slow-task' },
  )

  expect(await screen.findByRole('status', { name: /Loading exercise/i })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Open bank route' }))
  expect(screen.getByRole('status', { name: /Loading exercise/i })).toBeInTheDocument()
  expect(screen.queryByText('Engine-backed practice')).not.toBeInTheDocument()
  await act(async () => { bankLoad.resolve(exerciseSet({ taskId: null, title: 'Current bank set' })) })
  expect(await screen.findByText('Current bank set')).toBeInTheDocument()
  await act(async () => { taskLoad.resolve(exerciseSet({ title: 'Stale task set' })) })
  expect(screen.queryByText('Stale task set')).not.toBeInTheDocument()
  expect(getBankExerciseSet).toHaveBeenCalledWith('bank-next')

  view.unmount()

  let lateTitleReads = 0
  const unmountLoad = deferred()
  const pendingView = renderStudentApp(
    <App services={servicesFor(createApi({ getExerciseSet: () => unmountLoad.promise }))} />,
    { route: '/exercise/unmounting' },
  )
  expect(await screen.findByRole('status', { name: /Loading exercise/i })).toBeInTheDocument()
  pendingView.unmount()
  await act(async () => {
    unmountLoad.resolve({
      ...exerciseSet(),
      get title() { lateTitleReads += 1; return 'Late unmounted set' },
    })
  })
  expect(lateTitleReads).toBe(0)
})

test('renders loading immediately instead of flashing the previous set after route parameters change', async () => {
  const bankLoad = deferred()
  renderStudentApp(
    <>
      <App services={servicesFor(createApi({ getBankExerciseSet: () => bankLoad.promise }))} />
      <RouteControls />
    </>,
    { route: '/exercise/ready-task' },
  )

  expect(await screen.findByText('Engine-backed practice')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Open bank route' }))
  expect(screen.getByRole('status', { name: /Loading exercise/i })).toBeInTheDocument()
  expect(screen.queryByText('Engine-backed practice')).not.toBeInTheDocument()
  await act(async () => { bankLoad.resolve(exerciseSet({ taskId: null, title: 'Next bank set' })) })
  expect(await screen.findByText('Next bank set')).toBeInTheDocument()
})

test('does not navigate when a session from the previous route resolves late', async () => {
  const sessionWrite = deferred()
  renderStudentApp(
    <>
      <App services={servicesFor(createApi({ submitSession: () => sessionWrite.promise }))} />
      <RouteControls />
      <LocationProbe />
    </>,
    { route: '/exercise/session-route-a' },
  )

  await solve('41')
  await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
  await userEvent.click(screen.getByRole('button', { name: 'Open bank route' }))
  expect(await screen.findByText('Bank engine practice')).toBeInTheDocument()

  await act(async () => { sessionWrite.resolve({ sessionId: 'late-session' }) })
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/bank/exercise/bank-next'))
  expect(screen.getByTestId('location')).not.toHaveTextContent('/summary/')
})

test.each([
  ['correct', '42', true],
  ['wrong', '41', false],
])('persists then records a %s linked verification before opening its summary', async (_label, answer, isCorrect) => {
  const fixture = linkedVerificationFixture()
  const submitSession = vi.fn((session) => Promise.resolve({ sessionId: session.sessionId }))
  const verifyErrorVariant = vi.fn(() => Promise.resolve({}))
  const initial = createSeedState()
  renderStudentApp(
    <>
      <App services={servicesFor(createApi({
        bootstrap: () => Promise.resolve({ ...initial, tasks: [fixture.task], errors: [fixture.error] }),
        getExerciseSet: () => Promise.resolve(fixture.set),
        submitSession,
        verifyErrorVariant,
      }))} />
      <LocationProbe />
    </>,
    { route: '/exercise/verification-task' },
  )

  await solve(answer)
  await userEvent.click(screen.getByRole('button', { name: 'Submit' }))

  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/summary/page-session'))
  expect(submitSession).toHaveBeenCalledTimes(1)
  expect(verifyErrorVariant).toHaveBeenCalledWith('verification-error', {
    variantId: 'verification-set',
    isCorrect,
    verifiedAt: '2026-08-06T12:34:56.000Z',
  })
  expect(submitSession.mock.invocationCallOrder[0]).toBeLessThan(verifyErrorVariant.mock.invocationCallOrder[0])
})

test('retries a failed linked verification without writing the persisted session twice', async () => {
  const fixture = linkedVerificationFixture()
  const submitSession = vi.fn((session) => Promise.resolve({ sessionId: session.sessionId }))
  const verifyErrorVariant = vi.fn()
    .mockRejectedValueOnce(new Error('verification offline'))
    .mockResolvedValueOnce({})
  const initial = createSeedState()
  renderStudentApp(
    <>
      <App services={servicesFor(createApi({
        bootstrap: () => Promise.resolve({ ...initial, tasks: [fixture.task], errors: [fixture.error] }),
        getExerciseSet: () => Promise.resolve(fixture.set),
        submitSession,
        verifyErrorVariant,
      }))} />
      <LocationProbe />
    </>,
    { route: '/exercise/verification-task' },
  )

  await solve('42')
  const submit = screen.getByRole('button', { name: 'Submit' })
  await userEvent.click(submit)
  expect(await screen.findByText('verification offline')).toBeInTheDocument()
  expect(screen.getByTestId('location')).toHaveTextContent('/exercise/verification-task')
  await waitFor(() => expect(submit).toBeEnabled())

  await userEvent.click(submit)
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/summary/page-session'))
  expect(submitSession).toHaveBeenCalledTimes(1)
  expect(verifyErrorVariant).toHaveBeenCalledTimes(2)
})

test('retries verification with the outcome already stored in the cached session', async () => {
  const fixture = linkedVerificationFixture()
  const submitSession = vi.fn((session) => Promise.resolve({ sessionId: session.sessionId }))
  const verifyErrorVariant = vi.fn()
    .mockRejectedValueOnce(new Error('verification offline'))
    .mockResolvedValueOnce({})
  const initial = createSeedState()
  renderStudentApp(
    <>
      <App services={servicesFor(createApi({
        bootstrap: () => Promise.resolve({ ...initial, tasks: [fixture.task], errors: [fixture.error] }),
        getExerciseSet: () => Promise.resolve(fixture.set),
        submitSession,
        verifyErrorVariant,
      }))} />
      <LocationProbe />
    </>,
    { route: '/exercise/verification-task' },
  )

  await solve('41')
  const submit = screen.getByRole('button', { name: 'Submit' })
  await userEvent.click(submit)
  expect(await screen.findByText('verification offline')).toBeInTheDocument()
  await waitFor(() => expect(submit).toBeEnabled())

  await solve('42')
  await userEvent.click(submit)
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/summary/page-session'))
  expect(submitSession).toHaveBeenCalledTimes(1)
  expect(verifyErrorVariant).toHaveBeenNthCalledWith(2, 'verification-error', expect.objectContaining({
    variantId: 'verification-set',
    isCorrect: false,
  }))
})

test('does not record verification for an ordinary exercise submission', async () => {
  const verifyErrorVariant = vi.fn(() => Promise.resolve({}))
  renderStudentApp(
    <>
      <App services={servicesFor(createApi({ verifyErrorVariant }))} />
      <LocationProbe />
    </>,
    { route: '/exercise/t-flow' },
  )

  await solve('42')
  await userEvent.click(screen.getByRole('button', { name: 'Submit' }))

  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/summary/page-session'))
  expect(verifyErrorVariant).not.toHaveBeenCalled()
})

test('ignores a linked verification completion after the exercise route changes', async () => {
  const fixture = linkedVerificationFixture()
  const verificationWrite = deferred()
  const verifyErrorVariant = vi.fn(() => verificationWrite.promise)
  const initial = createSeedState()
  renderStudentApp(
    <>
      <App services={servicesFor(createApi({
        bootstrap: () => Promise.resolve({ ...initial, tasks: [fixture.task], errors: [fixture.error] }),
        getExerciseSet: (id) => Promise.resolve(id === fixture.task.id
          ? fixture.set
          : exerciseSet({ taskId: id, title: 'Current route exercise' })),
        verifyErrorVariant,
      }))} />
      <RouteControls />
      <LocationProbe />
    </>,
    { route: '/exercise/verification-task' },
  )

  await solve('42')
  await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
  await waitFor(() => expect(verifyErrorVariant).toHaveBeenCalledTimes(1))
  await userEvent.click(screen.getByRole('button', { name: 'Open task route' }))
  expect(await screen.findByText('Current route exercise')).toBeInTheDocument()

  await act(async () => { verificationWrite.resolve({}) })
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/exercise/cache-task'))
  expect(screen.getByTestId('location')).not.toHaveTextContent('/summary/')
})

test('does not let an A-B-A route cycle consume an old verification or unlock the new submission', async () => {
  const fixture = linkedVerificationFixture()
  const oldVerification = deferred()
  const newCompletion = deferred()
  const verifyErrorVariant = vi.fn()
    .mockImplementationOnce(() => oldVerification.promise)
    .mockResolvedValueOnce({})
  const completeTask = vi.fn()
    .mockResolvedValueOnce({ task: { id: fixture.task.id, status: 'completed' } })
    .mockImplementationOnce(() => newCompletion.promise)
  const submitSession = vi.fn((session) => Promise.resolve({ sessionId: session.sessionId }))
  const initial = createSeedState()
  renderStudentApp(
    <>
      <App services={servicesFor(createApi({
        bootstrap: () => Promise.resolve({ ...initial, tasks: [fixture.task], errors: [fixture.error] }),
        getExerciseSet: (id) => Promise.resolve(id === fixture.task.id
          ? fixture.set
          : exerciseSet({ taskId: id, title: 'Middle route exercise' })),
        submitSession,
        completeTask,
        verifyErrorVariant,
      }))} />
      <RouteControls />
      <LocationProbe />
    </>,
    { route: '/exercise/verification-task' },
  )

  await solve('42')
  await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
  await waitFor(() => expect(verifyErrorVariant).toHaveBeenCalledTimes(1))

  await userEvent.click(screen.getByRole('button', { name: 'Open task route' }))
  expect(await screen.findByText('Middle route exercise')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Open verification route' }))
  expect(await screen.findByText('Independent verification')).toBeInTheDocument()

  await solve('42')
  const newSubmit = screen.getByRole('button', { name: 'Submit' })
  await userEvent.click(newSubmit)
  await waitFor(() => expect(completeTask).toHaveBeenCalledTimes(2))
  expect(newSubmit).toBeDisabled()

  await act(async () => { oldVerification.resolve({}) })
  expect(screen.getByTestId('location')).toHaveTextContent('/exercise/verification-task')
  expect(newSubmit).toBeDisabled()

  await act(async () => {
    newCompletion.resolve({ task: { id: fixture.task.id, status: 'completed' } })
  })
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/summary/page-session'))
  expect(submitSession).toHaveBeenCalledTimes(1)
  expect(verifyErrorVariant).toHaveBeenCalledTimes(2)
})

test('does not show a generated variant from the previous route when it resolves late', async () => {
  const variantWrite = deferred()
  const staleVariant = generatedVariant({
    task: { ...generatedVariant().task, title: 'Stale route A variant' },
  })
  renderStudentApp(
    <>
      <App services={servicesFor(createApi({ generateVariant: () => variantWrite.promise }))} />
      <RouteControls />
      <LocationProbe />
    </>,
    { route: '/exercise/variant-route-a' },
  )

  await solve('42')
  await userEvent.click(screen.getByRole('button', { name: /Create independent variant/i }))
  await userEvent.click(screen.getByRole('button', { name: 'Open bank route' }))
  expect(await screen.findByText('Bank engine practice')).toBeInTheDocument()
  await solve('42')

  await act(async () => { variantWrite.resolve(staleVariant) })
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/bank/exercise/bank-next'))
  expect(screen.queryByText('Stale route A variant')).not.toBeInTheDocument()
  expect(screen.queryByText('Variant task added')).not.toBeInTheDocument()
  expect(screen.queryByText(/Variant task added to your task list/i)).not.toBeInTheDocument()
})

test('does not navigate when a pending session resolves after the exercise app unmounts', async () => {
  const sessionWrite = deferred()
  renderStudentApp(
    <UnmountableApp services={servicesFor(createApi({ submitSession: () => sessionWrite.promise }))} />,
    { route: '/exercise/unmount-session' },
  )

  await solve('41')
  await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
  await userEvent.click(screen.getByRole('button', { name: 'Unmount exercise app' }))
  await act(async () => { sessionWrite.resolve({ sessionId: 'unmounted-session' }) })

  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/exercise/unmount-session'))
})

test('does not consume a pending variant result after the exercise app unmounts', async () => {
  const variantWrite = deferred()
  let titleReads = 0
  const result = generatedVariant()
  Object.defineProperty(result.task, 'title', {
    enumerable: true,
    get() { titleReads += 1; return 'Unmounted variant title' },
  })
  renderStudentApp(
    <UnmountableApp services={servicesFor(createApi({ generateVariant: () => variantWrite.promise }))} />,
    { route: '/exercise/unmount-variant' },
  )

  await solve('42')
  await userEvent.click(screen.getByRole('button', { name: /Create independent variant/i }))
  await userEvent.click(screen.getByRole('button', { name: 'Unmount exercise app' }))
  await act(async () => { variantWrite.resolve(result) })

  expect(titleReads).toBe(0)
})

test('requires an attempt, reveals one agent hint level at a time, and diagnoses once on assisted solve', async () => {
  const submitSession = vi.fn((session) => Promise.resolve({ sessionId: session.sessionId }))
  const requestAgentHint = vi.fn((question, progress) => {
    const nextLevel = Math.min((progress?.hintLevel ?? 0) + 1, 5)
    const hint = question.hints.find((item) => item.level === nextLevel) ?? null
    return Promise.resolve({
      isCorrect: false, diagnosis: null, framework: null,
      hint: hint ? { level: hint.level, title: hint.title, content: hint.content, nextStep: null } : null,
      counterQuestion: null,
    })
  })
  const diagnoseQuestion = vi.fn((question, progress) => Promise.resolve({
    isCorrect: false,
    diagnosis: { isCorrect: false, errorType: 'calculation', confidence: 0.9, counterQuestion: null, whereWrong: 'Wrong step', whyWrong: 'Arithmetic slip' },
    framework: null, hint: null, counterQuestion: null,
  }))
  renderStudentApp(
    <>
      <App services={servicesFor(createApi({ submitSession, requestAgentHint, diagnoseQuestion }))} />
      <LocationProbe />
    </>,
    { route: '/exercise/t-flow' },
  )

  await screen.findByText('Engine-backed practice')
  expect(screen.getByRole('button', { name: 'Submit answer from answer area — check my answer' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Submit answer from AI tutor — check my answer' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()
  expect(screen.queryByText('Private layer 1 guidance')).not.toBeInTheDocument()
  expect(screen.queryByText('Private layer 2 guidance')).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: /Get a hint/i }))
  expect(await screen.findByText(/Submit your attempt first/i)).toBeInTheDocument()

  await solve('!!!')
  expect(await screen.findByText(/Please answer seriously first/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()

  await solve('41')
  expect(screen.getByRole('button', { name: 'Submit answer from answer area — check my answer' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Submit answer from AI tutor — check my answer' })).toBeInTheDocument()
  expect(await screen.findByText(/Layer 1 title/)).toBeInTheDocument()
  expect(screen.getByText('Private layer 1 guidance')).toBeInTheDocument()
  expect(screen.queryByText('Private layer 2 guidance')).not.toBeInTheDocument()
  expect(screen.getByText(/L2 · Locked hint/i)).toBeInTheDocument()
  // The first wrong attempt triggers NO diagnosis — hints are independent.
  expect(diagnoseQuestion).not.toHaveBeenCalled()

  for (let level = 2; level <= 5; level += 1) {
    await userEvent.click(screen.getByRole('button', { name: /Get a hint/i }))
    expect(screen.getByText(`Private layer ${level} guidance`)).toBeInTheDocument()
    if (level < 5) expect(screen.queryByText(`Private layer ${level + 1} guidance`)).not.toBeInTheDocument()
  }
  expect(screen.queryByRole('button', { name: /Get a hint/i })).not.toBeInTheDocument()
  // Each unlocked level requested its own agent hint.
  expect(requestAgentHint).toHaveBeenCalledTimes(5)
  // Still no diagnosis while the question is unsettled (wrong).
  expect(diagnoseQuestion).not.toHaveBeenCalled()

  // Assisted solve (correct only after 5 hints). Free-response grading already
  // produced the diagnosis, so no separate diagnoseQuestion call happens — the
  // diagnosis is carried into the session/error book.
  await solve('42')
  expect(await screen.findByText('Correct!')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/summary/page-session'))
  expect(submitSession).toHaveBeenCalledWith(expect.objectContaining({
    questions: [expect.objectContaining({
      result: expect.objectContaining({
        status: 'correct',
        hintsUsed: 5,
        solvedAtHintLevel: 5,
        // The AI diagnosis from the assisted solve reaches the error book.
        errorType: 'calculation',
      }),
    })],
  }))
  // No repeated diagnosis calls — diagnosis happened once during grading.
  expect(diagnoseQuestion).not.toHaveBeenCalled()
})

test('diagnoses still-wrong questions once at submit, but not first-try-correct ones', async () => {
  const submitSession = vi.fn((session) => Promise.resolve({ sessionId: session.sessionId }))
  const diagnoseQuestion = vi.fn((question, progress) => Promise.resolve({
    isCorrect: false,
    diagnosis: { isCorrect: false, errorType: 'calculation', confidence: 0.9, counterQuestion: null, whereWrong: 'Wrong step', whyWrong: 'Arithmetic slip' },
    framework: null, hint: null, counterQuestion: null,
  }))
  // Choice questions grade locally (no ungraded/LLM-grading path), so a wrong
  // answer is definitively wrong and only the settlement diagnosis should run.
  const choiceQ = () => ({
    id: 'choice-q',
    order: 1,
    type: 'choice',
    topic: 'Calculus - Differentiation',
    difficulty: 3,
    content: 'Pick the value of 6 × 7.',
    options: ['42', '43', '44', '45'],
    correctIndex: 0,
    correctDisplay: '42',
    errorType: 'calculation',
    hints,
  })
  const twoQSet = exerciseSet({
    taskId: 't-two',
    questions: [
      { ...choiceQ(), id: 'wrong-q' },
      { ...choiceQ(), id: 'correct-q' },
    ],
  })
  const api = createApi({ submitSession, diagnoseQuestion, getExerciseSet: () => Promise.resolve(twoQSet) })
  renderStudentApp(
    <>
      <App services={servicesFor(api)} />
      <LocationProbe />
    </>,
    { route: '/exercise/t-two' },
  )

  // Question 1: answer wrong (no hints) — remains wrong at submit.
  await screen.findByText('Engine-backed practice')
  await userEvent.click(screen.getByRole('radio', { name: /Your answer 2: 43/ }))
  await userEvent.click(screen.getByRole('button', { name: /Submit answer from answer area.*check my answer/i }))
  // Question 2: answer correct first try — no hints used.
  await userEvent.click(screen.getByRole('button', { name: /Question 2 hint usage/i }))
  await userEvent.click(screen.getByRole('radio', { name: /Your answer 1: 42/ }))
  await userEvent.click(screen.getByRole('button', { name: /Submit answer from answer area.*check my answer/i }))
  expect(await screen.findByText('Correct!')).toBeInTheDocument()
  // First-try correct → no diagnosis.
  expect(diagnoseQuestion).not.toHaveBeenCalled()

  await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
  await waitFor(() => expect(diagnoseQuestion).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/summary/page-session'))
  expect(submitSession).toHaveBeenCalled()
})

test('carries the assisted-solve diagnosis into the submitted session (not the fallback text)', async () => {
  const submitSession = vi.fn((session) => Promise.resolve({ sessionId: session.sessionId }))
  const diagnoseQuestion = vi.fn((question, progress) => Promise.resolve({
    isCorrect: false,
    diagnosis: {
      isCorrect: false, errorType: 'method', confidence: 0.9, counterQuestion: null,
      whereWrong: 'Selected the wrong option first', whyWrong: 'Confused stress units with a force product',
    },
    framework: null, hint: null, counterQuestion: null,
  }))
  // Choice question: wrong answer grades locally (definitively wrong), then a
  // hint unlocks, then the student picks the correct option → assisted solve.
  const choiceQ = () => ({
    id: 'choice-q', order: 1, type: 'choice', topic: 'Calculus - Differentiation', difficulty: 3,
    content: 'Pick the value of 6 × 7.', options: ['42', '43', '44', '45'], correctIndex: 0,
    correctDisplay: '42', errorType: 'calculation', hints,
  })
  const api = createApi({ submitSession, diagnoseQuestion, getExerciseSet: () => Promise.resolve(exerciseSet({ taskId: 't-assisted', questions: [choiceQ()] })) })
  renderStudentApp(
    <>
      <App services={servicesFor(api)} />
      <LocationProbe />
    </>,
    { route: '/exercise/t-assisted' },
  )

  // Wrong first.
  await screen.findByText('Engine-backed practice')
  await userEvent.click(screen.getByRole('radio', { name: /Your answer 2: 43/ }))
  await userEvent.click(screen.getByRole('button', { name: /Submit answer from answer area.*check my answer/i }))
  // Unlock a hint, then answer correctly (assisted solve).
  await userEvent.click(screen.getByRole('button', { name: /Get a hint.*L2/i }))
  await userEvent.click(screen.getByRole('radio', { name: /Your answer 1: 42/ }))
  await userEvent.click(screen.getByRole('button', { name: /Submit answer from answer area.*check my answer/i }))
  expect(await screen.findByText('Correct!')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/summary/page-session'))
  expect(diagnoseQuestion).toHaveBeenCalledTimes(1)
  expect(submitSession).toHaveBeenCalledWith(expect.objectContaining({
    questions: [expect.objectContaining({
      result: expect.objectContaining({
        status: 'correct', hintsUsed: 2, solvedAtHintLevel: 2,
        // The AI diagnosis reaches the error book, not the fallback text.
        whereWrong: 'Selected the wrong option first',
        whyWrong: 'Confused stress units with a force product',
        errorType: 'method',
      }),
    })],
  }))
})

test('creates a real L6 task after an independent solve, disables pending work, and retries failures', async () => {
  const first = deferred()
  const generated = generatedVariant()
  const generateVariant = vi.fn()
    .mockImplementationOnce(() => first.promise)
    .mockResolvedValueOnce(generated)
  renderStudentApp(<App services={servicesFor(createApi({ generateVariant }))} />, { route: '/exercise/t-flow' })

  await solve('42')
  const createVariant = await screen.findByRole('button', { name: /Create independent variant/i })
  expect(screen.queryByText('Understanding')).not.toBeInTheDocument()
  expect(screen.queryByText('Scoring')).not.toBeInTheDocument()
  await userEvent.click(createVariant)
  expect(createVariant).toBeDisabled()
  await act(async () => { first.reject(new Error('variant offline')) })
  expect(await screen.findByText('variant offline')).toBeInTheDocument()
  await waitFor(() => expect(createVariant).not.toBeDisabled())

  await userEvent.click(createVariant)
  expect(await screen.findByText('Variant task added')).toBeInTheDocument()
  expect(screen.getByText('Independent calculus transfer')).toBeInTheDocument()
  expect(await screen.findByText(/Variant task added to your task list/i)).toBeInTheDocument()
  expect(generateVariant).toHaveBeenCalledTimes(2)
})

test.each([
  ['a missing task', () => ({ exerciseSet: generatedVariant().exerciseSet })],
  ['a task without an ID', () => ({ ...generatedVariant(), task: { ...generatedVariant().task, id: '' } })],
  ['an exercise set without an ID', () => ({ ...generatedVariant(), exerciseSet: { ...generatedVariant().exerciseSet, id: '' } })],
  ['a mismatched exercise set ID', () => ({ ...generatedVariant(), task: { ...generatedVariant().task, exerciseSetId: 'another-set' } })],
  ['an empty generated question list', () => ({ ...generatedVariant(), exerciseSet: { ...generatedVariant().exerciseSet, questions: [] } })],
  ['a non-recommended task type', () => ({ ...generatedVariant(), task: { ...generatedVariant().task, type: 'teacher_assigned' } })],
  ['a non-pending task status', () => ({ ...generatedVariant(), task: { ...generatedVariant().task, status: 'completed' } })],
  ['a missing set source', () => ({ ...generatedVariant(), exerciseSet: { ...generatedVariant().exerciseSet, sourceQuestionId: undefined } })],
  ['the wrong set source', () => ({ ...generatedVariant(), exerciseSet: { ...generatedVariant().exerciseSet, sourceQuestionId: 'another-source' } })],
  ['a missing task source', () => ({ ...generatedVariant(), task: { ...generatedVariant().task, sourceQuestionId: undefined } })],
  ['the wrong task source', () => ({ ...generatedVariant(), task: { ...generatedVariant().task, sourceQuestionId: 'another-source' } })],
  ['a missing question source', () => ({ ...generatedVariant(), exerciseSet: { ...generatedVariant().exerciseSet, questions: [question({ id: 'variant-q1', variantOf: undefined })] } })],
  ['the wrong question source', () => ({ ...generatedVariant(), exerciseSet: { ...generatedVariant().exerciseSet, questions: [question({ id: 'variant-q1', variantOf: 'another-source' })] } })],
])('rejects an incomplete L6 response with %s and leaves generation retryable', async (_label, makeResult) => {
  const generateVariant = vi.fn(() => Promise.resolve(makeResult()))
  renderStudentApp(<App services={servicesFor(createApi({ generateVariant }))} />, { route: '/exercise/invalid-variant' })

  await solve('42')
  const button = await screen.findByRole('button', { name: /Create independent variant/i })
  await userEvent.click(button)

  expect(await screen.findByText(/generated variant is incomplete/i)).toBeInTheDocument()
  expect(screen.queryByText('Variant task added')).not.toBeInTheDocument()
  expect(screen.queryByText(/Variant task added to your task list/i)).not.toBeInTheDocument()
  expect(button).toBeEnabled()
})

test('shows only the available subject-specific explanation fields after a correct answer', async () => {
  const mathSet = exerciseSet({
    taskId: 'math',
    questions: [question({ understandingExplanation: 'Understand the rate of change.', scoringExplanation: 'Award both method marks.' })],
  })
  const mathView = renderStudentApp(<App services={servicesFor(createApi({ getExerciseSet: () => Promise.resolve(mathSet) }))} />, { route: '/exercise/math' })
  await solve('42')
  expect(await screen.findByText('Understanding')).toBeInTheDocument()
  expect(screen.getByText('Understand the rate of change.')).toBeInTheDocument()
  expect(screen.getByText('Scoring')).toBeInTheDocument()
  expect(screen.getByText('Award both method marks.')).toBeInTheDocument()
  expect(screen.queryByText('Passage evidence')).not.toBeInTheDocument()
  mathView.unmount()

  const readingSet = exerciseSet({
    subject: 'IELTS Reading',
    questions: [question({ passageEvidence: 'The passage names the exact figure.', errorPattern: 'Do not infer beyond the sentence.' })],
  })
  renderStudentApp(<App services={servicesFor(createApi({ getBankExerciseSet: () => Promise.resolve(readingSet) }))} />, { route: '/bank/exercise/reading' })
  await solve('42')
  expect(await screen.findByText('Passage evidence')).toBeInTheDocument()
  expect(screen.getByText('The passage names the exact figure.')).toBeInTheDocument()
  expect(screen.getByText('Pattern to avoid')).toBeInTheDocument()
  expect(screen.getByText('Do not infer beyond the sentence.')).toBeInTheDocument()
  expect(screen.queryByText('Understanding')).not.toBeInTheDocument()
})

test('keeps handwriting usage sticky and lets a wrong attempt submit the whole session once', async () => {
  const sessionWrite = deferred()
  const submitSession = vi.fn(() => sessionWrite.promise)
  const completeTask = vi.fn((id) => Promise.resolve({ task: { id, status: 'completed' } }))
  renderStudentApp(
    <>
      <App services={servicesFor(createApi({ submitSession, completeTask }))} />
      <LocationProbe />
    </>,
    { route: '/exercise/t-flow' },
  )

  await screen.findByRole('textbox', { name: /Your answer/i })
  await userEvent.click(screen.getByRole('button', { name: /Handwriting/ }))
  await userEvent.click(screen.getByRole('button', { name: /Handwriting/ }))
  await solve('41')
  const wholeSubmit = screen.getByRole('button', { name: 'Submit' })
  expect(wholeSubmit).toBeEnabled()
  fireEvent.click(wholeSubmit)
  fireEvent.click(wholeSubmit)
  expect(submitSession).toHaveBeenCalledTimes(1)
  expect(submitSession).toHaveBeenCalledWith(expect.objectContaining({
    sessionId: 'page-session',
    completedAt: '2026-08-06T12:34:56.000Z',
    questions: [expect.objectContaining({
      result: expect.objectContaining({ status: 'wrong', handwritingUsed: true }),
    })],
  }))

  await act(async () => { sessionWrite.resolve({ sessionId: 'canonical-session' }) })
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/summary/canonical-session'))
  expect(completeTask).toHaveBeenCalledTimes(1)
})

test('stays on the exercise after session persistence fails', async () => {
  const submitSession = vi.fn(() => Promise.reject(new Error('session offline')))
  renderStudentApp(
    <>
      <App services={servicesFor(createApi({ submitSession }))} />
      <LocationProbe />
    </>,
    { route: '/exercise/t-flow' },
  )

  await solve('41')
  await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
  expect(await screen.findByText('session offline')).toBeInTheDocument()
  expect(screen.getByTestId('location')).toHaveTextContent('/exercise/t-flow')
  expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled()
})
