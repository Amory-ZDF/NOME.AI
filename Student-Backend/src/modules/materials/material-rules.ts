import { AppError } from '../../common/errors/app-error.js'
import { isProxy } from 'node:util/types'
import { cloneSafeJson, type JsonValue } from '../../common/json/safe-json.js'
import { isoDateTimeSchema, materialJobIdSchema, materialTypeSchema } from '../../contracts/student-contracts.js'

export const MATERIAL_TYPES = [
  'class_note', 'teacher_material', 'homework', 'past_paper', 'mock_paper',
  'mark_scheme', 'ielts_passage', 'writing_speaking', 'handwritten_draft', 'error_photo',
] as const
export const ALLOWED_MIME_TYPES = [
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic',
] as const
export const MAX_FILE_BYTES = 20 * 1024 * 1024

const allowedFields = new Set([
  'id', 'fileName', 'mimeType', 'size', 'materialType', 'examBoard', 'subject', 'chapter', 'createdAt',
])
const allowedMimeTypes = new Set<string>(ALLOWED_MIME_TYPES)

export interface MaterialMetadata {
  id?: string
  fileName: string
  mimeType: string
  size: number
  materialType: (typeof MATERIAL_TYPES)[number]
  examBoard?: string
  subject?: string
  chapter?: string
  createdAt?: string
}

export type MaterialClassificationPatch = Record<string, JsonValue>

const classificationResultFields = new Set([
  'suggestedTitle', 'materialType', 'examBoard', 'subject', 'chapter', 'folderId', 'folderPath',
  'questionBlocks', 'answerBlocks', 'content', 'linkedTopics', 'linkedErrors', 'confidence',
])

function invalidMetadata(): never {
  throw new AppError('Upload metadata contains invalid fields', 400, 'INVALID_UPLOAD_METADATA')
}

function invalidMime(): never {
  throw new AppError('Upload a PDF or image file', 400, 'UNSUPPORTED_TYPE')
}

function tooLarge(): never {
  throw new AppError('File must be 20 MB or smaller', 400, 'FILE_TOO_LARGE')
}

function invalidMaterialType(): never {
  throw new AppError('Select a valid material type', 400, 'INVALID_MATERIAL_TYPE')
}

function isRawCarrier(value: string): boolean {
  return /^(?:data|base64|raw):/iu.test(value.trim()) || /;base64,/iu.test(value)
}

function nonBlankString(value: JsonValue | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !isRawCarrier(value)
}

function validateId(value: JsonValue | undefined): string {
  if (typeof value !== 'string' || !materialJobIdSchema.safeParse(value).success) invalidMetadata()
  return value
}

function hasNonFiniteOwnSize(value: unknown): boolean {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
    const descriptor = Object.getOwnPropertyDescriptor(value, 'size')
    return descriptor !== undefined && 'value' in descriptor &&
      typeof descriptor.value === 'number' && !Number.isFinite(descriptor.value)
  } catch {
    return false
  }
}

function validateTimestamp(value: JsonValue | undefined): string {
  if (typeof value !== 'string' || !isoDateTimeSchema.safeParse(value).success) invalidMetadata()
  return value
}

/** Takes a descriptor-safe clone before selecting metadata fields. */
export function parseMaterialMetadata(input: unknown): MaterialMetadata {
  if (typeof input === 'object' && input !== null && isProxy(input)) invalidMetadata()
  if (hasNonFiniteOwnSize(input)) tooLarge()
  let source: JsonValue
  try {
    source = cloneSafeJson(input)
  } catch {
    return invalidMetadata()
  }
  if (source === null || Array.isArray(source) || typeof source !== 'object') invalidMetadata()
  const keys = Object.keys(source)
  if (keys.some((key) => !allowedFields.has(key))) invalidMetadata()

  const record = source as Record<string, JsonValue>
  if (!nonBlankString(record.fileName)) invalidMetadata()
  if (typeof record.mimeType !== 'string') invalidMime()
  if (isRawCarrier(record.mimeType)) invalidMetadata()
  if (!allowedMimeTypes.has(record.mimeType)) invalidMime()
  if (typeof record.size !== 'number' || !Number.isFinite(record.size) || record.size < 0) tooLarge()
  if (record.size > MAX_FILE_BYTES) tooLarge()
  if (typeof record.materialType !== 'string') invalidMaterialType()
  if (isRawCarrier(record.materialType)) invalidMetadata()
  if (!materialTypeSchema.safeParse(record.materialType).success) invalidMaterialType()

  const optional: Pick<MaterialMetadata, 'examBoard' | 'subject' | 'chapter'> = {}
  for (const field of ['examBoard', 'subject', 'chapter'] as const) {
    if (record[field] === undefined) continue
    if (!nonBlankString(record[field])) invalidMetadata()
    optional[field] = record[field]
  }
  return {
    ...(record.id === undefined ? {} : { id: validateId(record.id) }),
    fileName: record.fileName,
    mimeType: record.mimeType,
    size: record.size,
    materialType: record.materialType as MaterialMetadata['materialType'],
    ...optional,
    ...(record.createdAt === undefined ? {} : { createdAt: validateTimestamp(record.createdAt) }),
  }
}

export function materialIdFromParam(value: string): string {
  return validateId(value)
}

/**
 * Confirmation accepts a JSON-safe, strict partial result. Field-level and
 * cross-field validation happens after it is merged with the stored result,
 * so a patch cannot accidentally be treated as a generated classification.
 */
export function parseMaterialClassificationPatch(input: unknown): MaterialClassificationPatch {
  if (typeof input === 'object' && input !== null && isProxy(input)) invalidConfirmationPatch()
  let source: JsonValue
  try {
    source = cloneSafeJson(input)
  } catch {
    return invalidConfirmationPatch()
  }
  if (source === null || Array.isArray(source) || typeof source !== 'object') invalidConfirmationPatch()
  if (Object.keys(source).some((key) => !classificationResultFields.has(key))) invalidConfirmationPatch()
  if (containsRawCarrier(source)) invalidConfirmationPatch()
  return source
}

export function containsRawCarrier(value: unknown): boolean {
  if (typeof value === 'string') return isRawCarrier(value)
  if (value === null || typeof value !== 'object') return false
  if (Array.isArray(value)) return value.some(containsRawCarrier)
  return Object.values(value).some(containsRawCarrier)
}

function invalidConfirmationPatch(): never {
  throw new AppError('Classification patch contains invalid fields', 400, 'INVALID_CLASSIFICATION_PATCH')
}
