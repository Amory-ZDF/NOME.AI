import { describe, expect, test } from 'vitest'
import {
  ALLOWED_FILE_TYPES,
  MATERIAL_TYPES,
  MAX_FILE_BYTES,
  buildUploadJob,
  validateStudyFile,
} from './materialRules'

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

  test('rejects unsupported or oversized files with exact messages', () => {
    expect(validateStudyFile({
      name: 'notes.exe',
      type: 'application/x-msdownload',
      size: 10,
    })).toEqual({
      valid: false,
      code: 'UNSUPPORTED_TYPE',
      message: 'Upload a PDF or image file',
    })
    expect(validateStudyFile({
      name: 'paper.pdf',
      type: 'application/pdf',
      size: 20 * 1024 * 1024 + 1,
    })).toEqual({
      valid: false,
      code: 'FILE_TOO_LARGE',
      message: 'File must be 20 MB or smaller',
    })
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
})
