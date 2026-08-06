import { describe, expect, test } from 'vitest'
import { buildErrorCard, mergeErrorCards } from './errorCards'

describe('buildErrorCard', () => {
  test('captures the latest wrong attempt and complete diagnostic evidence', () => {
    const card = buildErrorCard({
      question: {
        id: 'q1',
        topic: 'Calculus',
        topicId: 'calculus-differentiation',
        errorType: 'calculation',
        content: 'Differentiate f(x).',
        correctDisplay: '42',
        whereWrong: 'The sign changed on the differentiation line.',
        whyWrong: 'The negative coefficient was copied as positive.',
        acceptKeywords: ['42'],
        result: {
          status: 'wrong',
          hintsUsed: 4,
          attempts: [
            { answer: '40', isCorrect: false },
            { answer: '41', isCorrect: false },
            { answer: '42', isCorrect: true },
          ],
        },
      },
      session: { sessionId: 's1', subject: 'A-Level Math' },
      id: 'e1',
      occurredAt: '2026-08-06',
    })

    expect(card).toMatchObject({
      id: 'e1',
      questionId: 'q1',
      sessionId: 's1',
      subject: 'A-Level Math',
      errorType: 'calculation',
      studentAnswer: '41',
      correctAnswer: '42',
      whereWrong: 'The sign changed on the differentiation line.',
      whyWrong: 'The negative coefficient was copied as positive.',
      linkedAbility: 'calculation accuracy',
      hintDependency: 4,
      occurrences: ['2026-08-06'],
      firstOccurredAt: '2026-08-06',
      lastOccurredAt: '2026-08-06',
      repeatCount: 1,
      status: 'pending_review',
      redoHistory: [],
      verificationVariantId: null,
      variantVerifiedAt: null,
    })
  })

  test.each([
    ['knowledge', 'knowledge recall'],
    ['method', 'method selection'],
    ['calculation', 'calculation accuracy'],
    ['reading', 'reading comprehension'],
    ['execution', 'task execution'],
    ['expression', 'answer expression'],
    ['habit', 'error prevention habits'],
  ])('links the %s diagnosis to its supported ability', (errorType, linkedAbility) => {
    const card = buildErrorCard({
      question: { id: `q-${errorType}`, topic: 'Topic', errorType, result: { status: 'wrong' } },
      session: { subject: 'Subject' },
      occurredAt: '2026-08-06',
    })

    expect(card.linkedAbility).toBe(linkedAbility)
  })

  test('preserves A-Level understanding, scoring, and mark-scheme evidence', () => {
    const markSchemePoints = [
      { phrase: 'Differentiate term by term', mark: 'M1' },
      { phrase: 'Substitute x = 2', mark: 'A1' },
    ]
    const card = buildErrorCard({
      question: {
        id: 'alevel-1',
        topic: 'Calculus',
        errorType: 'method',
        understandingExplanation: 'The derivative gives the tangent slope.',
        scoringExplanation: 'M1 is earned for the method; A1 for the evaluated answer.',
        markSchemePoints,
        result: { status: 'wrong' },
      },
      session: { subject: 'A-Level Math' },
      occurredAt: '2026-08-06',
    })

    expect(card).toMatchObject({
      understandingExplanation: 'The derivative gives the tangent slope.',
      scoringExplanation: 'M1 is earned for the method; A1 for the evaluated answer.',
      markSchemePoints,
    })
    expect(card.markSchemePoints).not.toBe(markSchemePoints)
  })

  test('preserves IELTS passage evidence and the observed error pattern', () => {
    const passageEvidence = ['The passage says encourage, not mandate.']
    const card = buildErrorCard({
      question: {
        id: 'ielts-1',
        topic: 'True / False / Not Given',
        errorType: 'reading',
        passageEvidence,
        errorPattern: 'confused a recommendation with a requirement',
        result: { status: 'wrong' },
      },
      session: { subject: 'IELTS Reading' },
      occurredAt: '2026-08-06',
    })

    expect(card).toMatchObject({
      passageEvidence,
      errorPattern: 'confused a recommendation with a requirement',
    })
    expect(card.passageEvidence).not.toBe(passageEvidence)
  })

  test('returns safe complete defaults when optional source fields are malformed', () => {
    const card = buildErrorCard({ question: null, session: null, occurredAt: null })

    expect(card).toMatchObject({
      questionId: 'unknown-question',
      subject: 'Unspecified',
      errorType: 'knowledge',
      linkedAbility: 'knowledge recall',
      hintDependency: 0,
      occurrences: [],
      repeatCount: 1,
      status: 'pending_review',
      redoHistory: [],
      verificationVariantId: null,
      variantVerifiedAt: null,
    })
    expect(card.whereWrong).toEqual(expect.any(String))
    expect(card.whyWrong).toEqual(expect.any(String))
  })
})

describe('mergeErrorCards', () => {
  test('merges repeated questions immutably, chronologically, and without duplicate occurrences', () => {
    const existing = [{
      id: 'e1',
      questionId: 'q1',
      repeatCount: 1,
      occurrences: ['2026-08-03'],
      firstOccurredAt: '2026-08-03',
      lastOccurredAt: '2026-08-03',
      status: 'mastered',
      redoHistory: [{ attemptedAt: '2026-08-04', answer: '42', isCorrect: true }],
    }]
    const incoming = [
      {
        id: 'e2',
        questionId: 'q1',
        repeatCount: 1,
        occurrences: ['2026-08-06'],
        firstOccurredAt: '2026-08-06',
        lastOccurredAt: '2026-08-06',
        status: 'pending_review',
        redoHistory: [{ attemptedAt: '2026-08-05', answer: '41', isCorrect: false }],
      },
      {
        id: 'e3',
        questionId: 'q1',
        repeatCount: 1,
        occurrences: ['2026-08-01', '2026-08-06'],
        status: 'pending_review',
        redoHistory: [{ attemptedAt: '2026-08-05', answer: '41', isCorrect: false }],
      },
    ]
    const existingSnapshot = structuredClone(existing)
    const incomingSnapshot = structuredClone(incoming)

    const merged = mergeErrorCards(existing, incoming)

    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({
      id: 'e1',
      questionId: 'q1',
      repeatCount: 3,
      occurrences: ['2026-08-01', '2026-08-03', '2026-08-06'],
      firstOccurredAt: '2026-08-01',
      lastOccurredAt: '2026-08-06',
      status: 'pending_review',
      redoHistory: [
        { attemptedAt: '2026-08-04', answer: '42', isCorrect: true },
        { attemptedAt: '2026-08-05', answer: '41', isCorrect: false },
      ],
    })
    expect(existing).toEqual(existingSnapshot)
    expect(incoming).toEqual(incomingSnapshot)
    expect(merged[0]).not.toBe(existing[0])
    expect(merged[0].occurrences).not.toBe(existing[0].occurrences)
    expect(merged[0].redoHistory).not.toBe(existing[0].redoHistory)
  })

  test('keeps the first existing id while deduplicating repeated items already present in existing data', () => {
    const merged = mergeErrorCards([
      { id: 'stable', questionId: 'q1', repeatCount: 1, occurrences: ['2026-08-01'] },
      { id: 'duplicate', questionId: 'q1', repeatCount: 1, occurrences: ['2026-08-02'] },
    ], [])

    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({
      id: 'stable',
      repeatCount: 2,
      occurrences: ['2026-08-01', '2026-08-02'],
      lastOccurredAt: '2026-08-02',
    })
  })

  test('ignores malformed items and normalizes optional array fields', () => {
    expect(mergeErrorCards(null, null)).toEqual([])
    expect(mergeErrorCards(
      [null, { id: 'missing-question' }],
      [{ id: 'e2', questionId: ' q2 ', repeatCount: -3, occurrences: 'invalid', redoHistory: 'invalid' }],
    )).toEqual([
      expect.objectContaining({
        id: 'e2',
        questionId: 'q2',
        repeatCount: 1,
        occurrences: [],
        redoHistory: [],
      }),
    ])
  })
})
