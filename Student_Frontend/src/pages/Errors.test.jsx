import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import App from '../App'
import { createAppServices } from '../store/services'
import { renderStudentApp } from '../test/renderApp'

const types = ['knowledge', 'method', 'calculation', 'reading', 'execution', 'expression', 'habit']

const errorItem = (errorType, index, patch = {}) => ({
  id: `error-${errorType}`,
  questionId: `question-${errorType}`,
  subject: 'A-Level Math',
  errorType,
  questionSummary: `${errorType} diagnostic card`,
  questionContent: `${errorType} question`,
  errorDescription: `${errorType} cause`,
  whereWrong: `${errorType} location`,
  whyWrong: `${errorType} reason`,
  linkedAbility: `${errorType} ability`,
  relatedTopic: `${errorType} topic`,
  topicId: `${errorType}-topic`,
  firstOccurredAt: `2026-08-0${index + 1}T10:00:00.000Z`,
  lastOccurredAt: `2026-08-0${index + 1}T10:00:00.000Z`,
  repeatCount: 1,
  status: errorType === 'expression' ? 'verification_due' : 'pending_review',
  studentAnswer: 'student answer',
  correctAnswer: 'correct answer',
  analysis: `${errorType} training`,
  acceptKeywords: ['correct'],
  redoHistory: [],
  ...patch,
})

const bootData = (errors) => ({
  tasks: [],
  taskAdjustments: [],
  sessions: {},
  errors,
  notes: [],
  noteFolders: [],
  settings: {},
})

const servicesFor = (errors) => createAppServices({
  apiClient: { bootstrap: () => Promise.resolve(bootData(errors)) },
  now: () => new Date('2026-08-06T12:34:56.000Z'),
  createId: () => 'generated-id',
})

test('filters by every normalized error type and exposes verification due', async () => {
  const user = userEvent.setup()
  const errors = types.map((type, index) => errorItem(type, index))
  renderStudentApp(<App services={servicesFor(errors)} />, { route: '/errors' })

  expect(await screen.findByText('7 total')).toBeInTheDocument()
  expect(screen.getAllByText('Verification due')).toHaveLength(2)

  for (const type of types) {
    const label = type === 'reading' ? 'Reading comprehension' : `${type[0].toUpperCase()}${type.slice(1)}`
    await user.click(screen.getByRole('button', { name: label }))
    expect(screen.getByText(`${type} diagnostic card`)).toBeInTheDocument()
    types.filter((candidate) => candidate !== type).forEach((candidate) => {
      expect(screen.queryByText(`${candidate} diagnostic card`)).not.toBeInTheDocument()
    })
  }
})

test('shows only the available subject-specific diagnosis layers', async () => {
  const user = userEvent.setup()
  const math = errorItem('method', 0, {
    id: 'math-error',
    questionId: 'math-question',
    questionSummary: 'Math layered diagnosis',
    understandingExplanation: 'Understand the derivative as a rate of change.',
    scoringExplanation: 'Award one mark for differentiating.',
    markSchemePoints: [{ phrase: 'M1: differentiate correctly' }],
  })
  const reading = errorItem('reading', 1, {
    id: 'reading-error',
    questionId: 'reading-question',
    subject: 'IELTS Reading',
    questionSummary: 'Reading layered diagnosis',
    passageEvidence: 'The passage says the policy was voluntary.',
    errorPattern: 'Do not replace “encourage” with “require”.',
    analysis: 'Underline modal verbs, then compare the statement word for word.',
  })

  renderStudentApp(<App services={servicesFor([math, reading])} />, { route: '/errors' })
  const mathCard = (await screen.findByText('Math layered diagnosis')).closest('.zb-card')
  const readingCard = screen.getByText('Reading layered diagnosis').closest('.zb-card')

  await user.click(within(mathCard).getByRole('button', { name: /View analysis/i }))
  expect(within(mathCard).getByText('Understanding')).toBeInTheDocument()
  expect(within(mathCard).getByText('Scoring / Mark Scheme')).toBeInTheDocument()
  expect(within(mathCard).getByText(/M1: differentiate correctly/)).toBeInTheDocument()
  expect(within(mathCard).queryByText('Passage evidence')).not.toBeInTheDocument()

  await user.click(within(readingCard).getByRole('button', { name: /View analysis/i }))
  expect(within(readingCard).getByText('Passage evidence')).toBeInTheDocument()
  expect(within(readingCard).getByText('Repeated pattern')).toBeInTheDocument()
  expect(within(readingCard).getByText('Micro-training')).toBeInTheDocument()
  expect(within(readingCard).queryByText('Understanding')).not.toBeInTheDocument()
})

test('does not show IELTS Reading diagnosis layers for another IELTS subject', async () => {
  const user = userEvent.setup()
  const writing = errorItem('expression', 0, {
    id: 'writing-error',
    questionId: 'writing-question',
    subject: 'IELTS Writing',
    questionSummary: 'Writing diagnosis',
    passageEvidence: 'Reading-only evidence must stay hidden.',
    errorPattern: 'Reading-only pattern must stay hidden.',
    analysis: 'Generic writing analysis must not be labelled as Reading micro-training.',
  })

  renderStudentApp(<App services={servicesFor([writing])} />, { route: '/errors' })
  const writingCard = (await screen.findByText('Writing diagnosis')).closest('.zb-card')
  await user.click(within(writingCard).getByRole('button', { name: /View analysis/i }))

  expect(within(writingCard).queryByText('Passage evidence')).not.toBeInTheDocument()
  expect(within(writingCard).queryByText('Repeated pattern')).not.toBeInTheDocument()
  expect(within(writingCard).queryByText('Micro-training')).not.toBeInTheDocument()
})

test('labels a verification-due card as a continuation instead of another redo', async () => {
  const due = errorItem('expression', 0)
  renderStudentApp(<App services={servicesFor([due])} />, { route: '/errors' })

  const card = (await screen.findByText('expression diagnostic card')).closest('.zb-card')
  expect(within(card).getByRole('button', { name: /Continue verification/i })).toBeInTheDocument()
  expect(within(card).queryByRole('button', { name: /Redo it/i })).not.toBeInTheDocument()
})
