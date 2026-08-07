export const MATERIAL_TYPES = [
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

export const ALLOWED_FILE_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
])

export const MAX_FILE_BYTES = 20 * 1024 * 1024

export function validateStudyFile({ type, size } = {}) {
  if (!ALLOWED_FILE_TYPES.has(type)) {
    return {
      valid: false,
      code: 'UNSUPPORTED_TYPE',
      message: 'Upload a PDF or image file',
    }
  }

  if (!Number.isFinite(size) || size < 0 || size > MAX_FILE_BYTES) {
    return {
      valid: false,
      code: 'FILE_TOO_LARGE',
      message: 'File must be 20 MB or smaller',
    }
  }

  return { valid: true }
}

export function buildUploadJob({
  file,
  materialType,
  examBoard,
  subject,
  chapter,
  id,
  createdAt,
}) {
  return {
    id,
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
    materialType,
    examBoard,
    subject,
    chapter,
    createdAt,
    updatedAt: createdAt,
    progress: 0,
    status: 'queued',
  }
}
