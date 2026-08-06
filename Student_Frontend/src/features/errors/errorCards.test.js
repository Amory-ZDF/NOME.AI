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

  test('never treats an arbitrary final attempt as the latest wrong answer', () => {
    const storedAnswerCard = buildErrorCard({
      question: {
        id: 'q-inconsistent-stored',
        studentAnswer: 'stored wrong response',
        result: {
          status: 'wrong',
          attempts: [{ answer: 'actually correct', isCorrect: true }],
        },
      },
    })
    const emptyAnswerCard = buildErrorCard({
      question: {
        id: 'q-inconsistent-empty',
        result: {
          status: 'wrong',
          attempts: [{ answer: 'actually correct', isCorrect: true }],
        },
      },
    })

    expect(storedAnswerCard.studentAnswer).toBe('stored wrong response')
    expect(emptyAnswerCard.studentAnswer).toBe('')
  })

  test('preserves the full completion timestamp and persists a session recurrence identity', () => {
    const card = buildErrorCard({
      question: { id: 'q1', result: { status: 'wrong' } },
      session: {
        sessionId: 'session-morning',
        completedAt: '2026-08-06T09:15:30.000Z',
      },
      id: 'e1',
      occurredAt: '2026-08-06',
    })

    expect(card).toMatchObject({
      occurrences: ['2026-08-06T09:15:30.000Z'],
      occurrenceKeys: ['session:session-morning:question:q1'],
      firstOccurredAt: '2026-08-06T09:15:30.000Z',
      lastOccurredAt: '2026-08-06T09:15:30.000Z',
    })
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

  test('ignores unidentifiable items, preserves stable card ids, and normalizes optional arrays', () => {
    expect(mergeErrorCards(null, null)).toEqual([])
    expect(mergeErrorCards(
      [null, { id: 'missing-question' }],
      [{ id: 'e2', questionId: ' q2 ', repeatCount: -3, occurrences: 'invalid', redoHistory: 'invalid' }],
    )).toEqual([
      expect.objectContaining({
        id: 'missing-question',
        questionId: 'missing-question:missing-question',
        repeatCount: 1,
        occurrences: [],
        redoHistory: [],
      }),
      expect.objectContaining({
        id: 'e2',
        questionId: 'q2',
        repeatCount: 1,
        occurrences: [],
        redoHistory: [],
      }),
    ])
  })

  test('preserves lifecycle and verification evidence for an idempotent session collision', () => {
    const merged = mergeErrorCards([{
      id: 'e1',
      questionId: 'q1',
      sessionId: 's1',
      repeatCount: 1,
      occurrences: ['2026-08-06T10:00:00.000Z'],
      occurrenceKeys: ['session:s1:question:q1'],
      status: 'verification_due',
      verificationVariantId: 'variant-approved',
      variantVerifiedAt: '2026-08-06T11:00:00.000Z',
      redoHistory: [{ attemptedAt: '2026-08-06T10:30:00.000Z', isCorrect: true }],
    }], [{
      id: 'malicious-replay',
      questionId: 'q1',
      sessionId: 's1',
      repeatCount: 1,
      occurrences: ['2026-08-06T10:00:00.000Z'],
      occurrenceKeys: ['session:s1:question:q1'],
      status: 'mastered',
      verificationVariantId: 'variant-injected',
      variantVerifiedAt: '2026-08-06T12:00:00.000Z',
    }])

    expect(merged[0]).toMatchObject({
      repeatCount: 1,
      status: 'verification_due',
      verificationVariantId: 'variant-approved',
      variantVerifiedAt: '2026-08-06T11:00:00.000Z',
      redoHistory: [{ attemptedAt: '2026-08-06T10:30:00.000Z', isCorrect: true }],
    })
  })

  test('reopens every genuine recurrence and clears stale verification evidence', () => {
    const merged = mergeErrorCards([{
      id: 'e1',
      questionId: 'q1',
      sessionId: 's1',
      repeatCount: 1,
      occurrences: ['2026-08-06T10:00:00.000Z'],
      occurrenceKeys: ['session:s1:question:q1'],
      status: 'verification_due',
      verificationVariantId: 'variant-old',
      variantVerifiedAt: '2026-08-06T11:00:00.000Z',
      redoHistory: [{ attemptedAt: '2026-08-06T10:30:00.000Z', isCorrect: true }],
    }], [{
      id: 'e2',
      questionId: 'q1',
      sessionId: 's2',
      repeatCount: 1,
      occurrences: ['2026-08-06T14:00:00.000Z'],
      occurrenceKeys: ['session:s2:question:q1'],
      status: 'mastered',
      verificationVariantId: 'variant-injected',
      variantVerifiedAt: '2026-08-06T15:00:00.000Z',
    }])

    expect(merged[0]).toMatchObject({
      id: 'e1',
      repeatCount: 2,
      status: 'pending_review',
      verificationVariantId: null,
      variantVerifiedAt: null,
      redoHistory: [{ attemptedAt: '2026-08-06T10:30:00.000Z', isCorrect: true }],
    })
  })

  test('does not let a new incoming card grant a privileged or invalid lifecycle status', () => {
    const merged = mergeErrorCards([], [
      { id: 'e1', questionId: 'q1', status: 'mastered', verificationVariantId: 'injected' },
      { id: 'e2', questionId: 'q2', status: 'verification_due', variantVerifiedAt: 'injected' },
      { id: 'e3', questionId: 'q3', status: 'not-a-status' },
    ])

    expect(merged.map(({ status, verificationVariantId, variantVerifiedAt }) => ({
      status,
      verificationVariantId,
      variantVerifiedAt,
    }))).toEqual([
      { status: 'pending_review', verificationVariantId: null, variantVerifiedAt: null },
      { status: 'pending_review', verificationVariantId: null, variantVerifiedAt: null },
      { status: 'pending_review', verificationVariantId: null, variantVerifiedAt: null },
    ])
  })

  test('counts separate same-day sessions once each while replaying either session idempotently', () => {
    const firstSession = buildErrorCard({
      question: { id: 'q1', result: { status: 'wrong' } },
      session: { sessionId: 's1', completedAt: '2026-08-06T09:00:00.000Z' },
      id: 'e1',
      occurredAt: '2026-08-06',
    })
    const secondSession = buildErrorCard({
      question: { id: 'q1', result: { status: 'wrong' } },
      session: { sessionId: 's2', completedAt: '2026-08-06T16:00:00.000Z' },
      id: 'e2',
      occurredAt: '2026-08-06',
    })

    const merged = mergeErrorCards([firstSession], [firstSession, secondSession, secondSession])

    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({
      id: 'e1',
      repeatCount: 2,
      occurrences: [
        '2026-08-06T09:00:00.000Z',
        '2026-08-06T16:00:00.000Z',
      ],
      occurrenceKeys: [
        'session:s1:question:q1',
        'session:s2:question:q1',
      ],
      firstOccurredAt: '2026-08-06T09:00:00.000Z',
      lastOccurredAt: '2026-08-06T16:00:00.000Z',
    })
  })

  test('keeps malformed cards with distinct card ids collision-safe', () => {
    const merged = mergeErrorCards([
      { id: 'malformed-one', status: 'pending_review' },
      { id: 'malformed-two', status: 'reviewing' },
      { status: 'pending_review' },
    ], [])

    expect(merged).toHaveLength(2)
    expect(merged.map(({ id, questionId }) => ({ id, questionId }))).toEqual([
      { id: 'malformed-one', questionId: 'missing-question:malformed-one' },
      { id: 'malformed-two', questionId: 'missing-question:malformed-two' },
    ])
  })

  test('keeps an incoming aggregate repeat count monotonic when it also adds a new occurrence', () => {
    const merged = mergeErrorCards([{
      id: 'e1',
      questionId: 'q1',
      repeatCount: 4,
      occurrences: ['2026-08-01'],
      status: 'verification_due',
      verificationVariantId: 'variant-old',
      variantVerifiedAt: '2026-08-02',
      redoHistory: [{ attemptedAt: '2026-08-02', answer: '42', isCorrect: true }],
    }], [{
      id: 'e2',
      questionId: 'q1',
      repeatCount: 7,
      occurrences: ['2026-08-03'],
      status: 'reviewing',
    }])

    expect(merged[0]).toMatchObject({
      id: 'e1',
      repeatCount: 7,
      occurrences: ['2026-08-01', '2026-08-03'],
      status: 'pending_review',
      verificationVariantId: null,
      variantVerifiedAt: null,
      redoHistory: [{ attemptedAt: '2026-08-02', answer: '42', isCorrect: true }],
    })
  })

  test('treats a higher aggregate count as recurrence even when occurrence identity collides', () => {
    const merged = mergeErrorCards([{
      id: 'e1',
      questionId: 'q1',
      repeatCount: 4,
      occurrences: ['2026-08-01'],
      occurrenceKeys: ['legacy:q1:2026-08-01'],
      status: 'mastered',
      verificationVariantId: 'variant-old',
      variantVerifiedAt: '2026-08-02',
      redoHistory: [{ attemptedAt: '2026-08-02', answer: '42', isCorrect: true }],
    }], [{
      id: 'e2',
      questionId: 'q1',
      repeatCount: 7,
      occurrences: ['2026-08-01'],
      occurrenceKeys: ['legacy:q1:2026-08-01'],
      status: 'reviewing',
    }])

    expect(merged[0]).toMatchObject({
      id: 'e1',
      repeatCount: 7,
      occurrences: ['2026-08-01'],
      status: 'pending_review',
      verificationVariantId: null,
      variantVerifiedAt: null,
      redoHistory: [{ attemptedAt: '2026-08-02', answer: '42', isCorrect: true }],
    })
  })

  test('keeps lifecycle and count unchanged for equal or lower idempotent aggregate input', () => {
    const existing = [{
      id: 'e1',
      questionId: 'q1',
      repeatCount: 7,
      occurrences: ['2026-08-01'],
      occurrenceKeys: ['legacy:q1:2026-08-01'],
      status: 'verification_due',
      verificationVariantId: 'variant-current',
      variantVerifiedAt: '2026-08-02',
    }]
    const sameOccurrence = {
      id: 'replay',
      questionId: 'q1',
      occurrences: ['2026-08-01'],
      occurrenceKeys: ['legacy:q1:2026-08-01'],
      status: 'reviewing',
    }

    const equal = mergeErrorCards(existing, [{ ...sameOccurrence, repeatCount: 7 }])[0]
    const lower = mergeErrorCards(existing, [{ ...sameOccurrence, repeatCount: 5 }])[0]

    for (const card of [equal, lower]) {
      expect(card).toMatchObject({
        repeatCount: 7,
        status: 'verification_due',
        verificationVariantId: 'variant-current',
        variantVerifiedAt: '2026-08-02',
      })
    }
  })

  test('normalizes an incoming reviewing card to pending review', () => {
    const merged = mergeErrorCards([], [{
      id: 'e1',
      questionId: 'q1',
      status: 'reviewing',
    }])

    expect(merged[0]).toMatchObject({
      status: 'pending_review',
      verificationVariantId: null,
      variantVerifiedAt: null,
    })
  })
})
