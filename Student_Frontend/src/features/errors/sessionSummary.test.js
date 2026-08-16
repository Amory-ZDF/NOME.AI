import { describe, expect, test } from 'vitest'
import { ERROR_TYPES, ERROR_TYPE_META, normalizeErrorType } from './errorTypes'
import { summarizeSession } from './sessionSummary'

const session = {
  subject: 'A-Level Math',
  questions: [
    {
      id: 'q1',
      topic: 'Calculus',
      errorType: 'calculation',
      result: {
        status: 'wrong',
        hintsUsed: 3,
        solvedAtHintLevel: null,
        attempts: [{ answer: '1', isCorrect: false }],
      },
    },
    {
      id: 'q2',
      topic: 'Calculus',
      errorType: 'method',
      result: {
        status: 'correct',
        hintsUsed: 0,
        solvedAtHintLevel: 0,
        attempts: [{ answer: '2', isCorrect: true }],
      },
    },
  ],
}

describe('summarizeSession', () => {
  test('derives accuracy, distribution, and hint dependency from the session', () => {
    expect(summarizeSession(session)).toMatchObject({
      accuracy: 50,
      correctCount: 1,
      wrongCount: 1,
      unansweredCount: 0,
      hintDependency: { totalHints: 3, averageHints: 1.5, independentlySolved: 1 },
      errorDistribution: { calculation: 1 },
      topicOutcomes: [{ topic: 'Calculus', correct: 1, wrong: 1 }],
    })
  })

  test('returns a complete zero-value summary for an empty session', () => {
    expect(summarizeSession({ questions: [] })).toEqual({
      accuracy: 0,
      correctCount: 0,
      wrongCount: 0,
      unansweredCount: 0,
      hintDependency: { totalHints: 0, averageHints: 0, independentlySolved: 0 },
      errorDistribution: {},
      topicOutcomes: [],
      wrongQuestions: [],
      errorQuestions: [],
    })
  })

  test('normalizes every malformed completed-session status as unanswered across all summary outputs', () => {
    const correct = { id: 'q1', topic: 'Algebra', errorType: 'method', result: { status: 'correct', hintsUsed: 1, solvedAtHintLevel: 0 } }
    const wrong = { id: 'q2', topic: 'Algebra', errorType: 'calculation', result: { status: 'wrong', hintsUsed: 2 } }
    const missingResult = { id: 'q3', topic: 'Calculus', errorType: 'method' }
    const missingStatus = { id: 'q4', topic: 'Calculus', errorType: 'knowledge', result: {} }
    const invalidStatus = { id: 'q5', topic: 'Reading', errorType: 'reading', result: { status: 'skipped', hintsUsed: -4 } }
    const malformed = { questions: [correct, wrong, missingResult, missingStatus, invalidStatus, null] }

    expect(summarizeSession(malformed)).toEqual({
      accuracy: 17,
      correctCount: 1,
      wrongCount: 1,
      unansweredCount: 4,
      hintDependency: { totalHints: 3, averageHints: 0.5, independentlySolved: 1 },
      errorDistribution: { calculation: 1, execution: 4 },
      topicOutcomes: [
        { topic: 'Algebra', correct: 1, wrong: 1 },
        { topic: 'Calculus', correct: 0, wrong: 2 },
        { topic: 'Reading', correct: 0, wrong: 1 },
        { topic: 'Unspecified', correct: 0, wrong: 1 },
      ],
      wrongQuestions: [wrong, missingResult, missingStatus, invalidStatus, null],
      errorQuestions: [wrong, missingResult, missingStatus, invalidStatus, null],
    })
  })
})

describe('error type normalization', () => {
  test('publishes metadata for exactly the seven supported diagnosis types', () => {
    expect(ERROR_TYPES).toEqual([
      'knowledge',
      'method',
      'calculation',
      'reading',
      'execution',
      'expression',
      'habit',
    ])
    expect(Object.keys(ERROR_TYPE_META)).toEqual(ERROR_TYPES)
    expect(ERROR_TYPE_META.reading.label).toBe('Reading comprehension')
  })

  test.each(ERROR_TYPES)('preserves the valid %s diagnosis', (errorType) => {
    expect(normalizeErrorType({ errorType }, { status: 'wrong' })).toBe(errorType)
  })

  test('classifies an unanswered submitted question as execution', () => {
    expect(normalizeErrorType({ errorType: 'method' }, { status: 'unanswered' })).toBe('execution')
  })

  test('classifies a correct method missing required Mark Scheme phrases as expression', () => {
    const question = {
      errorType: 'method',
      requiredMarkSchemePhrases: ['therefore', 'by induction'],
    }
    const result = {
      status: 'wrong',
      methodCorrect: true,
      attempts: [{ answer: 'The result follows for k + 1.', isCorrect: false }],
    }

    expect(normalizeErrorType(question, result)).toBe('expression')
  })

  test('does not infer expression without both method and missing-phrase evidence', () => {
    expect(normalizeErrorType(
      { errorType: 'method', requiredMarkSchemePhrases: ['therefore'] },
      { status: 'wrong', attempts: [{ answer: 'Some working', isCorrect: false }] },
    )).toBe('method')
    expect(normalizeErrorType(
      { errorType: 'method', requiredMarkSchemePhrases: ['therefore'] },
      { status: 'wrong', methodCorrect: true, attempts: [{ answer: 'Therefore the claim holds.', isCorrect: false }] },
    )).toBe('method')
  })

  test('does not accept a required phrase embedded inside a larger word', () => {
    expect(normalizeErrorType(
      { errorType: 'method', requiredMarkSchemePhrases: ['therefore'] },
      { status: 'wrong', methodCorrect: true, attempts: [{ answer: 'This is notthereforex a valid conclusion.' }] },
    )).toBe('expression')
  })

  test('matches required phrases after Unicode, case, and whitespace normalization', () => {
    expect(normalizeErrorType(
      { errorType: 'method', requiredMarkSchemePhrases: ['by induction'] },
      { status: 'wrong', methodCorrect: true, attempts: [{ answer: 'ＢＹ\u00a0  induction, the claim follows.' }] },
    )).toBe('method')
  })

  test('matches punctuation-bearing required phrases literally', () => {
    expect(normalizeErrorType(
      { errorType: 'method', requiredMarkSchemePhrases: ['f(x) = 0?'] },
      { status: 'wrong', methodCorrect: true, attempts: [{ answer: 'Check whether f(x) = 0? Therefore continue.' }] },
    )).toBe('method')
  })

  test('classifies only three recent repeated avoidable patterns as habit', () => {
    const repeatedAttempts = [
      { avoidablePattern: 'sign-slip' },
      { avoidablePattern: 'sign-slip' },
      { avoidablePattern: 'sign-slip' },
    ]

    expect(normalizeErrorType(
      { errorType: 'calculation' },
      { status: 'wrong', attempts: repeatedAttempts },
    )).toBe('habit')
    expect(normalizeErrorType(
      { errorType: 'calculation' },
      { status: 'wrong', attempts: repeatedAttempts.slice(0, 2) },
    )).toBe('calculation')
    expect(normalizeErrorType(
      { errorType: 'calculation' },
      { status: 'wrong', attempts: [...repeatedAttempts.slice(0, 2), { avoidablePattern: 'copied-number' }] },
    )).toBe('calculation')
  })

  test('falls back defensively when question or result data is absent or invalid', () => {
    expect(normalizeErrorType()).toBe('knowledge')
    expect(normalizeErrorType(null, null)).toBe('knowledge')
    expect(normalizeErrorType({ errorType: 'unknown' }, { attempts: 'not-an-array' })).toBe('knowledge')
  })
})
