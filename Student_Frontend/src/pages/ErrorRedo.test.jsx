import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { Route, Routes, useNavigate } from 'react-router-dom'
import App from '../App'
import { AppProvider, useApp } from '../store/AppStore'
import { createAppServices } from '../store/services'
import { renderStudentApp } from '../test/renderApp'
import ErrorRedo from './ErrorRedo'

const baseError = {
  id: 'e1',
  questionId: 'q-err-1',
  subject: 'A-Level Math',
  errorType: 'calculation',
  questionSummary: 'Calculate the value.',
  questionContent: 'What is 2 + 3?',
  errorDescription: 'The total was calculated incorrectly.',
  relatedTopic: 'Addition',
  topicId: 'addition',
  firstOccurredAt: '2026-08-01T10:00:00.000Z',
  lastOccurredAt: '2026-08-01T10:00:00.000Z',
  repeatCount: 1,
  status: 'pending_review',
  studentAnswer: '4',
  correctAnswer: '5',
  analysis: 'Add both quantities once.',
  acceptKeywords: ['5'],
  redoHistory: [],
  verificationVariantId: null,
  variantVerifiedAt: null,
  variantVerification: null,
}

const hints = Array.from({ length: 5 }, (_, index) => ({
  level: index + 1,
  title: `Hint ${index + 1}`,
  content: `Hint content ${index + 1}`,
}))

const verificationSet = {
  id: 'variant-q-err-1-1',
  taskId: 'task-variant-q-err-1-1',
  title: 'Independent addition verification',
  subject: 'A-Level Math',
  sourceQuestionId: 'q-err-1',
  questions: [{
    id: 'variant-question-1',
    order: 1,
    topic: 'Addition',
    difficulty: 2,
    type: 'calculation',
    content: 'What is 3 + 4?',
    correctDisplay: '7',
    errorType: 'calculation',
    acceptKeywords: ['7'],
    hints,
    variantOf: 'q-err-1',
  }],
}

const deferred = () => {
  let resolve
  const promise = new Promise((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

function RedoRouteHarness() {
  const navigate = useNavigate()
  const { booted } = useApp()
  if (!booted) return null
  return (
    <>
      <button onClick={() => navigate('/errors/review/e2')}>Review second error</button>
      <Routes>
        <Route path="/errors/review/:id" element={<ErrorRedo />} />
      </Routes>
    </>
  )
}

test('records elapsed seconds and schedules a variant after a correct redo without early mastery', async () => {
  let clock = 100_000
  vi.spyOn(Date, 'now').mockImplementation(() => clock)
  const user = userEvent.setup()
  const submitRedo = vi.fn((id, attempt) => Promise.resolve({
    error: {
      ...baseError,
      status: 'verification_due',
      redoHistory: [attempt],
    },
  }))
  const scheduled = {
    exerciseSet: verificationSet,
    task: {
      id: verificationSet.taskId,
      title: verificationSet.title,
      exerciseSetId: verificationSet.id,
      type: 'ai_recommended',
      status: 'pending',
      sourceQuestionId: 'q-err-1',
      verificationForErrorId: 'e1',
    },
    error: {
      ...baseError,
      status: 'verification_due',
      redoHistory: [{
        attemptedAt: '2026-08-06T12:34:56.000Z',
        answer: '5',
        isCorrect: true,
        timeSpent: 65,
      }],
      verificationVariantId: verificationSet.id,
    },
  }
  const scheduleErrorVariant = vi.fn(() => Promise.resolve(scheduled))
  const services = createAppServices({
    apiClient: {
      bootstrap: () => Promise.resolve({
        tasks: [], taskAdjustments: [], sessions: {}, errors: [baseError], notes: [], noteFolders: [], settings: {},
      }),
      submitRedo,
      scheduleErrorVariant,
      getExerciseSet: () => Promise.resolve(verificationSet),
    },
    now: () => new Date('2026-08-06T12:34:56.000Z'),
    createId: () => 'generated-id',
  })

  renderStudentApp(<App services={services} />, { route: '/errors/review/e1' })
  const answer = await screen.findByRole('textbox', { name: /Your solution/i })
  clock += 65_000
  await user.type(answer, '5')
  await user.click(screen.getByRole('button', { name: /Submit answer/i }))

  await waitFor(() => expect(submitRedo).toHaveBeenCalledWith('e1', expect.objectContaining({
    answer: '5',
    isCorrect: true,
    timeSpent: 65,
  })))
  expect(await screen.findByRole('button', { name: /Start variant verification/i })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Mark as mastered/i })).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: /Start variant verification/i }))
  await waitFor(() => expect(scheduleErrorVariant).toHaveBeenCalledWith('e1'))
})

test('isolates local answer and late submit results when the route error id changes', async () => {
  const user = userEvent.setup()
  const pendingSubmit = deferred()
  const secondError = {
    ...baseError,
    id: 'e2',
    questionId: 'q-err-2',
    questionSummary: 'Second error question',
    questionContent: 'What is 3 + 3?',
    correctAnswer: '6',
    acceptKeywords: ['6'],
  }
  const services = createAppServices({
    apiClient: {
      bootstrap: () => Promise.resolve({
        tasks: [], taskAdjustments: [], sessions: {}, errors: [baseError, secondError], notes: [], noteFolders: [], settings: {},
      }),
      submitRedo: () => pendingSubmit.promise,
    },
    now: () => new Date('2026-08-06T12:34:56.000Z'),
    createId: () => 'generated-id',
  })

  renderStudentApp(
    <AppProvider services={services}><RedoRouteHarness /></AppProvider>,
    { route: '/errors/review/e1' },
  )
  const firstAnswer = await screen.findByRole('textbox', { name: /Your solution/i })
  await user.type(firstAnswer, '5')
  await user.click(screen.getByRole('button', { name: /Submit answer/i }))
  await user.click(screen.getByRole('button', { name: /Review second error/i }))

  const secondAnswer = await screen.findByRole('textbox', { name: /Your solution/i })
  expect(secondAnswer).toHaveValue('')
  expect(screen.getByText('What is 3 + 3?')).toBeInTheDocument()

  await act(async () => {
    pendingSubmit.resolve({
      error: {
        ...baseError,
        status: 'verification_due',
        redoHistory: [{
          attemptedAt: '2026-08-06T12:34:56.000Z', answer: '5', isCorrect: true, timeSpent: 0,
        }],
      },
    })
    await pendingSubmit.promise
  })

  expect(screen.getByRole('textbox', { name: /Your solution/i })).toHaveValue('')
  expect(screen.queryByRole('button', { name: /Start variant verification/i })).not.toBeInTheDocument()
})

test('groups choice answers under the Your solution legend', async () => {
  const choiceError = {
    ...baseError,
    options: ['A. Four', 'B. Five'],
    correctIndex: 1,
  }
  const services = createAppServices({
    apiClient: {
      bootstrap: () => Promise.resolve({
        tasks: [], taskAdjustments: [], sessions: {}, errors: [choiceError], notes: [], noteFolders: [], settings: {},
      }),
    },
  })

  renderStudentApp(<App services={services} />, { route: '/errors/review/e1' })
  const answerGroup = await screen.findByRole('group', { name: /Your solution/i })
  const radios = within(answerGroup).getAllByRole('radio')
  expect(radios).toHaveLength(2)
  expect(radios[0]).toHaveAttribute('name', radios[1].getAttribute('name'))
})
