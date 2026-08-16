import { z } from 'zod'

import { cloneSafeJson, type JsonValue } from '../common/json/safe-json.js'

const invalidContractInput = Symbol('invalid contract input')

function normalizeContractInput(value: unknown): JsonValue | typeof invalidContractInput {
  try {
    return cloneSafeJson(value)
  } catch {
    return invalidContractInput
  }
}

function safeStrictObject<const Shape extends z.ZodRawShape>(shape: Shape) {
  return z.preprocess(normalizeContractInput, z.strictObject(shape))
}

const nonEmptyString = z.string().min(1).refine((value) => value.trim().length > 0, {
  message: 'Must not be blank',
})

const optionalNonEmptyString = nonEmptyString.optional()
const nullableNonEmptyString = nonEmptyString.nullable()

export const sessionIdSchema = z
  .string()
  .min(1)
  .max(100)
  .refine((value) => value.trim().length > 0, { message: 'Must not be blank' })
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value), {
    message: 'Control characters are not allowed',
  })

// Error ids are public route parameters as well as persisted client ids. Keep
// their ingress boundary identical to the router's reachable parameter limit.
export const errorIdSchema = sessionIdSchema
export const noteIdSchema = sessionIdSchema

// Confirmation deterministically creates `note-${jobId}`. Keep upload ids
// within the Note id's public 100-character contract before persistence.
export const materialJobIdSchema = z
  .string()
  .min(1)
  .max(95)
  .refine((value) => value.trim().length > 0, { message: 'Must not be blank' })
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value), {
    message: 'Control characters are not allowed',
  })
  .refine((value) => !isRawCarrier(value), { message: 'Raw carriers are not allowed' })

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (match === null) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

function isIsoDateTime(value: string): boolean {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/.exec(
    value,
  )
  if (match === null || !isCalendarDate(match[1] ?? '')) return false

  const hour = Number(match[2])
  const minute = Number(match[3])
  const second = Number(match[4])
  if (hour > 23 || minute > 59 || second > 59) return false

  if (match[5] !== 'Z') {
    const offsetHour = Number(match[6])
    const offsetMinute = Number(match[7])
    if (
      offsetHour > 14 ||
      offsetMinute > 59 ||
      (offsetHour === 14 && offsetMinute !== 0)
    ) {
      return false
    }
  }

  return Number.isFinite(Date.parse(value))
}

export const isoDateSchema = z.string().refine(isCalendarDate, {
  message: 'Expected an ISO calendar date',
})

export const isoDateTimeSchema = z.string().refine(isIsoDateTime, {
  message: 'Expected an ISO datetime',
})

export const evidenceTimeSchema = z.string().refine(
  (value) => isCalendarDate(value) || isIsoDateTime(value),
  { message: 'Expected an ISO calendar date or datetime' },
)

export const jsonValueSchema = z.preprocess(
  normalizeContractInput,
  z.custom<JsonValue>((value): value is JsonValue => value !== invalidContractInput, {
    message: 'Expected bounded, safe JSON',
  }),
)

export const jsonObjectSchema = z.preprocess(
  normalizeContractInput,
  z.custom<Record<string, JsonValue>>(
    (value): value is Record<string, JsonValue> =>
      value !== invalidContractInput &&
      value !== null &&
      !Array.isArray(value) &&
      typeof value === 'object',
    { message: 'Expected a bounded, safe JSON object' },
  ),
)

export const taskTypeSchema = z.enum([
  'teacher_assigned',
  'error_review',
  'ai_recommended',
])
export const taskStatusSchema = z.enum(['pending', 'completed'])
export const taskPrioritySchema = z.enum(['P0', 'P1', 'P2'])
export const taskAdjustmentReasonSchema = z.enum([
  'time_conflict',
  'difficulty',
  'health',
  'other',
])
export const questionTypeSchema = z.enum([
  'choice',
  'calculation',
  'proof',
  'fill_blank',
  'reading',
  'writing',
])
export const errorTypeSchema = z.enum([
  'knowledge',
  'method',
  'calculation',
  'reading',
  'execution',
  'expression',
  'habit',
])
export const errorStatusSchema = z.enum([
  'pending_review',
  'reviewing',
  'verification_due',
  'mastered',
])
export const noteSourceSchema = z.enum([
  'typed',
  'handwritten',
  'photo',
  'ai_organized',
])
export const materialTypeSchema = z.enum([
  'class_note',
  'teacher_material',
  'homework',
  'past_paper',
  'mock_paper',
  'mark_scheme',
  'ielts_passage',
  'writing_speaking',
  'handwritten_draft',
  'error_photo',
])
export const materialStatusSchema = z.enum([
  'queued',
  'processing',
  'failed',
  'needs_confirmation',
  'completed',
  'cancelled',
])

export const studentSchema = safeStrictObject({
  id: nonEmptyString,
  name: nonEmptyString,
  avatar: z.string().url().nullable(),
  joinedDays: z.number().int().nonnegative(),
  gradeInfo: nonEmptyString,
})

export const taskSchema = safeStrictObject({
  id: nonEmptyString,
  title: nonEmptyString,
  type: taskTypeSchema,
  subject: nonEmptyString,
  estimatedMinutes: z.number().int().positive(),
  dueAt: isoDateTimeSchema.nullable(),
  assignedBy: nullableNonEmptyString,
  priority: taskPrioritySchema,
  isOverdue: z.boolean(),
  status: taskStatusSchema,
  lastAccuracy: z.number().min(0).max(100).optional(),
  exerciseSetId: optionalNonEmptyString,
  topicIds: z.array(nonEmptyString).optional(),
  completedAt: isoDateTimeSchema.optional(),
  adjustmentStatus: z.literal('submitted').optional(),
  sourceQuestionId: optionalNonEmptyString,
  verificationForErrorId: optionalNonEmptyString,
  reason: optionalNonEmptyString,
  createdAt: isoDateTimeSchema.optional(),
})

export const taskAdjustmentSchema = safeStrictObject({
  id: nonEmptyString,
  taskId: nonEmptyString,
  reason: taskAdjustmentReasonSchema,
  details: z.string(),
  availableMinutes: z.number().int().nonnegative(),
  proposedDueAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
  status: z.literal('submitted'),
})

export const hintSchema = safeStrictObject({
  level: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  title: nonEmptyString,
  content: nonEmptyString,
})

// A mark scheme is the grading standard a judge (LLM or teacher) grades against.
// It is a plain-text scheme or a structured list of mark points. `markSchemePoints`
// below is the legacy structured-only form kept for the error book; the question
// template accepts either so hand-authored files stay simple.
export const markSchemeSchema = z.union([
  nonEmptyString,
  z.array(jsonObjectSchema).min(1),
])

const questionShape = {
  id: nonEmptyString,
  order: z.number().int().positive(),
  type: questionTypeSchema,
  topic: nonEmptyString,
  difficulty: z.number().int().min(1).max(5),
  content: nonEmptyString,
  // Choice questions: exactly four options + the index of the correct one. Graded
  // locally (correctIndex is deterministic). Free-response questions carry a
  // mark scheme instead and are graded by the judge (LLM or teacher).
  options: z.array(nonEmptyString).min(1).optional(),
  correctIndex: z.number().int().nonnegative().optional(),
  // Legacy: keyword-contains matching was removed from the runtime. Kept optional
  // so previously stored questions still validate.
  acceptKeywords: z.array(nonEmptyString).optional(),
  // Concise correct answer, shown after solving. Optional: choice can derive it
  // from options[correctIndex]; free-response questions may prefer markScheme.
  correctDisplay: optionalNonEmptyString,
  // The grading standard for free-response questions (judge grades against it).
  markScheme: markSchemeSchema.optional(),
  // Template errorType is unused at runtime (error_diagnosis re-classifies from
  // the student's answer). Kept optional for authoring hints only.
  errorType: errorTypeSchema.optional(),
  hints: z.array(hintSchema).length(5),
  variantOf: optionalNonEmptyString,
  sourceQuestionId: optionalNonEmptyString,
  understandingExplanation: optionalNonEmptyString,
  scoringExplanation: optionalNonEmptyString,
  markSchemePoints: z.array(jsonObjectSchema).optional(),
  passageEvidence: optionalNonEmptyString,
  errorPattern: optionalNonEmptyString,
  knowledgeNodeId: optionalNonEmptyString,
  chapter: optionalNonEmptyString,
  source: z.enum(['past_exam', 'mock', 'teacher_upload']).optional(),
  sourceDetail: optionalNonEmptyString,
  // Question images: `image` is a URL/relative path; `imageDescription` is the
  // human-authored (e.g. qwen-translated) plain-language rendering of the figure.
  image: optionalNonEmptyString,
  imageDescription: optionalNonEmptyString,
} as const

function refineQuestion(
  value: {
    type: z.infer<typeof questionTypeSchema>
    options?: string[] | undefined
    correctIndex?: number | undefined
    markScheme?: unknown
    correctDisplay?: string | undefined
    hints: Array<{ level: number }>
  },
  context: z.RefinementCtx,
) {
  const levels = value.hints.map(({ level }) => level)
  if (new Set(levels).size !== 5 || levels.some((level, index) => level !== index + 1)) {
    context.addIssue({
      code: 'custom',
      path: ['hints'],
      message: 'Hints must contain levels 1 through 5 in order',
    })
  }

  if (value.type === 'choice') {
    if (value.options === undefined || value.correctIndex === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Choice questions require options and correctIndex',
      })
    } else if (value.correctIndex >= value.options.length) {
      context.addIssue({
        code: 'custom',
        path: ['correctIndex'],
        message: 'correctIndex must reference an option',
      })
    }
  } else {
    // Free-response questions must be judge-gradeable: a mark scheme, or at least
    // a concise correct answer as a fallback grading standard.
    if (value.markScheme === undefined && value.correctDisplay === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Free-response questions require a markScheme (or correctDisplay) to grade against',
      })
    }
    if (value.correctIndex !== undefined && value.options === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['correctIndex'],
        message: 'correctIndex requires options',
      })
    }
  }
}

export const questionSchema = safeStrictObject(questionShape).superRefine(refineQuestion)

export const exerciseSetSchema = safeStrictObject({
    id: optionalNonEmptyString,
    taskId: nullableNonEmptyString,
    title: nonEmptyString,
    subject: nonEmptyString,
    questions: z.array(questionSchema).min(1),
    sourceQuestionId: optionalNonEmptyString,
    createdAt: isoDateTimeSchema.optional(),
  })
  .superRefine((value, context) => {
    const ids = value.questions.map(({ id }) => id)
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: 'custom',
        path: ['questions'],
        message: 'Exercise question ids must be unique',
      })
    }
  })

export const redoAttemptSchema = safeStrictObject({
  attemptedAt: evidenceTimeSchema,
  answer: z.string(),
  isCorrect: z.boolean(),
  timeSpent: z.number().nonnegative(),
})

export const variantVerificationSchema = safeStrictObject({
  variantId: nonEmptyString,
  isCorrect: z.boolean(),
  verifiedAt: evidenceTimeSchema,
})

export const occurrenceRecordSchema = safeStrictObject({
  key: nonEmptyString,
  occurredAt: evidenceTimeSchema,
})

export const errorItemShape = {
  id: errorIdSchema,
  questionId: nonEmptyString,
  sessionId: nullableNonEmptyString,
  subject: nonEmptyString,
  errorType: errorTypeSchema,
  questionSummary: nonEmptyString,
  questionContent: nonEmptyString,
  type: questionTypeSchema.nullable(),
  difficulty: z.number().int().min(1).max(5).nullable(),
  errorDescription: nonEmptyString,
  relatedTopic: nonEmptyString,
  topicId: nullableNonEmptyString,
  whereWrong: nonEmptyString,
  whyWrong: nonEmptyString,
  linkedAbility: nonEmptyString,
  hintDependency: z.number().int().nonnegative(),
  firstOccurredAt: evidenceTimeSchema,
  lastOccurredAt: evidenceTimeSchema,
  occurrences: z.array(evidenceTimeSchema).min(1),
  occurrenceKeys: z.array(nonEmptyString).min(1),
  occurrenceRecords: z.array(occurrenceRecordSchema).min(1),
  repeatCount: z.number().int().positive(),
  hasIncompleteOccurrenceHistory: z.boolean().optional(),
  status: errorStatusSchema,
  studentAnswer: z.string(),
  correctAnswer: z.string(),
  analysis: nonEmptyString,
  acceptKeywords: z.array(nonEmptyString).optional(),
  options: z.array(nonEmptyString).min(1).optional(),
  correctIndex: z.number().int().nonnegative().optional(),
  redoHistory: z.array(redoAttemptSchema),
  verificationVariantId: nullableNonEmptyString,
  variantVerifiedAt: evidenceTimeSchema.nullable(),
  variantVerification: variantVerificationSchema.nullable(),
  understandingExplanation: optionalNonEmptyString,
  scoringExplanation: optionalNonEmptyString,
  markSchemePoints: z.array(jsonObjectSchema).optional(),
  passageEvidence: z.union([nonEmptyString, z.array(nonEmptyString)]).optional(),
  errorPattern: optionalNonEmptyString,
} satisfies z.ZodRawShape

export const errorItemSchema = safeStrictObject(errorItemShape)
  .superRefine((value, context) => {
    const uniqueKeys = new Set(value.occurrenceKeys)
    const recordKeys = value.occurrenceRecords.map(({ key }) => key)
    const uniqueRecordKeys = new Set(recordKeys)
    if (
      uniqueKeys.size !== value.occurrenceKeys.length ||
      uniqueRecordKeys.size !== recordKeys.length ||
      value.occurrenceKeys.length !== value.occurrenceRecords.length ||
      value.occurrenceKeys.some((key, index) => key !== recordKeys[index]) ||
      value.occurrences.length !== value.occurrenceRecords.length ||
      value.occurrences.some(
        (occurredAt, index) => occurredAt !== value.occurrenceRecords[index]?.occurredAt,
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['occurrenceRecords'],
        message: 'Occurrence identities must be unique and aligned',
      })
    }

    if (
      (value.hasIncompleteOccurrenceHistory !== true &&
        value.repeatCount !== value.occurrenceRecords.length) ||
      (value.hasIncompleteOccurrenceHistory === true &&
        value.repeatCount < value.occurrenceRecords.length)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['repeatCount'],
        message: 'repeatCount must equal complete occurrence identities',
      })
    }

    if (value.correctIndex !== undefined) {
      if (value.options === undefined || value.correctIndex >= value.options.length) {
        context.addIssue({
          code: 'custom',
          path: ['correctIndex'],
          message: 'correctIndex must reference an option',
        })
      }
    }

    if (value.verificationVariantId === null) {
      if (value.variantVerifiedAt !== null || value.variantVerification !== null) {
        context.addIssue({
          code: 'custom',
          path: ['variantVerification'],
          message: 'Verification evidence requires variant provenance',
        })
      }
      if (value.status === 'mastered') {
        context.addIssue({
          code: 'custom',
          path: ['status'],
          message: 'Mastery requires an accepted variant verification',
        })
      }
      return
    }

    const correctRedoTimes = value.redoHistory
      .filter(({ isCorrect }) => isCorrect)
      .map(({ attemptedAt }) => Date.parse(attemptedAt))
    const latestCorrectRedoAt =
      correctRedoTimes.length === 0 ? undefined : Math.max(...correctRedoTimes)
    if (latestCorrectRedoAt === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['verificationVariantId'],
        message: 'A verification variant requires a correct redo',
      })
    }

    if (value.variantVerification === null) {
      if (value.variantVerifiedAt !== null) {
        context.addIssue({
          code: 'custom',
          path: ['variantVerifiedAt'],
          message: 'Accepted verification time requires a correct audit',
        })
      }
      if (value.status !== 'verification_due') {
        context.addIssue({
          code: 'custom',
          path: ['status'],
          message: 'An unaudited variant must remain due for verification',
        })
      }
      return
    }

    if (value.verificationVariantId !== value.variantVerification.variantId) {
      context.addIssue({
        code: 'custom',
        path: ['variantVerification', 'variantId'],
        message: 'Verification variant ids must match',
      })
    }

    const auditTime = Date.parse(value.variantVerification.verifiedAt)
    if (latestCorrectRedoAt !== undefined && auditTime < latestCorrectRedoAt) {
      context.addIssue({
        code: 'custom',
        path: ['variantVerification', 'verifiedAt'],
        message: 'Variant verification cannot predate the latest correct redo',
      })
    }

    if (!value.variantVerification.isCorrect) {
      if (value.variantVerifiedAt !== null) {
        context.addIssue({
          code: 'custom',
          path: ['variantVerifiedAt'],
          message: 'An incorrect verification cannot set an accepted time',
        })
      }
      if (value.status !== 'reviewing') {
        context.addIssue({
          code: 'custom',
          path: ['status'],
          message: 'An incorrect verification must return to reviewing',
        })
      }
      return
    }

    if (
      value.variantVerifiedAt === null ||
      value.variantVerifiedAt !== value.variantVerification.verifiedAt
    ) {
      context.addIssue({
        code: 'custom',
        path: ['variantVerifiedAt'],
        message: 'A correct audit must match the accepted verification time',
      })
    }
    if (value.status !== 'verification_due' && value.status !== 'mastered') {
      context.addIssue({
        code: 'custom',
        path: ['status'],
        message: 'A correct verification must be due or mastered',
      })
    }
  })

export const noteBlockTypeSchema = z.enum([
  'p',
  'h',
  'formula',
  'image',
  'list',
  'highlight',
])

function isRawCarrier(value: string): boolean {
  const normalized = value.trim()
  return /^(?:data|base64|raw):/i.test(normalized) || /;base64,/i.test(normalized)
}

const plainNoteBlockSchema = safeStrictObject({
  t: z.enum(['p', 'h', 'formula']),
  v: z.string(),
})

const annotatedNoteBlockSchema = safeStrictObject({
  t: z.enum(['list', 'highlight']),
  v: z.string(),
  reference: z.string().optional(),
  alt: z.string().optional(),
}).superRefine((value, context) => {
  if (value.reference !== undefined && isRawCarrier(value.reference)) {
    context.addIssue({
      code: 'custom',
      path: ['reference'],
      message: 'Inline raw/base64 references are not allowed',
    })
  }
})

const imageNoteBlockSchema = safeStrictObject({
  t: z.literal('image'),
  v: z.string(),
  reference: nonEmptyString,
  alt: nonEmptyString,
})
  .superRefine((value, context) => {
    if (isRawCarrier(value.reference)) {
      context.addIssue({
        code: 'custom',
        path: ['reference'],
        message: 'Inline raw/base64 references are not allowed',
      })
    }
    if (isRawCarrier(value.v)) {
      context.addIssue({
        code: 'custom',
        path: ['v'],
        message: 'Inline raw/base64 image values are not allowed',
      })
    }
  })

export const noteBlockSchema = z.union([
  plainNoteBlockSchema,
  annotatedNoteBlockSchema,
  imageNoteBlockSchema,
])

// These are persisted client suggestions only.  They deliberately describe no
// model output or generation capability; organize consumes an id selected by
// the client from this already-stored data.
const aiSuggestionIdSchema = noteIdSchema.optional()
const aiSuggestionMessageSchema = nonEmptyString.optional()
export const aiSuggestionSchema = z.union([
  safeStrictObject({ id: aiSuggestionIdSchema, type: z.enum(['split_note', 'related_content']), message: nonEmptyString }),
  safeStrictObject({ id: aiSuggestionIdSchema, type: z.enum(['add_tag', 'tag']), message: aiSuggestionMessageSchema, tag: nonEmptyString }),
  safeStrictObject({ id: aiSuggestionIdSchema, type: z.enum(['add_tag', 'tag']), message: aiSuggestionMessageSchema, value: nonEmptyString }),
  safeStrictObject({ id: aiSuggestionIdSchema, type: z.enum(['append_content', 'content']), message: aiSuggestionMessageSchema, content: z.array(noteBlockSchema).min(1) }),
  safeStrictObject({ id: aiSuggestionIdSchema, type: z.enum(['append_content', 'content']), message: aiSuggestionMessageSchema, blocks: z.array(noteBlockSchema).min(1) }),
  safeStrictObject({ id: aiSuggestionIdSchema, type: z.literal('link_topic'), message: nonEmptyString }),
  safeStrictObject({ id: aiSuggestionIdSchema, type: z.literal('link_topic'), message: aiSuggestionMessageSchema, topicId: nonEmptyString }),
  safeStrictObject({ id: aiSuggestionIdSchema, type: z.literal('link_topic'), message: aiSuggestionMessageSchema, value: nonEmptyString }),
  safeStrictObject({ id: aiSuggestionIdSchema, type: z.literal('link_error'), message: aiSuggestionMessageSchema, errorId: nonEmptyString }),
  safeStrictObject({ id: aiSuggestionIdSchema, type: z.literal('link_error'), message: aiSuggestionMessageSchema, value: nonEmptyString }),
])

export const questionBlockSchema = safeStrictObject({
  id: nonEmptyString,
  label: nonEmptyString,
  text: nonEmptyString,
})

export const answerBlockSchema = safeStrictObject({
  id: nonEmptyString,
  questionId: nonEmptyString,
  text: nonEmptyString,
})

export const noteVersionSnapshotSchema = safeStrictObject({
  version: z.number().int().positive(),
  title: nonEmptyString,
  folderId: nullableNonEmptyString,
  folderPath: nullableNonEmptyString,
  tags: z.array(nonEmptyString),
  content: z.array(noteBlockSchema),
  linkedTopics: z.array(nonEmptyString),
  linkedErrors: z.array(nonEmptyString),
  source: noteSourceSchema.nullable().optional(),
  changedAt: evidenceTimeSchema,
  reason: nonEmptyString,
})

const noteShape = {
    id: noteIdSchema,
    title: nonEmptyString,
    materialType: materialTypeSchema.optional(),
    examBoard: optionalNonEmptyString,
    subject: optionalNonEmptyString,
    chapter: optionalNonEmptyString,
    folderId: nullableNonEmptyString,
    folderPath: nullableNonEmptyString,
    tags: z.array(nonEmptyString),
    linkedTopics: z.array(nonEmptyString),
    linkedErrors: z.array(nonEmptyString),
    source: noteSourceSchema,
    createdAt: evidenceTimeSchema,
    updatedAt: evidenceTimeSchema,
    content: z.array(noteBlockSchema),
    aiSuggestions: z.array(aiSuggestionSchema),
    questionBlocks: z.array(questionBlockSchema).optional(),
    answerBlocks: z.array(answerBlockSchema).optional(),
    sourceJobId: optionalNonEmptyString,
    version: z.number().int().positive(),
    versions: z.array(noteVersionSnapshotSchema),
  }

export const noteSchema = safeStrictObject(noteShape)
  .superRefine((value, context) => {
    if (value.versions.length !== value.version - 1) {
      context.addIssue({
        code: 'custom',
        path: ['versions'],
        message: 'Version history must contain every prior version',
      })
    }
    value.versions.forEach((snapshot, index) => {
      if (snapshot.version !== index + 1) {
        context.addIssue({
          code: 'custom',
          path: ['versions', index, 'version'],
          message: 'Version history must be continuous',
        })
      }
    })

    const explicitSuggestionIds = value.aiSuggestions.flatMap((suggestion) => (
      suggestion.id === undefined ? [] : [suggestion.id]
    ))
    if (new Set(explicitSuggestionIds).size !== explicitSuggestionIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['aiSuggestions'],
        message: 'Explicit AI suggestion ids must be unique',
      })
    }

    const questionIds = new Set((value.questionBlocks ?? []).map(({ id }) => id))
    if (questionIds.size !== (value.questionBlocks ?? []).length) {
      context.addIssue({
        code: 'custom',
        path: ['questionBlocks'],
        message: 'Question block ids must be unique',
      })
    }
    const answerIds = new Set((value.answerBlocks ?? []).map(({ id }) => id))
    if (answerIds.size !== (value.answerBlocks ?? []).length) {
      context.addIssue({
        code: 'custom',
        path: ['answerBlocks'],
        message: 'Answer block ids must be unique',
      })
    }
    value.answerBlocks?.forEach((answer, index) => {
      if (!questionIds.has(answer.questionId)) {
        context.addIssue({
          code: 'custom',
          path: ['answerBlocks', index, 'questionId'],
          message: 'Answer blocks must reference a known question block',
        })
      }
    })
  })

// Runtime create contract: both alternatives enter the same complete persisted
// contract. The legacy alternative only supplies the two historical defaults.
const legacyNoteCreateSchema = z.preprocess((value) => {
  const cloned = normalizeContractInput(value)
  if (cloned === invalidContractInput || cloned === null || typeof cloned !== 'object' || Array.isArray(cloned)) return invalidContractInput
  if (Object.hasOwn(cloned, 'version') || Object.hasOwn(cloned, 'versions')) return invalidContractInput
  return { ...cloned, version: 1, versions: [] }
}, noteSchema)
export const noteCreateSchema = z.union([noteSchema, legacyNoteCreateSchema])

// Public input schema remains transform-free so Swagger can render both exact
// branches without exposing the internal normalization step.
export const noteCreateCurrentSchema = z.strictObject(noteShape)
export const noteCreateLegacySchema = z.strictObject((( { version, versions, ...legacy }) => legacy)(noteShape))
export const noteCreatePublicSchema = z.union([noteCreateCurrentSchema, noteCreateLegacySchema])

export const materialClassificationResultSchema = safeStrictObject({
    suggestedTitle: nonEmptyString,
    materialType: materialTypeSchema,
    examBoard: nonEmptyString,
    subject: nonEmptyString,
    chapter: nonEmptyString,
    folderId: nonEmptyString,
    folderPath: nonEmptyString,
    questionBlocks: z.array(questionBlockSchema),
    answerBlocks: z.array(answerBlockSchema),
    content: z.array(noteBlockSchema).min(1),
    linkedTopics: z.array(nonEmptyString),
    linkedErrors: z.array(nonEmptyString),
    confidence: z.number().min(0).max(1),
  })
  .superRefine((value, context) => {
    const questionIds = new Set(value.questionBlocks.map(({ id }) => id))
    if (questionIds.size !== value.questionBlocks.length) {
      context.addIssue({
        code: 'custom',
        path: ['questionBlocks'],
        message: 'Question block ids must be unique',
      })
    }
    const answerIds = new Set(value.answerBlocks.map(({ id }) => id))
    if (answerIds.size !== value.answerBlocks.length) {
      context.addIssue({
        code: 'custom',
        path: ['answerBlocks'],
        message: 'Answer block ids must be unique',
      })
    }
    value.answerBlocks.forEach((answer, index) => {
      if (!questionIds.has(answer.questionId)) {
        context.addIssue({
          code: 'custom',
          path: ['answerBlocks', index, 'questionId'],
          message: 'Answer blocks must reference a known question block',
        })
      }
    })
  })

export const materialFailureSchema = safeStrictObject({
  code: nonEmptyString,
  message: nonEmptyString,
})

export const materialUploadJobSchema = safeStrictObject({
    id: materialJobIdSchema,
    fileName: nonEmptyString,
    mimeType: z.enum([
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
    ]),
    size: z.number().nonnegative().max(20 * 1024 * 1024),
    materialType: materialTypeSchema,
    examBoard: optionalNonEmptyString,
    subject: optionalNonEmptyString,
    chapter: optionalNonEmptyString,
    folderId: optionalNonEmptyString,
    folderPath: optionalNonEmptyString,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
    progress: z.number().min(0).max(100),
    status: materialStatusSchema,
    result: materialClassificationResultSchema.optional(),
    failure: materialFailureSchema.optional(),
  })
  .superRefine((value, context) => {
    for (const field of [
      'fileName',
      'examBoard',
      'subject',
      'chapter',
    ] as const) {
      const metadata = value[field]
      if (metadata !== undefined && isRawCarrier(metadata)) {
        context.addIssue({
          code: 'custom',
          path: [field],
          message: 'Raw/base64 carriers are not allowed in upload metadata',
        })
      }
    }

    if (value.status === 'failed') {
      if (value.failure === undefined || value.result !== undefined) {
        context.addIssue({
          code: 'custom',
          message: 'Failed jobs require failure and cannot contain result',
        })
      }
      return
    }
    if (value.failure !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['failure'],
        message: 'Only failed jobs may contain failure',
      })
    }
    if (value.status === 'needs_confirmation' || value.status === 'completed') {
      if (value.result === undefined) {
        context.addIssue({
          code: 'custom',
          path: ['result'],
          message: 'Processed jobs require a classification result',
        })
      }
    } else if (value.result !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['result'],
        message: 'Unprocessed jobs cannot contain a classification result',
      })
    }

    if ((value.folderId !== undefined || value.folderPath !== undefined)
      && value.status !== 'needs_confirmation' && value.status !== 'completed') {
      context.addIssue({
        code: 'custom',
        path: ['folderId'],
        message: 'Classification folder metadata is only valid after processing',
      })
    }
  })

export interface NoteFolderContract {
  id: string
  name: string
  noteCount: number
  autoCreated: boolean
  children?: NoteFolderContract[] | undefined
  parentId?: string | undefined
}

export const noteFolderSchema: z.ZodType<NoteFolderContract> = z.lazy(() =>
  safeStrictObject({
    id: nonEmptyString,
    name: nonEmptyString,
    noteCount: z.number().int().nonnegative(),
    autoCreated: z.boolean(),
    children: z.array(noteFolderSchema).optional(),
    parentId: optionalNonEmptyString,
  }),
)

export const settingsSchema = safeStrictObject({
  tone: z.number().min(0).max(100),
  dailyGoalHours: z.number().min(1).max(12),
  reminderTask: z.boolean(),
  reminderErrorReview: z.boolean(),
  reminderStudyTime: z.boolean(),
})

export const defaultSettings = settingsSchema.parse({
  tone: 35,
  dailyGoalHours: 4,
  reminderTask: true,
  reminderErrorReview: true,
  reminderStudyTime: false,
})

export const settingsPatchSchema = safeStrictObject({
    dailyGoalHours: z.number().min(1).max(12).optional(),
    reminderErrorReview: z.boolean().optional(),
    reminderStudyTime: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one setting is required',
  })

export const greetingSchema = safeStrictObject({
  message: nonEmptyString,
  fallback: nonEmptyString,
})

export const moduleStatsSchema = safeStrictObject({
  notesCount: z.number().int().nonnegative(),
  weeklyExercises: z.number().int().nonnegative(),
  latestAccuracy: z.number().min(0).max(100),
  pendingErrorReview: z.number().int().nonnegative(),
})

export const knowledgeHeatmapItemSchema = safeStrictObject({
  topicId: nonEmptyString,
  topicName: nonEmptyString,
  mastery: z.number().min(0).max(100),
})

export const learningSummarySchema = safeStrictObject({
  overallMastery: z.number().min(0).max(100),
  weeklyCompleted: z.number().int().nonnegative(),
  weeklyTotal: z.number().int().nonnegative(),
  overdueTasks: z.number().int().nonnegative(),
  weakTopics: z.array(nonEmptyString),
  knowledgeHeatmap: z.array(knowledgeHeatmapItemSchema),
})

export const sessionAttemptSchema = safeStrictObject({
  answer: z.string(),
  normalizedAnswer: z.string().optional(),
  submittedAt: isoDateTimeSchema,
  isCorrect: z.boolean(),
})

export const sessionResultSchema = safeStrictObject({
    status: z.enum(['correct', 'wrong', 'unanswered']),
    attempts: z.array(sessionAttemptSchema),
    hintsUsed: z.number().int().min(0).max(5),
    solvedAtHintLevel: z.number().int().min(0).max(5).nullable(),
    handwritingUsed: z.boolean().optional(),
    // Agent diagnosis evidence carried through to the error book. Optional so
    // the exercise engine's pre-diagnosis result shape (and any persisted
    // session without agent wiring) still validates.
    errorType: errorTypeSchema.optional(),
    whereWrong: nonEmptyString.optional(),
    whyWrong: nonEmptyString.optional(),
    understandingExplanation: optionalNonEmptyString,
    scoringExplanation: optionalNonEmptyString,
  })
  .superRefine((value, context) => {
    const hasCorrectAttempt = value.attempts.some(({ isCorrect }) => isCorrect)
    if (value.status === 'correct') {
      if (
        !hasCorrectAttempt ||
        value.solvedAtHintLevel === null ||
        value.solvedAtHintLevel !== value.hintsUsed
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Correct results require consistent solved evidence',
        })
      }
      return
    }

    if (value.solvedAtHintLevel !== null) {
      context.addIssue({
        code: 'custom',
        path: ['solvedAtHintLevel'],
        message: 'Unsolved results cannot contain solved evidence',
      })
    }

    if (value.status === 'wrong') {
      if (
        value.attempts.length === 0 ||
        hasCorrectAttempt ||
        value.hintsUsed === 0
      ) {
        context.addIssue({
          code: 'custom',
          path: ['attempts'],
          message: 'Wrong results require incorrect attempts and an unlocked hint',
        })
      }
      return
    }

    if (value.attempts.length !== 0 || value.hintsUsed !== 0) {
      context.addIssue({
        code: 'custom',
        message: 'Unanswered results cannot contain attempt or hint evidence',
      })
    }
  })

export const sessionQuestionSchema = safeStrictObject({
    ...questionShape,
    result: sessionResultSchema,
  })
  .superRefine((value, context) => refineQuestion(value, context))

export const sessionSchema = safeStrictObject({
    sessionId: sessionIdSchema,
    taskId: nullableNonEmptyString,
    taskTitle: nonEmptyString,
    subject: nonEmptyString,
    completedAt: isoDateTimeSchema,
    timeSpent: z.number().nonnegative(),
    timeSpentSeconds: z.number().nonnegative(),
    questions: z.array(sessionQuestionSchema).min(1),
  })
  .superRefine((value, context) => {
    const ids = value.questions.map(({ id }) => id)
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: 'custom',
        path: ['questions'],
        message: 'Session question ids must be unique',
      })
    }

    const orders = value.questions.map(({ order }) => order)
    if (new Set(orders).size !== orders.length) {
      context.addIssue({
        code: 'custom',
        path: ['questions'],
        message: 'Session question order values must be unique',
      })
    }

    if (value.timeSpent !== Math.round(value.timeSpentSeconds / 60)) {
      context.addIssue({
        code: 'custom',
        path: ['timeSpent'],
        message: 'Session minute and second durations must align',
      })
    }

    const completedAt = Date.parse(value.completedAt)
    const startedAt = completedAt - value.timeSpentSeconds * 1_000
    if (!Number.isFinite(startedAt)) {
      context.addIssue({
        code: 'custom',
        path: ['timeSpentSeconds'],
        message: 'Session duration must produce a finite start instant',
      })
    }
    value.questions.forEach((question, questionIndex) => {
      let previousAttemptAt = Number.NEGATIVE_INFINITY
      question.result.attempts.forEach((attempt, attemptIndex) => {
        const submittedAt = Date.parse(attempt.submittedAt)
        if (
          submittedAt < startedAt ||
          submittedAt > completedAt ||
          submittedAt < previousAttemptAt
        ) {
          context.addIssue({
            code: 'custom',
            path: ['questions', questionIndex, 'result', 'attempts', attemptIndex, 'submittedAt'],
            message: 'Attempt timestamps must be chronological within the session',
          })
        }
        previousAttemptAt = submittedAt
      })
    })
  })

// Bootstrap is a service-owned aggregate assembled from the individually
// hardened schemas below. Keeping the aggregate itself unbudgeted avoids
// applying one payload's ingress limit across an arbitrary number of records.
export const trustedBootstrapDataSchema = z.strictObject({
  student: studentSchema,
  tasks: z.array(taskSchema),
  taskAdjustments: z.array(taskAdjustmentSchema),
  exerciseSets: z.record(z.string(), exerciseSetSchema),
  bankExerciseSets: z.record(z.string(), exerciseSetSchema),
  sessions: z.record(z.string(), sessionSchema),
  errors: z.array(errorItemSchema),
  notes: z.array(noteSchema),
  uploadJobs: z.array(materialUploadJobSchema),
  noteFolders: z.array(noteFolderSchema),
  settings: settingsSchema,
  greeting: greetingSchema,
  moduleStats: moduleStatsSchema,
  learningSummary: learningSummarySchema,
})

export const bootstrapDataSchema = trustedBootstrapDataSchema

export type Student = z.infer<typeof studentSchema>
export type Task = z.infer<typeof taskSchema>
export type TaskAdjustment = z.infer<typeof taskAdjustmentSchema>
export type Question = z.infer<typeof questionSchema>
export type Hint = z.infer<typeof hintSchema>
export type ExerciseSet = z.infer<typeof exerciseSetSchema>
export type Session = z.infer<typeof sessionSchema>
export type SessionQuestion = z.infer<typeof sessionQuestionSchema>
export type ErrorItem = z.infer<typeof errorItemSchema>
export type RedoAttempt = z.infer<typeof redoAttemptSchema>
export type VariantVerification = z.infer<typeof variantVerificationSchema>
export type Note = z.infer<typeof noteSchema>
export type NoteFolder = z.infer<typeof noteFolderSchema>
export type MaterialClassificationResult = z.infer<typeof materialClassificationResultSchema>
export type MaterialUploadJob = z.infer<typeof materialUploadJobSchema>
export type Settings = z.infer<typeof settingsSchema>
export type SettingsPatch = z.infer<typeof settingsPatchSchema>
export type Greeting = z.infer<typeof greetingSchema>
export type ModuleStats = z.infer<typeof moduleStatsSchema>
export type LearningSummary = z.infer<typeof learningSummarySchema>
export type BootstrapData = z.infer<typeof trustedBootstrapDataSchema>
