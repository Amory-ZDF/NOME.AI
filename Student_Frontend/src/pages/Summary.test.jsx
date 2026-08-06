import { useEffect, useRef } from 'react'
import { Route, Routes } from 'react-router-dom'
import { screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { AppProvider, useApp } from '../store/AppStore'
import { createAppServices } from '../store/services'
import { renderStudentApp } from '../test/renderApp'
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
