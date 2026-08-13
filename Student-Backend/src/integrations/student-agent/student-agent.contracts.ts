import { z } from 'zod'

import { cloneSafeJson, type JsonValue } from '../../common/json/safe-json.js'
import {
  errorTypeSchema,
  generatedQuestionSchema,
  isoDateTimeSchema,
  materialClassificationResultSchema,
  materialJobIdSchema,
  materialMetadataStringSchema,
  materialTypeSchema,
  questionSchema,
  redoAttemptSchema,
  sessionIdSchema,
} from '../../contracts/student-contracts.js'

const invalidInput = Symbol('invalid Agent contract input')

function normalizeInput(value: unknown): JsonValue | typeof invalidInput {
  try {
    return cloneSafeJson(value)
  } catch {
    return invalidInput
  }
}

function safeStrictObject<const Shape extends z.ZodRawShape>(shape: Shape) {
  return z.preprocess(normalizeInput, z.strictObject(shape))
}

const operationKeySchema = z
  .string()
  .min(1)
  .max(200)
  .refine((value) => value.trim().length > 0)
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value))
  .refine(
    (value) => !/^(?:data|base64|raw):/iu.test(value.trim()) && !/;base64,/iu.test(value),
    { message: 'Raw/base64 carriers are not allowed in operation keys' },
  )

const operationShape = {
  contractVersion: z.literal(1),
  operationKey: operationKeySchema,
  studentId: sessionIdSchema,
} as const

const materialJobMetadataSchema = safeStrictObject({
  id: materialJobIdSchema,
  fileName: materialMetadataStringSchema,
  mimeType: z.enum([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
  ]),
  size: z.number().nonnegative().max(20 * 1024 * 1024),
  materialType: materialTypeSchema,
  examBoard: materialMetadataStringSchema.optional(),
  subject: materialMetadataStringSchema.optional(),
  chapter: materialMetadataStringSchema.optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

const questionSourceSchema = safeStrictObject({
  setId: z.string().min(1).max(100),
  kind: z.enum(['task', 'bank']),
  subject: z.string().min(1),
  question: questionSchema,
})

export const materialClassificationRequestSchema = safeStrictObject({
  ...operationShape,
  job: materialJobMetadataSchema,
})

export const questionVariantRequestSchema = safeStrictObject({
  ...operationShape,
  source: questionSourceSchema,
})

export const errorVariantRequestSchema = safeStrictObject({
  ...operationShape,
  source: questionSourceSchema,
  error: safeStrictObject({
    id: sessionIdSchema,
    errorType: errorTypeSchema,
    questionSummary: z.string().min(1),
    whereWrong: z.string().min(1),
    whyWrong: z.string().min(1),
    studentAnswer: z.string(),
    correctAnswer: z.string().min(1),
    latestCorrectRedo: redoAttemptSchema.refine(({ isCorrect }) => isCorrect),
  }),
})

export const materialClassificationDataSchema = safeStrictObject({
  classification: materialClassificationResultSchema,
})

export const generatedQuestionDataSchema = safeStrictObject({
  question: generatedQuestionSchema,
})

export type MaterialClassificationRequest = z.infer<typeof materialClassificationRequestSchema>
export type QuestionVariantRequest = z.infer<typeof questionVariantRequestSchema>
export type ErrorVariantRequest = z.infer<typeof errorVariantRequestSchema>
