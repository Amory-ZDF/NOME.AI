import { expect, test } from 'vitest'
import {
  buildSession,
  canSubmitSession,
  createQuestionProgress,
  submitAttempt,
  unlockNextHint,
} from './exerciseEngine'

test('a first wrong attempt unlocks only L1', () => {
  const progress = createQuestionProgress('q1')
  const result = submitAttempt(progress, { acceptKeywords: ['42'] }, '41', '2026-08-06T10:00:00Z')

  expect(result).toMatchObject({ status: 'wrong', hintLevel: 1, solvedAtHintLevel: null })
  expect(result.attempts).toHaveLength(1)
})

test('hints cannot unlock before a wrong attempt and stop at L5', () => {
  expect(unlockNextHint(createQuestionProgress('q1'))).toMatchObject({ hintLevel: 0, transitionError: 'ATTEMPT_REQUIRED' })
  let progress = { ...createQuestionProgress('q1'), status: 'wrong', hintLevel: 1 }
  for (let index = 0; index < 9; index += 1) progress = unlockNextHint(progress)
  expect(progress.hintLevel).toBe(5)
})

test('records the level at which the student solved independently', () => {
  const progress = { ...createQuestionProgress('q1'), status: 'wrong', hintLevel: 3, attempts: [] }

  expect(submitAttempt(progress, { acceptKeywords: ['42'] }, '42', '2026-08-06T10:01:00Z')).toMatchObject({
    status: 'correct',
    solvedAtHintLevel: 3,
  })
})

test('does not append invalid attempts or alter progress', () => {
  const progress = createQuestionProgress('q1')
  const result = submitAttempt(progress, { acceptKeywords: ['42'] }, '!!!', '2026-08-06T10:00:00Z')

  expect(result).toEqual({ ...progress, transitionError: 'THROWAWAY' })
  expect(result).not.toBe(progress)
})

test('does not auto-unlock further hints after subsequent wrong attempts', () => {
  const firstWrong = submitAttempt(createQuestionProgress('q1'), { acceptKeywords: ['42'] }, '41', '2026-08-06T10:00:00Z')
  const result = submitAttempt(firstWrong, { acceptKeywords: ['42'] }, '40', '2026-08-06T10:01:00Z')

  expect(result).toMatchObject({ status: 'wrong', hintLevel: 1 })
})

test('keeps inputs immutable during state transitions', () => {
  const progress = createQuestionProgress('q1')
  const snapshot = structuredClone(progress)
  const result = submitAttempt(progress, { acceptKeywords: ['42'] }, '41', '2026-08-06T10:00:00Z')

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

test('builds a deterministic session with mapped result fields and rounded minutes', () => {
  const set = {
    taskId: 't1',
    title: 'Algebra practice',
    subject: 'Math',
    questions: [{ id: 'q1', type: 'calculation', topic: 'linear', difficulty: 2, content: 'Solve', acceptKeywords: ['42'], correctDisplay: '42', errorType: 'calculation', hints: [] }],
  }
  const progressById = {
    q1: {
      ...createQuestionProgress('q1'),
      status: 'correct',
      attempts: [{ answer: '42', normalizedAnswer: '42', submittedAt: '2026-08-06T10:00:00Z', isCorrect: true }],
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

test('uses null taskId for a bank set', () => {
  const session = buildSession({
    set: { title: 'Bank practice', subject: 'Math', questions: [] },
    progressById: {}, elapsedSeconds: 0, sessionId: 's-bank', completedAt: '2026-08-06T10:00:00Z',
  })

  expect(session.taskId).toBeNull()
})

test('preserves solved progress after later attempts and hint requests', () => {
  const question = { acceptKeywords: ['42'] }
  const firstWrong = submitAttempt(createQuestionProgress('q1'), question, '41', '2026-08-06T10:00:00Z')
  const withHints = unlockNextHint(unlockNextHint(firstWrong))
  const solved = submitAttempt(withHints, question, '42', '2026-08-06T10:01:00Z')
  const laterWrong = submitAttempt(solved, question, '40', '2026-08-06T10:02:00Z')
  const hintRequest = unlockNextHint(laterWrong)

  expect(laterWrong).toMatchObject({ status: 'correct', solvedAtHintLevel: 3, hintLevel: 3 })
  expect(laterWrong.attempts).toHaveLength(3)
  expect(hintRequest).toMatchObject({ status: 'correct', hintLevel: 3, transitionError: 'ALREADY_SOLVED' })
})
