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
    })
  })

  test('handles missing optional result values without emitting NaN or undefined topics', () => {
    const malformed = {
      questions: [
        { id: 'q1', result: { status: 'wrong' } },
        { id: 'q2', topic: 'Algebra', result: { status: 'unanswered', hintsUsed: -4 } },
      ],
    }

    expect(summarizeSession(malformed)).toMatchObject({
      accuracy: 0,
      wrongCount: 1,
      unansweredCount: 1,
      hintDependency: { totalHints: 0, averageHints: 0, independentlySolved: 0 },
      errorDistribution: { knowledge: 1, execution: 1 },
      topicOutcomes: [
        { topic: 'Unspecified', correct: 0, wrong: 1 },
        { topic: 'Algebra', correct: 0, wrong: 1 },
      ],
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
