import { expect, test } from 'vitest'
import {
  buildSession,
  canSubmitSession,
  createQuestionProgress,
  resolveGrading,
  submitAttempt,
  unlockNextHint,
} from './exerciseEngine'

// Choice questions grade locally (correctIndex is reliable) — used where the
// tests exercise the synchronous submit state machine.
const choiceQuestion = (correctIndex = 0) => ({
  type: 'choice',
  options: ['A. 40', 'B. 42'],
  correctIndex,
})
// Free-response questions have no local verdict — the LLM grades them.
const freeResponseQuestion = () => ({ type: 'calculation', markScheme: 'Answer = 42' })

test('a first wrong attempt unlocks only L1', () => {
  const progress = createQuestionProgress('q1')
  const result = submitAttempt(progress, choiceQuestion(0), 'B. 42', '2026-08-06T10:00:00Z')

  expect(result).toMatchObject({ status: 'wrong', hintLevel: 1, solvedAtHintLevel: null })
  expect(result.attempts).toHaveLength(1)
})

test('a free-response submission starts ungraded until the LLM grades it', () => {
  const progress = createQuestionProgress('q1')
  const ungraded = submitAttempt(progress, freeResponseQuestion(), '42', '2026-08-06T10:00:00Z')

  expect(ungraded.status).toBe('ungraded')
  expect(ungraded.attempts).toHaveLength(1)
  expect(ungraded.attempts[0].isCorrect).toBeNull()

  const resolved = resolveGrading(ungraded, true)
  expect(resolved).toMatchObject({ status: 'correct', solvedAtHintLevel: 0 })
  expect(resolved.attempts[0].isCorrect).toBe(true)
})

test('resolveGrading marks a wrong free-response and unlocks L1', () => {
  const progress = createQuestionProgress('q1')
  const ungraded = submitAttempt(progress, freeResponseQuestion(), '41', '2026-08-06T10:00:00Z')
  const resolved = resolveGrading(ungraded, false)

  expect(resolved).toMatchObject({ status: 'wrong', hintLevel: 1, solvedAtHintLevel: null })
  expect(resolved.attempts[0].isCorrect).toBe(false)
})

test('hints cannot unlock before a wrong attempt and stop at L5', () => {
  expect(unlockNextHint(createQuestionProgress('q1'))).toMatchObject({ hintLevel: 0, transitionError: 'ATTEMPT_REQUIRED' })
  let progress = { ...createQuestionProgress('q1'), status: 'wrong', hintLevel: 1 }
  for (let index = 0; index < 9; index += 1) progress = unlockNextHint(progress)
  expect(progress.hintLevel).toBe(5)
})

test('records the level at which the student solved independently', () => {
  const progress = { ...createQuestionProgress('q1'), status: 'wrong', hintLevel: 3, attempts: [] }

  expect(submitAttempt(progress, choiceQuestion(0), 'A. 40', '2026-08-06T10:01:00Z')).toMatchObject({
    status: 'correct',
    solvedAtHintLevel: 3,
  })
})

test('does not append invalid attempts or alter progress', () => {
  const progress = createQuestionProgress('q1')
  const result = submitAttempt(progress, choiceQuestion(0), '!!!', '2026-08-06T10:00:00Z')

  expect(result).toEqual({ ...progress, transitionError: 'THROWAWAY' })
  expect(result).not.toBe(progress)
})

test('does not auto-unlock further hints after subsequent wrong attempts', () => {
  const firstWrong = submitAttempt(createQuestionProgress('q1'), choiceQuestion(0), 'B. 42', '2026-08-06T10:00:00Z')
  const result = submitAttempt(firstWrong, choiceQuestion(0), 'B. 42', '2026-08-06T10:01:00Z')

  expect(result).toMatchObject({ status: 'wrong', hintLevel: 1 })
})

test('keeps inputs immutable during state transitions', () => {
  const progress = createQuestionProgress('q1')
  const snapshot = structuredClone(progress)
  const result = submitAttempt(progress, choiceQuestion(0), 'B. 42', '2026-08-06T10:00:00Z')

  expect(progress).toEqual(snapshot)
  expect(result.attempts).not.toBe(progress.attempts)
})

test('requires every question to have a valid attempt before session submission', () => {
  expect(canSubmitSession({})).toBe(false)
  expect(canSubmitSession({ q1: createQuestionProgress('q1') })).toBe(false)
  expect(canSubmitSession({ q1: { status: 'invalid' } })).toBe(false)
  expect(canSubmitSession({ q1: {} })).toBe(false)
  expect(canSubmitSession({
    q1: { ...createQuestionProgress('q1'), status: 'wrong' },
    q2: { ...createQuestionProgress('q2'), status: 'correct' },
  })).toBe(true)
})

test('an ungraded free-response blocks session submission', () => {
  expect(canSubmitSession({ q1: { ...createQuestionProgress('q1'), status: 'ungraded' } })).toBe(false)
})

test('builds a deterministic session with mapped result fields and rounded minutes', () => {
  const set = {
    taskId: 't1',
    title: 'Algebra practice',
    subject: 'Math',
    questions: [{ id: 'q1', type: 'choice', topic: 'linear', difficulty: 2, content: 'Solve', options: ['A. 41', 'B. 42'], correctIndex: 1, correctDisplay: 'B. 42', hints: [] }],
  }
  const progressById = {
    q1: {
      ...createQuestionProgress('q1'),
      status: 'correct',
      attempts: [{ answer: 'B. 42', normalizedAnswer: 'b. 42', submittedAt: '2026-08-06T10:00:00Z', isCorrect: true }],
      hintLevel: 3,
      solvedAtHintLevel: 3,
      handwritingUsed: true,
    },
  }
  const input = { set, progressById, elapsedSeconds: 91, sessionId: 's1', completedAt: '2026-08-06T10:02:00Z' }
  const snapshot = structuredClone(input)

  const session = buildSession(input)

  expect(session).toEqual({
    sessionId: 's1', taskId: 't1', taskTitle: 'Algebra practice', subject: 'Math', completedAt: '2026-08-06T10:02:00Z', timeSpentSeconds: 91, timeSpent: 2,
    questions: [{
      ...set.questions[0],
      result: { status: 'correct', attempts: progressById.q1.attempts, hintsUsed: 3, solvedAtHintLevel: 3, handwritingUsed: true },
    }],
  })
  expect(buildSession(input)).toEqual(session)
  expect(input).toEqual(snapshot)
})

test('flattens diagnosis evidence into result, skipping empty evidence', () => {
  const set = {
    taskId: null,
    title: 'Units',
    subject: 'AS Physics',
    questions: [{ id: 'q1', type: 'choice', topic: 'units', difficulty: 2, content: 'C', options: ['a', 'b'], correctIndex: 0, correctDisplay: 'a', hints: [] }],
  }
  const progressById = {
    q1: {
      ...createQuestionProgress('q1'),
      status: 'wrong',
      attempts: [{ answer: 'b', submittedAt: '2026-08-06T10:00:00Z', isCorrect: false }],
      hintLevel: 1,
      diagnosis: {
        errorType: 'reading',
        whereWrong: 'Misread the stem.',
        whyWrong: '',                       // empty — must be dropped (would 400 + blank card)
        understandingExplanation: null,     // null — dropped
        scoringExplanation: '  ',           // whitespace — dropped
      },
    },
  }
  const session = buildSession({
    set, progressById, elapsedSeconds: 60, sessionId: 's-diag', completedAt: '2026-08-06T10:01:00Z',
  })

  expect(session.questions[0].result).toMatchObject({
    errorType: 'reading',
    whereWrong: 'Misread the stem.',
  })
  expect(session.questions[0].result).not.toHaveProperty('whyWrong')
  expect(session.questions[0].result).not.toHaveProperty('understandingExplanation')
  expect(session.questions[0].result).not.toHaveProperty('scoringExplanation')
})

test('uses null taskId for a bank set', () => {
  const session = buildSession({
    set: { title: 'Bank practice', subject: 'Math', questions: [] },
    progressById: {}, elapsedSeconds: 0, sessionId: 's-bank', completedAt: '2026-08-06T10:00:00Z',
  })

  expect(session.taskId).toBeNull()
})

test('preserves solved progress after later attempts and hint requests', () => {
  const question = choiceQuestion(0)
  const firstWrong = submitAttempt(createQuestionProgress('q1'), question, 'B. 42', '2026-08-06T10:00:00Z')
  const withHints = unlockNextHint(unlockNextHint(firstWrong))
  const solved = submitAttempt(withHints, question, 'A. 40', '2026-08-06T10:01:00Z')
  const laterWrong = submitAttempt(solved, question, 'B. 42', '2026-08-06T10:02:00Z')
  const hintRequest = unlockNextHint(laterWrong)

  expect(laterWrong).toMatchObject({ status: 'correct', solvedAtHintLevel: 3, hintLevel: 3 })
  expect(laterWrong.attempts).toHaveLength(3)
  expect(hintRequest).toMatchObject({ status: 'correct', hintLevel: 3, transitionError: 'ALREADY_SOLVED' })
})

test('does not raise hint level after an independent solve followed by a wrong attempt', () => {
  const question = choiceQuestion(0)
  const solved = submitAttempt(createQuestionProgress('q1'), question, 'A. 40', '2026-08-06T10:00:00Z')
  const laterWrong = submitAttempt(solved, question, 'B. 42', '2026-08-06T10:01:00Z')

  expect(laterWrong).toMatchObject({ status: 'correct', solvedAtHintLevel: 0, hintLevel: 0 })
  expect(laterWrong.attempts).toHaveLength(2)
})
