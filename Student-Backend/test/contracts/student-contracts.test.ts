import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  exerciseSetSchema,
  errorItemSchema,
  evidenceTimeSchema,
  greetingSchema,
  hintSchema,
  isoDateTimeSchema,
  jsonObjectSchema,
  learningSummarySchema,
  materialClassificationResultSchema,
  materialUploadJobSchema,
  moduleStatsSchema,
  noteFolderSchema,
  noteSchema,
  questionSchema,
  sessionSchema,
  settingsSchema,
  settingsPatchSchema,
  studentSchema,
  taskAdjustmentSchema,
  taskSchema,
} from '../../src/contracts/student-contracts.js'
import { createStudentSeedData } from '../../prisma/seed-data.js'

function completeErrorFixture(overrides: Record<string, unknown> = {}) {
  const occurredAt = '2026-08-10T09:00:00.000Z'
  return {
    id: 'error-verification',
    questionId: 'question-verification',
    sessionId: 'session-verification',
    subject: 'A-Level Math',
    errorType: 'method',
    questionSummary: 'Find the stationary point.',
    questionContent: '<p>Find the stationary point.</p>',
    type: 'calculation',
    difficulty: 3,
    errorDescription: 'The derivative method was skipped.',
    relatedTopic: 'Calculus - Extrema',
    topicId: 'calculus-extrema',
    whereWrong: 'The method-selection step.',
    whyWrong: 'The first derivative was not used.',
    linkedAbility: 'Method selection',
    hintDependency: 1,
    firstOccurredAt: occurredAt,
    lastOccurredAt: occurredAt,
    occurrences: [occurredAt],
    occurrenceKeys: ['session:session-verification:question:question-verification'],
    occurrenceRecords: [
      {
        key: 'session:session-verification:question:question-verification',
        occurredAt,
      },
    ],
    repeatCount: 1,
    status: 'pending_review',
    studentAnswer: 'x=1',
    correctAnswer: 'x=2',
    analysis: 'Differentiate first.',
    acceptKeywords: ['x=2'],
    redoHistory: [],
    verificationVariantId: null,
    variantVerifiedAt: null,
    variantVerification: null,
    ...overrides,
  }
}

const correctRedo = {
  attemptedAt: '2026-08-10T10:00:00.000Z',
  answer: 'x=2',
  isCorrect: true,
  timeSpent: 120,
}

function validTaskInput() {
  return {
    id: 'task-safe-json',
    title: 'Safe JSON task',
    type: 'teacher_assigned',
    subject: 'Math',
    estimatedMinutes: 30,
    dueAt: null,
    assignedBy: null,
    priority: 'P1',
    isOverdue: false,
    status: 'pending',
  }
}

function expectStableTaskRejection(value: unknown) {
  expect(() => taskSchema.parse(value)).toThrow(z.ZodError)
  expect(() => taskSchema.safeParse(value)).not.toThrow()
  expect(taskSchema.safeParse(value).success).toBe(false)
}

describe('student shared contracts', () => {
  it('accepts absolute ISO datetimes with Z or realistic explicit offsets', () => {
    const values = [
      '2024-02-29T23:59:59Z',
      '2026-08-10T10:06:00.000+08:00',
      '2026-08-10T10:06:00.000+14:00',
      '2026-08-10T10:06:00.000-14:00',
    ]

    for (const value of values) {
      expect(isoDateTimeSchema.safeParse(value).success, value).toBe(true)
    }
    expect(evidenceTimeSchema.safeParse('2024-02-29').success).toBe(true)
    expect(Date.parse('2026-08-10T02:06:00.000Z')).toBe(
      Date.parse('2026-08-10T10:06:00.000+08:00'),
    )
  })

  it('rejects local datetimes, unrealistic offsets, and invalid calendar values', () => {
    const values = [
      '2026-08-10T10:06:00.000',
      '2026-08-10T10:06:00.000+14:01',
      '2026-08-10T10:06:00.000+23:59',
      '2026-08-10T10:06:00.000-14:01',
      '2026-02-29T10:06:00.000Z',
    ]

    for (const value of values) {
      expect(isoDateTimeSchema.safeParse(value).success, value).toBe(false)
      expect(evidenceTimeSchema.safeParse(value).success, value).toBe(false)
    }
  })

  it('preserves optional-field presence while rejecting unknown mutation fields', () => {
    expect(settingsPatchSchema.parse({ reminderStudyTime: false })).toEqual({
      reminderStudyTime: false,
    })
    expect(() => settingsPatchSchema.parse({ tone: 50 })).toThrow()
    expect(() => settingsPatchSchema.parse({})).toThrow()
  })

  it('rejects unknown task fields', () => {
    expect(() =>
      taskSchema.parse({
        id: 'task-1',
        title: 'Task',
        type: 'teacher_assigned',
        subject: 'Math',
        estimatedMinutes: 30,
        dueAt: null,
        assignedBy: null,
        priority: 'P1',
        isOverdue: false,
        status: 'pending',
        hiddenOwner: 'student-a',
      }),
    ).toThrow()
  })

  it('rejects a syntactically shaped datetime with an impossible calendar day', () => {
    expect(() =>
      taskSchema.parse({
        id: 'task-1',
        title: 'Task',
        type: 'teacher_assigned',
        subject: 'Math',
        estimatedMinutes: 30,
        dueAt: '2026-02-31T12:00:00.000Z',
        assignedBy: null,
        priority: 'P1',
        isOverdue: false,
        status: 'pending',
      }),
    ).toThrow()
  })

  it('rejects raw note carriers at the recursive contract boundary', () => {
    expect(() =>
      noteSchema.parse({
        id: 'note-1',
        title: 'Unsafe note',
        folderId: null,
        folderPath: null,
        tags: [],
        linkedTopics: [],
        linkedErrors: [],
        source: 'photo',
        createdAt: '2026-08-10',
        updatedAt: '2026-08-10',
        content: [
          {
            t: 'image',
            v: 'data:image/png;base64,AAAA',
            reference: 'object://student-notes/image-1',
            alt: 'inline image',
          },
        ],
        aiSuggestions: [],
        version: 1,
        versions: [],
      }),
    ).toThrow()
  })

  it('rejects raw carriers disguised as upload metadata', () => {
    expect(() =>
      materialUploadJobSchema.parse({
        id: 'upload-1',
        fileName: 'base64:AAAA',
        mimeType: 'application/pdf',
        size: 100,
        materialType: 'class_note',
        createdAt: '2026-08-10T10:00:00.000Z',
        updatedAt: '2026-08-10T10:00:00.000Z',
        progress: 0,
        status: 'queued',
      }),
    ).toThrow()
  })

  it('rejects impossible material lifecycle combinations', () => {
    expect(() =>
      materialUploadJobSchema.parse({
        id: 'upload-1',
        fileName: 'notes.pdf',
        mimeType: 'application/pdf',
        size: 100,
        materialType: 'class_note',
        createdAt: '2026-08-10T10:00:00.000Z',
        updatedAt: '2026-08-10T10:00:00.000Z',
        progress: 100,
        status: 'completed',
      }),
    ).toThrow()
  })

  it('accepts all seven error categories and extended diagnostic evidence', () => {
    const base = {
      id: 'error-1',
      questionId: 'question-1',
      sessionId: null,
      subject: 'IELTS Reading',
      questionSummary: 'Summary',
      questionContent: '<p>Question</p>',
      type: 'reading',
      difficulty: 3,
      errorDescription: 'Description',
      relatedTopic: 'Reading',
      topicId: null,
      whereWrong: 'Evidence location',
      whyWrong: 'Root cause',
      linkedAbility: 'Reading comprehension',
      hintDependency: 0,
      firstOccurredAt: '2026-08-10',
      lastOccurredAt: '2026-08-10',
      occurrences: ['2026-08-10'],
      occurrenceKeys: ['card:error-1'],
      occurrenceRecords: [{ key: 'card:error-1', occurredAt: '2026-08-10' }],
      repeatCount: 1,
      status: 'pending_review',
      studentAnswer: 'A',
      correctAnswer: 'B',
      analysis: 'Analysis',
      acceptKeywords: ['B'],
      redoHistory: [],
      verificationVariantId: null,
      variantVerifiedAt: null,
      variantVerification: null,
      markSchemePoints: [{ point: 'credit evidence' }],
      passageEvidence: ['paragraph 2'],
      errorPattern: 'modal word swap',
    }

    for (const errorType of [
      'knowledge',
      'method',
      'calculation',
      'reading',
      'execution',
      'expression',
      'habit',
    ]) {
      expect(errorItemSchema.parse({ ...base, errorType }).errorType).toBe(errorType)
    }

    expect(() =>
      errorItemSchema.parse({
        ...base,
        errorType: 'reading',
        occurrenceRecords: [
          { key: 'card:error-1', occurredAt: '2026-08-11' },
        ],
      }),
    ).toThrow()
  })

  it('accepts the legal verification lifecycle states', () => {
    const variantId = 'variant-set-1'
    const wrongAudit = {
      variantId,
      isCorrect: false,
      verifiedAt: '2026-08-10T10:05:00.000Z',
    }
    const correctAudit = {
      variantId,
      isCorrect: true,
      verifiedAt: '2026-08-10T10:06:00.000Z',
    }

    const legalStates = [
      completeErrorFixture(),
      completeErrorFixture({
        status: 'verification_due',
        redoHistory: [correctRedo],
        verificationVariantId: variantId,
      }),
      completeErrorFixture({
        status: 'reviewing',
        redoHistory: [correctRedo],
        verificationVariantId: variantId,
        variantVerification: wrongAudit,
      }),
      completeErrorFixture({
        status: 'verification_due',
        redoHistory: [correctRedo],
        verificationVariantId: variantId,
        variantVerifiedAt: correctAudit.verifiedAt,
        variantVerification: correctAudit,
      }),
      completeErrorFixture({
        status: 'mastered',
        redoHistory: [correctRedo],
        verificationVariantId: variantId,
        variantVerifiedAt: correctAudit.verifiedAt,
        variantVerification: correctAudit,
      }),
    ]

    for (const state of legalStates) {
      expect(errorItemSchema.safeParse(state).success).toBe(true)
    }
  })

  it('requires the accepted verification timestamp to preserve exact identity', () => {
    const audit = {
      variantId: 'variant-set-identity',
      isCorrect: true,
      verifiedAt: '2026-08-10T10:06:00.000Z',
    }
    const verifiedState = completeErrorFixture({
      status: 'verification_due',
      redoHistory: [correctRedo],
      verificationVariantId: audit.variantId,
      variantVerification: audit,
    })

    expect(
      errorItemSchema.safeParse({
        ...verifiedState,
        variantVerifiedAt: audit.verifiedAt,
      }).success,
    ).toBe(true)
    expect(
      errorItemSchema.safeParse({
        ...verifiedState,
        variantVerifiedAt: '2026-08-10T11:06:00.000+01:00',
      }).success,
    ).toBe(false)
  })

  it.each([
    [
      'audit without variant provenance',
      completeErrorFixture({
        status: 'reviewing',
        redoHistory: [correctRedo],
        variantVerification: {
          variantId: 'variant-set-1',
          isCorrect: false,
          verifiedAt: '2026-08-10T10:05:00.000Z',
        },
      }),
    ],
    [
      'accepted time without variant provenance',
      completeErrorFixture({ variantVerifiedAt: '2026-08-10T10:05:00.000Z' }),
    ],
    [
      'wrong audit with a forged accepted time',
      completeErrorFixture({
        status: 'reviewing',
        redoHistory: [correctRedo],
        verificationVariantId: 'variant-set-1',
        variantVerifiedAt: '2026-08-10T10:05:00.000Z',
        variantVerification: {
          variantId: 'variant-set-1',
          isCorrect: false,
          verifiedAt: '2026-08-10T10:05:00.000Z',
        },
      }),
    ],
    [
      'correct audit without accepted time',
      completeErrorFixture({
        status: 'verification_due',
        redoHistory: [correctRedo],
        verificationVariantId: 'variant-set-1',
        variantVerification: {
          variantId: 'variant-set-1',
          isCorrect: true,
          verifiedAt: '2026-08-10T10:05:00.000Z',
        },
      }),
    ],
    [
      'correct audit with mismatched accepted time',
      completeErrorFixture({
        status: 'verification_due',
        redoHistory: [correctRedo],
        verificationVariantId: 'variant-set-1',
        variantVerifiedAt: '2026-08-10T10:06:00.000Z',
        variantVerification: {
          variantId: 'variant-set-1',
          isCorrect: true,
          verifiedAt: '2026-08-10T10:05:00.000Z',
        },
      }),
    ],
    [
      'wrong audit outside reviewing status',
      completeErrorFixture({
        status: 'verification_due',
        redoHistory: [correctRedo],
        verificationVariantId: 'variant-set-1',
        variantVerification: {
          variantId: 'variant-set-1',
          isCorrect: false,
          verifiedAt: '2026-08-10T10:05:00.000Z',
        },
      }),
    ],
    [
      'variant without a correct redo',
      completeErrorFixture({
        status: 'verification_due',
        verificationVariantId: 'variant-set-1',
      }),
    ],
    [
      'verification before the latest correct redo',
      completeErrorFixture({
        status: 'verification_due',
        redoHistory: [correctRedo],
        verificationVariantId: 'variant-set-1',
        variantVerifiedAt: '2026-08-10T09:59:00.000Z',
        variantVerification: {
          variantId: 'variant-set-1',
          isCorrect: true,
          verifiedAt: '2026-08-10T09:59:00.000Z',
        },
      }),
    ],
  ])('rejects illegal verification state: %s', (_case, state) => {
    expect(() => errorItemSchema.parse(state)).toThrow()
  })

  it('rejects unsafe object shapes without executing accessors or Proxy traps', () => {
    const customPrototype = Object.assign(Object.create({ inherited: true }), validTaskInput())
    expectStableTaskRejection(customPrototype)

    let getterCalls = 0
    const enumerableAccessor = validTaskInput()
    Object.defineProperty(enumerableAccessor, 'title', {
      enumerable: true,
      get() {
        getterCalls += 1
        return 'must not execute'
      },
    })
    expectStableTaskRejection(enumerableAccessor)
    expect(getterCalls).toBe(0)

    const nonEnumerableAccessor = validTaskInput()
    Object.defineProperty(nonEnumerableAccessor, 'hidden', {
      enumerable: false,
      get() {
        getterCalls += 1
        return 'must not execute'
      },
    })
    expectStableTaskRejection(nonEnumerableAccessor)
    expect(getterCalls).toBe(0)

    const nestedAccessor = [] as string[]
    Object.defineProperty(nestedAccessor, '0', {
      enumerable: true,
      get() {
        getterCalls += 1
        return 'must not execute'
      },
    })
    nestedAccessor.length = 1
    expectStableTaskRejection({ ...validTaskInput(), topicIds: nestedAccessor })
    expect(getterCalls).toBe(0)

    expectStableTaskRejection({
      ...validTaskInput(),
      topicIds: new Array<string>(1),
    })

    for (const trap of ['getPrototypeOf', 'ownKeys', 'getOwnPropertyDescriptor'] as const) {
      let trapCalls = 0
      const proxy = new Proxy(validTaskInput(), {
        getOwnPropertyDescriptor(target, key) {
          if (trap === 'getOwnPropertyDescriptor') {
            trapCalls += 1
            throw new Error('PROXY_DESCRIPTOR_SENTINEL')
          }
          return Reflect.getOwnPropertyDescriptor(target, key)
        },
        getPrototypeOf(target) {
          if (trap === 'getPrototypeOf') {
            trapCalls += 1
            throw new Error('PROXY_PROTOTYPE_SENTINEL')
          }
          return Reflect.getPrototypeOf(target)
        },
        ownKeys(target) {
          if (trap === 'ownKeys') {
            trapCalls += 1
            throw new Error('PROXY_KEYS_SENTINEL')
          }
          return Reflect.ownKeys(target)
        },
      })

      expectStableTaskRejection(proxy)
      expect(trapCalls).toBe(0)
    }
  })

  it('applies the plain-object boundary to every shared domain contract', () => {
    const seed = createStudentSeedData()
    const question = seed.exerciseSets[0]!.value.questions[0]!
    const sharedContracts: Array<[string, z.ZodType, unknown]> = [
      ['Student', studentSchema, seed.student],
      ['Task', taskSchema, seed.tasks[0]],
      ['TaskAdjustment', taskAdjustmentSchema, seed.taskAdjustments[0]],
      ['Question', questionSchema, question],
      ['Hint', hintSchema, question.hints[0]],
      ['ExerciseSet', exerciseSetSchema, seed.exerciseSets[0]!.value],
      ['Session', sessionSchema, seed.sessions[0]],
      ['ErrorItem', errorItemSchema, seed.errors[0]],
      ['Note', noteSchema, seed.notes[0]],
      ['NoteFolder', noteFolderSchema, seed.noteFolders[0]],
      ['MaterialUploadJob', materialUploadJobSchema, seed.uploadJobs[0]],
      ['Settings', settingsSchema, seed.settings],
      ['Greeting', greetingSchema, seed.greeting],
      ['ModuleStats', moduleStatsSchema, seed.moduleStats],
      ['LearningSummary', learningSummarySchema, seed.learningSummary],
    ]

    for (const [name, schema, valid] of sharedContracts) {
      const unsafe = Object.assign(Object.create({ inherited: name }), valid)
      expect(schema.safeParse(unsafe).success, name).toBe(false)
    }
  })

  it('revalidates previously parsed JSON objects instead of trusting mutable outputs', () => {
    const parsed = jsonObjectSchema.parse({ evidence: 'safe' })
    let getterCalls = 0
    Object.defineProperty(parsed, 'evidence', {
      enumerable: true,
      get() {
        getterCalls += 1
        return 'mutated'
      },
    })

    expect(() => jsonObjectSchema.parse(parsed)).toThrow(z.ZodError)
    expect(() => jsonObjectSchema.safeParse(parsed)).not.toThrow()
    expect(jsonObjectSchema.safeParse(parsed).success).toBe(false)
    expect(getterCalls).toBe(0)
  })

  it('uses exact NoteBlock variants for notes and classification content', () => {
    const result = materialClassificationResultSchema.parse({
      suggestedTitle: 'Class notes',
      materialType: 'class_note',
      examBoard: 'CAIE',
      subject: 'A-Level Math',
      chapter: 'Calculus',
      folderId: 'folder-calculus',
      folderPath: 'A-Level Math / Calculus',
      questionBlocks: [],
      answerBlocks: [],
      content: [
        { t: 'p', v: 'Paragraph' },
        { t: 'list', v: 'Item', reference: 'object://notes/list-1' },
        { t: 'highlight', v: 'Key idea', alt: 'important' },
        {
          t: 'image',
          v: 'diagram.png',
          reference: 'object://notes/diagram-1',
          alt: 'A derivative diagram',
        },
      ],
      linkedTopics: [],
      linkedErrors: [],
      confidence: 0.9,
    })
    expect(result.content).toHaveLength(4)

    for (const t of ['p', 'h', 'formula'] as const) {
      expect(() =>
        noteSchema.parse({
          id: `note-${t}`,
          title: 'Invalid extra metadata',
          folderId: null,
          folderPath: null,
          tags: [],
          linkedTopics: [],
          linkedErrors: [],
          source: 'typed',
          createdAt: '2026-08-10',
          updatedAt: '2026-08-10',
          content: [{ t, v: 'Text', reference: 'object://not-allowed' }],
          aiSuggestions: [],
          version: 1,
          versions: [],
        }),
      ).toThrow()
    }
  })

  it('rejects classification-only folder fields on upload jobs', () => {
    expect(() =>
      materialUploadJobSchema.parse({
        id: 'upload-extra-folder',
        fileName: 'notes.pdf',
        mimeType: 'application/pdf',
        size: 100,
        materialType: 'class_note',
        folderId: 'folder-calculus',
        folderPath: 'A-Level Math / Calculus',
        createdAt: '2026-08-10T10:00:00.000Z',
        updatedAt: '2026-08-10T10:00:00.000Z',
        progress: 0,
        status: 'queued',
      }),
    ).toThrow()
  })
})
