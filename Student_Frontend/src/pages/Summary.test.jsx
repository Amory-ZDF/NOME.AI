import { useEffect, useRef } from 'react'
import { Route, Routes } from 'react-router-dom'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import App from '../App'
import { AppProvider, useApp } from '../store/AppStore'
import { createAppServices } from '../store/services'
import { renderStudentApp } from '../test/renderApp'
import { summarizeSession } from '../features/errors/sessionSummary'
import Summary from './Summary'

const bootData = {
  tasks: [],
  taskAdjustments: [],
  sessions: {},
  errors: [],
  notes: [],
  noteFolders: [],
  settings: {},
}

const persistedSession = (sessionId, topic) => ({
  sessionId,
  taskId: null,
  taskTitle: `${topic} practice`,
  subject: 'A-Level Math',
  completedAt: '2026-08-06T12:34:56.000Z',
  timeSpent: 2,
  questions: [{
    id: `${sessionId}-q1`,
    order: 1,
    topic,
    errorType: 'knowledge',
    content: `Question about ${topic}.`,
    correctDisplay: 'Correct answer',
    acceptKeywords: ['correct'],
    result: {
      status: 'correct',
      attempts: [{ answer: 'correct', isCorrect: true }],
      hintsUsed: 0,
      solvedAtHintLevel: 0,
      handwritingUsed: false,
    },
  }],
})

const appServices = (apiOverrides = {}, sessions = {}) => createAppServices({
  apiClient: {
    bootstrap: () => Promise.resolve({ ...bootData, sessions }),
    submitSession: (session) => Promise.resolve({ sessionId: session.sessionId }),
    getSessionSummary: (sessionId) => Promise.resolve(summarizeSession(sessions[sessionId])),
    upsertErrors: (items) => Promise.resolve({ errors: items }),
    ...apiOverrides,
  },
  now: () => new Date('2026-08-06T12:34:56.000Z'),
  createId: () => 'generated-session',
})

function SeededSummary({ session }) {
  const { lastSession, saveSession } = useApp()
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    saveSession(session)
  }, [saveSession, session])

  return lastSession ? <Summary /> : null
}

test('reports assisted solutions without turning corrected questions into unresolved errors', async () => {
  const addErrors = vi.fn((items) => Promise.resolve({ errors: items }))
  const services = createAppServices({
    apiClient: {
      bootstrap: () => Promise.resolve(bootData),
      submitSession: (session) => Promise.resolve({ sessionId: session.sessionId }),
      addErrors,
      getSessionSummary: () => Promise.resolve(summarizeSession(session)),
    },
    now: () => new Date('2026-08-06T12:34:56.000Z'),
    createId: () => 'assisted-session',
  })
  const session = {
    sessionId: 'assisted-session',
    taskId: null,
    taskTitle: 'Mixed independence practice',
    subject: 'A-Level Math',
    timeSpent: 4,
    questions: [
      {
        id: 'q1',
        order: 1,
        topic: 'Calculus - Differentiation',
        errorType: 'method',
        content: 'Differentiate the expression.',
        correctDisplay: '42',
        acceptKeywords: ['42'],
        result: {
          status: 'correct',
          attempts: [
            { answer: '41', isCorrect: false },
            { answer: '42', isCorrect: true },
          ],
          hintsUsed: 5,
          solvedAtHintLevel: 5,
          handwritingUsed: true,
        },
      },
      {
        id: 'q2',
        order: 2,
        topic: 'Calculus - Extrema',
        errorType: 'knowledge',
        content: 'Find the maximum.',
        correctDisplay: 'Maximum at x = 0',
        acceptKeywords: ['0'],
        result: {
          status: 'correct',
          attempts: [{ answer: '0', isCorrect: true }],
          hintsUsed: 0,
          solvedAtHintLevel: 0,
          handwritingUsed: false,
        },
      },
    ],
  }

  renderStudentApp(
    <AppProvider services={services}>
      <Routes>
        <Route path="/summary/:sessionId" element={<SeededSummary session={session} />} />
      </Routes>
    </AppProvider>,
    { route: '/summary/assisted-session' },
  )

  expect(await screen.findByText(/Solved independently/)).toHaveTextContent('1/2')
  expect(screen.getByText(/Hints/)).toHaveTextContent('2.5/question')
  expect(screen.getByText('No unresolved mistakes in this session. 1 question was solved with hints or after retrying.')).toBeInTheDocument()
  expect(screen.getByText('No unresolved mistakes remain. Review assisted solutions, then try a variant question to confirm independent mastery.')).toBeInTheDocument()
  expect(screen.queryByText(/all solved independently/i)).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: /Error Cards/i })).not.toBeInTheDocument()
  expect(addErrors).not.toHaveBeenCalled()
})

test('reloads the route session and adds all of its error cards only once', async () => {
  const user = userEvent.setup()
  const session = {
    sessionId: 's1',
    taskId: null,
    taskTitle: 'Route diagnosis',
    subject: 'A-Level Math',
    completedAt: '2026-08-06T12:34:56.000Z',
    timeSpent: 3,
    questions: [
      {
        id: 's1-q1',
        order: 1,
        topic: 'Route Topic One',
        topicId: 'route-topic-one',
        errorType: 'calculation',
        content: 'Calculate 2 + 3.',
        correctDisplay: '5',
        acceptKeywords: ['5'],
        understandingExplanation: 'Addition combines both quantities.',
        scoringExplanation: 'Award one mark for the correct total.',
        result: {
          status: 'wrong',
          attempts: [{ answer: '4', isCorrect: false }],
          hintsUsed: 2,
          solvedAtHintLevel: null,
          handwritingUsed: false,
        },
      },
      {
        id: 's1-q2',
        order: 2,
        topic: 'Route Topic Two',
        topicId: 'route-topic-two',
        errorType: 'method',
        content: 'Solve x + 1 = 3.',
        correctDisplay: '2',
        acceptKeywords: ['2'],
        result: {
          status: 'unanswered',
          attempts: [],
          hintsUsed: 0,
          solvedAtHintLevel: null,
          handwritingUsed: false,
        },
      },
    ],
  }
  const getSessionSummary = vi.fn(() => Promise.resolve(summarizeSession(session)))
  const upsertErrors = vi.fn((items) => Promise.resolve({ errors: items }))

  renderStudentApp(
    <App services={appServices({ getSessionSummary, upsertErrors }, { s1: session })} />,
    { route: '/summary/s1' },
  )

  expect(await screen.findByText('Error Analysis')).toBeInTheDocument()
  await waitFor(() => expect(getSessionSummary).toHaveBeenCalledWith('s1'))

  const addAll = screen.getByRole('button', { name: /Add all to error book/i })
  await user.click(addAll)
  await screen.findByRole('button', { name: /Already in error book/i })
  await user.click(addAll)

  expect(upsertErrors).toHaveBeenCalledTimes(1)
  expect(upsertErrors.mock.calls[0][0]).toHaveLength(2)
  expect(upsertErrors.mock.calls[0][0].map((item) => item.questionId)).toEqual(['s1-q1', 's1-q2'])
  expect(screen.getAllByRole('button', { name: /^check In error book$/i })).toHaveLength(2)
})

test('records a new-session recurrence while treating the exact session occurrence as already added', async () => {
  const user = userEvent.setup()
  const session = {
    sessionId: 'session-current',
    taskId: null,
    taskTitle: 'Recurrence diagnosis',
    subject: 'A-Level Math',
    completedAt: '2026-08-06T14:00:00.000Z',
    timeSpent: 2,
    questions: [{
      id: 'shared-question',
      order: 1,
      topic: 'Repeated Topic',
      topicId: 'repeated-topic',
      errorType: 'method',
      content: 'Solve the repeated question.',
      correctDisplay: '5',
      acceptKeywords: ['5'],
      result: {
        status: 'wrong',
        attempts: [{ answer: '4', isCorrect: false }],
        hintsUsed: 1,
        solvedAtHintLevel: null,
        handwritingUsed: false,
      },
    }],
  }
  const previousOccurrence = {
    id: 'existing-card',
    questionId: 'shared-question',
    occurrenceKeys: ['session:session-previous:question:shared-question'],
  }
  const upsertErrors = vi.fn((items) => Promise.resolve({ errors: [previousOccurrence, ...items] }))
  const servicesForErrors = (errors) => createAppServices({
    apiClient: {
      bootstrap: () => Promise.resolve({ ...bootData, sessions: { 'session-current': session }, errors }),
      getSessionSummary: () => Promise.resolve(summarizeSession(session)),
      upsertErrors,
    },
    now: () => new Date('2026-08-06T14:00:00.000Z'),
    createId: () => 'generated-id',
  })

  const newOccurrenceView = renderStudentApp(
    <App services={servicesForErrors([previousOccurrence])} />,
    { route: '/summary/session-current' },
  )
  await screen.findByText('Error Analysis')
  await user.click(screen.getByRole('button', { name: /Add all to error book/i }))
  expect(upsertErrors).toHaveBeenCalledTimes(1)
  expect(upsertErrors.mock.calls[0][0][0].occurrenceKeys).toEqual([
    'session:session-current:question:shared-question',
  ])
  newOccurrenceView.unmount()

  upsertErrors.mockClear()
  renderStudentApp(
    <App services={servicesForErrors([{
      ...previousOccurrence,
      occurrenceKeys: ['session:session-current:question:shared-question'],
    }])} />,
    { route: '/summary/session-current' },
  )
  expect(await screen.findByRole('button', { name: /Already in error book/i })).toBeDisabled()
  expect(upsertErrors).not.toHaveBeenCalled()
})

test('restores the exact URL session from bootstrap instead of another persisted session', async () => {
  const target = persistedSession('target-session', 'Target Topic')
  const other = persistedSession('other-session', 'Other Topic')

  renderStudentApp(
    <App services={appServices({}, {
      'target-session': target,
      'other-session': other,
    })} />,
    { route: '/summary/target-session' },
  )

  expect(await screen.findByText('Target Topic')).toBeInTheDocument()
  expect(screen.queryByText('Other Topic')).not.toBeInTheDocument()
})

test('does not show lastSession when it belongs to a different URL session ID', async () => {
  const other = persistedSession('other-session', 'Other Latest Topic')

  renderStudentApp(
    <AppProvider services={appServices()}>
      <Routes>
        <Route path="/summary/:sessionId" element={<SeededSummary session={other} />} />
      </Routes>
    </AppProvider>,
    { route: '/summary/unknown-session' },
  )

  expect(await screen.findByText('No summary data found for this session')).toBeInTheDocument()
  expect(screen.queryByText('Other Latest Topic')).not.toBeInTheDocument()
})
