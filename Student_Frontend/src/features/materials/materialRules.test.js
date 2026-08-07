import { describe, expect, test } from 'vitest'
import {
  ALLOWED_FILE_TYPES,
  MATERIAL_TYPES,
  MAX_FILE_BYTES,
  buildUploadJob,
  validateStudyFile,
} from './materialRules'

const unsupportedTypeResult = {
  valid: false,
  code: 'UNSUPPORTED_TYPE',
  message: 'Upload a PDF or image file',
}

const invalidSizeResult = {
  valid: false,
  code: 'FILE_TOO_LARGE',
  message: 'File must be 20 MB or smaller',
}

const captureError = (callback) => {
  try {
    callback()
  } catch (error) {
    return error
  }
  return null
}

const expectMaterialError = (input, expected) => {
  expect(captureError(() => buildUploadJob(input))).toMatchObject({
    name: 'MaterialRulesError',
    ...expected,
  })
}

describe('material file rules', () => {
  test('publishes the exact supported material and file types', () => {
    expect(MATERIAL_TYPES).toEqual([
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
    expect([...ALLOWED_FILE_TYPES]).toEqual([
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
    ])
    expect(MAX_FILE_BYTES).toBe(20 * 1024 * 1024)
  })

  test('accepts images and PDFs up to 20 MiB', () => {
    expect(validateStudyFile({
      name: 'paper.pdf',
      type: 'application/pdf',
      size: 20 * 1024 * 1024,
    })).toEqual({ valid: true })
    expect(validateStudyFile({
      name: 'notes.jpg',
      type: 'image/jpeg',
      size: 1024,
    })).toEqual({ valid: true })
  })

  test('isolates validation from mutations to the exported allowed-type set', () => {
    const originalTypes = [...ALLOWED_FILE_TYPES]

    try {
      ALLOWED_FILE_TYPES.clear()
      ALLOWED_FILE_TYPES.add('application/x-msdownload')

      expect(validateStudyFile({
        name: 'paper.pdf',
        type: 'application/pdf',
        size: 1024,
      })).toEqual({ valid: true })
      expect(validateStudyFile({
        name: 'notes.exe',
        type: 'application/x-msdownload',
        size: 10,
      })).toEqual({
        valid: false,
        code: 'UNSUPPORTED_TYPE',
        message: 'Upload a PDF or image file',
      })
    } finally {
      ALLOWED_FILE_TYPES.clear()
      originalTypes.forEach((type) => ALLOWED_FILE_TYPES.add(type))
    }
  })

  test('rejects unsupported or oversized files with exact messages', () => {
    expect(validateStudyFile({
      name: 'notes.exe',
      type: 'application/x-msdownload',
      size: 10,
    })).toEqual(unsupportedTypeResult)
    expect(validateStudyFile({
      name: 'paper.pdf',
      type: 'application/pdf',
      size: 20 * 1024 * 1024 + 1,
    })).toEqual(invalidSizeResult)
  })

  test('returns stable validation results for malformed public inputs', () => {
    for (const input of [null, undefined, 42, 'file', [], () => {}]) {
      expect(validateStudyFile(input)).toEqual(unsupportedTypeResult)
    }

    for (const size of [undefined, null, '10', Number.NaN, Infinity, -1]) {
      expect(validateStudyFile({ type: 'application/pdf', size })).toEqual(invalidSizeResult)
    }
  })
})

describe('material upload jobs', () => {
  test('stores only serializable file metadata and initializes a queued job', () => {
    const rawBytes = new Uint8Array([1, 2, 3])
    const file = {
      name: 'chapter-4.pdf',
      type: 'application/pdf',
      size: rawBytes.byteLength,
      rawBytes,
      arrayBuffer: () => rawBytes.buffer,
    }

    const job = buildUploadJob({
      file,
      materialType: 'class_note',
      examBoard: 'Cambridge',
      subject: 'A-Level Mathematics',
      chapter: 'Integration',
      id: 'upload-1',
      createdAt: '2026-08-07T08:00:00.000Z',
    })

    expect(job).toEqual({
      id: 'upload-1',
      fileName: 'chapter-4.pdf',
      mimeType: 'application/pdf',
      size: 3,
      materialType: 'class_note',
      examBoard: 'Cambridge',
      subject: 'A-Level Mathematics',
      chapter: 'Integration',
      createdAt: '2026-08-07T08:00:00.000Z',
      updatedAt: '2026-08-07T08:00:00.000Z',
      progress: 0,
      status: 'queued',
    })
    expect(job).not.toHaveProperty('file')
    expect(job).not.toHaveProperty('rawBytes')
    expect(Object.values(job)).not.toContain(rawBytes)
  })

  test('rejects missing job and file records with stable domain errors', () => {
    for (const input of [null, undefined, 'upload', []]) {
      expectMaterialError(input, {
        code: 'INVALID_UPLOAD_JOB',
        message: 'Upload job input must be an object',
      })
    }

    for (const file of [null, undefined, 'paper.pdf', []]) {
      expectMaterialError({
        file,
        materialType: 'class_note',
        id: 'upload-1',
        createdAt: '2026-08-07T08:00:00.000Z',
      }, {
        code: 'INVALID_FILE',
        message: 'File metadata must be an object',
      })
    }
  })

  test('rejects invalid file metadata before constructing a job', () => {
    const base = {
      file: { name: 'paper.pdf', type: 'application/pdf', size: 1024 },
      materialType: 'class_note',
      id: 'upload-1',
      createdAt: '2026-08-07T08:00:00.000Z',
    }

    for (const name of [undefined, '', '   ', 42]) {
      expectMaterialError({ ...base, file: { ...base.file, name } }, {
        code: 'INVALID_FILE_NAME',
        message: 'File name must be a non-empty string',
      })
    }

    for (const type of [undefined, '', 'application/x-msdownload', 42]) {
      expectMaterialError({ ...base, file: { ...base.file, type } }, {
        code: 'UNSUPPORTED_TYPE',
        message: 'Upload a PDF or image file',
      })
    }

    for (const size of [undefined, null, '1024', Number.NaN, Infinity, -1, MAX_FILE_BYTES + 1]) {
      expectMaterialError({ ...base, file: { ...base.file, size } }, {
        code: 'FILE_TOO_LARGE',
        message: 'File must be 20 MB or smaller',
      })
    }
  })

  test('rejects invalid classification, identity, timestamp, and optional metadata', () => {
    const base = {
      file: { name: 'paper.pdf', type: 'application/pdf', size: 1024 },
      materialType: 'class_note',
      id: 'upload-1',
      createdAt: '2026-08-07T08:00:00.000Z',
    }

    for (const materialType of [undefined, '', 'unknown', 42]) {
      expectMaterialError({ ...base, materialType }, {
        code: 'INVALID_MATERIAL_TYPE',
        message: 'Select a valid material type',
      })
    }

    for (const id of [undefined, '', '   ', 42, new Date()]) {
      expectMaterialError({ ...base, id }, {
        code: 'INVALID_ID',
        message: 'Upload job id must be a non-empty string',
      })
    }

    for (const createdAt of [undefined, '', '   ', 42, new Date()]) {
      expectMaterialError({ ...base, createdAt }, {
        code: 'INVALID_CREATED_AT',
        message: 'Upload job createdAt must be a non-empty string',
      })
    }

    for (const [field, value] of [
      ['examBoard', null],
      ['subject', 42],
      ['chapter', []],
    ]) {
      expectMaterialError({ ...base, [field]: value }, {
        code: 'INVALID_METADATA',
        message: `${field} must be a string when provided`,
      })
    }
  })

  test('omits absent optional metadata so every stored value is JSON-safe', () => {
    const job = buildUploadJob({
      file: { name: 'paper.pdf', type: 'application/pdf', size: 1024 },
      materialType: 'past_paper',
      id: 'upload-2',
      createdAt: '2026-08-07T09:00:00.000Z',
    })

    expect(job).not.toHaveProperty('examBoard')
    expect(job).not.toHaveProperty('subject')
    expect(job).not.toHaveProperty('chapter')
    expect(JSON.parse(JSON.stringify(job))).toEqual(job)
    expect(Object.values(job).every((value) => (
      typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null
    ))).toBe(true)
  })
})
