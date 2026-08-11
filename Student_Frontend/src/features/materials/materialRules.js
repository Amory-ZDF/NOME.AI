const MATERIAL_TYPE_VALUES = [
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
]

export const MATERIAL_TYPES = [...MATERIAL_TYPE_VALUES]
const TRUSTED_MATERIAL_TYPES = new Set(MATERIAL_TYPE_VALUES)

const ALLOWED_FILE_TYPE_VALUES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
]

export const ALLOWED_FILE_TYPES = new Set(ALLOWED_FILE_TYPE_VALUES)
const TRUSTED_FILE_TYPES = new Set(ALLOWED_FILE_TYPE_VALUES)

export const MAX_FILE_BYTES = 20 * 1024 * 1024

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const isNonemptyString = (value) => typeof value === 'string' && value.trim().length > 0
const isValidFileSize = (value) => Number.isFinite(value) && value >= 0 && value <= MAX_FILE_BYTES

const unsupportedTypeResult = () => ({
  valid: false,
  code: 'UNSUPPORTED_TYPE',
  message: 'Upload a PDF or image file',
})

const invalidSizeResult = () => ({
  valid: false,
  code: 'FILE_TOO_LARGE',
  message: 'File must be 20 MB or smaller',
})

export class MaterialRulesError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'MaterialRulesError'
    this.code = code
  }
}

const fail = (code, message) => {
  throw new MaterialRulesError(code, message)
}

export function validateStudyFile(file) {
  if (!isRecord(file) || !TRUSTED_FILE_TYPES.has(file.type)) return unsupportedTypeResult()
  if (!isValidFileSize(file.size)) return invalidSizeResult()

  return { valid: true }
}

export function buildUploadJob(input) {
  if (!isRecord(input)) fail('INVALID_UPLOAD_JOB', 'Upload job input must be an object')

  const {
    file,
    materialType,
    examBoard,
    subject,
    chapter,
    id,
    createdAt,
  } = input

  if (!isRecord(file)) fail('INVALID_FILE', 'File metadata must be an object')
  if (!isNonemptyString(file.name)) {
    fail('INVALID_FILE_NAME', 'File name must be a non-empty string')
  }

  const fileValidation = validateStudyFile(file)
  if (!fileValidation.valid) fail(fileValidation.code, fileValidation.message)
  if (!TRUSTED_MATERIAL_TYPES.has(materialType)) {
    fail('INVALID_MATERIAL_TYPE', 'Select a valid material type')
  }
  if (!isNonemptyString(id)) fail('INVALID_ID', 'Upload job id must be a non-empty string')
  if (!isNonemptyString(createdAt)) {
    fail('INVALID_CREATED_AT', 'Upload job createdAt must be a non-empty string')
  }

  const metadata = {}
  for (const [field, value] of Object.entries({ examBoard, subject, chapter })) {
    if (value === undefined) continue
    if (typeof value !== 'string') {
      fail('INVALID_METADATA', `${field} must be a string when provided`)
    }
    metadata[field] = value
  }

  return {
    id,
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
    materialType,
    ...metadata,
    createdAt,
    updatedAt: createdAt,
    progress: 0,
    status: 'queued',
  }
}
