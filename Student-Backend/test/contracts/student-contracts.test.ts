import { describe, expect, it } from 'vitest'

import {
  errorItemSchema,
  materialUploadJobSchema,
  noteSchema,
  settingsPatchSchema,
  taskSchema,
} from '../../src/contracts/student-contracts.js'

describe('student shared contracts', () => {
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
})
