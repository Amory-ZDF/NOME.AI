import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildApp } from '../../src/app.js'
import { parseEnv } from '../../src/config/env.js'
import { toInputJson } from '../../src/db/json.js'
import { parseMaterialMetadata } from '../../src/modules/materials/material-rules.js'
import {
  createTestPrisma,
  resetDatabase,
  TEST_DATABASE_URL,
} from '../helpers/database.js'

const prisma = createTestPrisma()
const studentId = 'material-create-student'
const otherStudentId = 'material-create-other'
const createdAt = '2026-08-11T10:00:00.000Z'
const injectedAt = new Date('2026-08-11T11:00:00.000Z')
const materialTypes = [
  'class_note', 'teacher_material', 'homework', 'past_paper', 'mock_paper',
  'mark_scheme', 'ielts_passage', 'writing_speaking', 'handwritten_draft', 'error_photo',
] as const
const mimeTypes = [
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic',
] as const

function metadata(overrides: Record<string, unknown> = {}) {
  return {
    id: 'material-create-1',
    fileName: 'calculus-notes.pdf',
    mimeType: 'application/pdf',
    size: 1024,
    materialType: 'class_note',
    examBoard: 'Cambridge',
    subject: 'Mathematics',
    chapter: 'Calculus',
    createdAt,
    ...overrides,
  }
}

async function insertStudent(id = studentId) {
  await prisma.student.create({
    data: {
      id,
      name: id,
      avatar: null,
      joinedDays: 1,
      gradeInfo: 'A-Level',
      greeting: toInputJson({ message: 'Hello', fallback: 'Welcome' }),
      moduleStats: toInputJson({ notesCount: 0, weeklyExercises: 0, latestAccuracy: 0, pendingErrorReview: 0 }),
      learningSummary: toInputJson({ overallMastery: 0, weeklyCompleted: 0, weeklyTotal: 0, overdueTasks: 0, weakTopics: [], knowledgeHeatmap: [] }),
    },
  })
}

function appFor(id = studentId, now: () => Date = () => injectedAt, createId = () => 'generated-material-id') {
  return buildApp({
    env: parseEnv({ NODE_ENV: 'test', DATABASE_URL: TEST_DATABASE_URL, STUDENT_ID: id, LOG_LEVEL: 'silent' }),
    prisma,
    now,
    createId,
  })
}

beforeEach(async () => resetDatabase(prisma))
afterAll(async () => {
  await resetDatabase(prisma)
  await prisma.$disconnect()
})

describe('POST /api/material-uploads', () => {
  it('persists every material type and allowed MIME as a metadata-only queued job', async () => {
    await insertStudent()
    const app = appFor()

    for (const [index, materialType] of materialTypes.entries()) {
      const response = await app.inject({
        method: 'POST', url: '/api/material-uploads',
        payload: metadata({ id: `material-type-${index}`, materialType, mimeType: mimeTypes[index % mimeTypes.length] }),
      })
      expect(response.statusCode).toBe(200)
      expect(response.json().data.job).toMatchObject({
        id: `material-type-${index}`, materialType, status: 'queued', progress: 0,
      })
    }
    await app.close()
    await expect(prisma.materialUploadJob.count({ where: { studentId } })).resolves.toBe(10)
  })

  it('honours inclusive 20 MiB and finite nonnegative file-size boundaries', async () => {
    await insertStudent()
    const app = appFor()
    const accepted = await app.inject({ method: 'POST', url: '/api/material-uploads', payload: metadata({ size: 20 * 1024 * 1024 }) })
    expect(accepted.statusCode).toBe(200)
    for (const [index, size] of [20 * 1024 * 1024 + 1, -1, '1', null, Number.NaN, Infinity].entries()) {
      const response = await app.inject({ method: 'POST', url: '/api/material-uploads', payload: metadata({ id: `bad-size-${index}`, size }) })
      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({ code: index === 0 ? 'FILE_TOO_LARGE' : 'INVALID_UPLOAD_METADATA' })
    }
    await app.close()
  })

  it('preserves caller id and timestamp bytes, or injects deterministic dependencies when omitted', async () => {
    await insertStudent()
    const createId = vi.fn(() => 'injected-id')
    const now = vi.fn(() => injectedAt)
    const app = appFor(studentId, now, createId)
    const preserved = await app.inject({ method: 'POST', url: '/api/material-uploads', payload: metadata() })
    const injected = await app.inject({ method: 'POST', url: '/api/material-uploads', payload: metadata({ id: undefined, createdAt: undefined, fileName: 'injected.pdf' }) })
    await app.close()
    expect(preserved.json().data.job).toEqual({ ...metadata(), updatedAt: createdAt, progress: 0, status: 'queued' })
    expect(injected.json().data.job).toMatchObject({ id: 'injected-id', createdAt: injectedAt.toISOString(), updatedAt: injectedAt.toISOString(), status: 'queued', progress: 0 })
    expect(createId).toHaveBeenCalledTimes(1)
    expect(now).toHaveBeenCalledTimes(1)
  })

  it('rejects malformed metadata carriers before persistence with documented domain codes', async () => {
    await insertStudent()
    const app = appFor()
    const unsafe = [
      { rawBytes: 'AA==' }, { base64: 'AA==' }, { data: 'data:application/pdf;base64,AA==' },
      { file: {} }, { blob: {} }, { arrayBuffer: {} }, { bytes: [1, 2] }, { unknown: true },
    ]
    for (const [index, addition] of unsafe.entries()) {
      const response = await app.inject({ method: 'POST', url: '/api/material-uploads', payload: metadata({ id: `unsafe-${index}`, ...addition }) })
      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({ code: 'INVALID_UPLOAD_METADATA', data: null })
    }
    const unsupported = await app.inject({ method: 'POST', url: '/api/material-uploads', payload: metadata({ id: 'bad-mime', mimeType: 'application/octet-stream' }) })
    const badType = await app.inject({ method: 'POST', url: '/api/material-uploads', payload: metadata({ id: 'bad-type', materialType: 'other' }) })
    const rawMime = await app.inject({ method: 'POST', url: '/api/material-uploads', payload: metadata({ id: 'raw-mime', mimeType: 'data:application/pdf;base64,AA==' }) })
    const rawType = await app.inject({ method: 'POST', url: '/api/material-uploads', payload: metadata({ id: 'raw-type', materialType: 'base64:AA==' }) })
    await app.close()
    expect(unsupported.json()).toMatchObject({ code: 'UNSUPPORTED_TYPE' })
    expect(badType.json()).toMatchObject({ code: 'INVALID_MATERIAL_TYPE' })
    expect(rawMime.json()).toMatchObject({ code: 'INVALID_UPLOAD_METADATA' })
    expect(rawType.json()).toMatchObject({ code: 'INVALID_UPLOAD_METADATA' })
    await expect(prisma.materialUploadJob.count()).resolves.toBe(0)
  })

  it('uses a strict safe-JSON boundary for accessor, sparse, custom-prototype, proxy, and control/id inputs', async () => {
    await insertStudent()
    const app = appFor()
    const accessor = Object.defineProperty(metadata({ id: 'accessor' }), 'subject', { enumerable: true, get: () => 'Math' })
    const sparse = metadata({ id: 'sparse', bytes: new Array(1) })
    const custom = Object.assign(Object.create({ inherited: true }), metadata({ id: 'custom' }))
    const proxy = new Proxy(metadata({ id: 'proxy' }), {})
    for (const payload of [accessor, sparse, custom, proxy]) {
      expect(() => parseMaterialMetadata(payload)).toThrow(/Upload metadata contains invalid fields/)
    }
    for (const payload of [metadata({ id: 'x'.repeat(101) }), metadata({ id: 'bad\u0000id' })]) {
      const response = await app.inject({ method: 'POST', url: '/api/material-uploads', payload })
      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({ code: 'INVALID_UPLOAD_METADATA' })
    }
    await app.close()
  })

  it('keeps duplicate ids stable and student-scoped under concurrent creation', async () => {
    await insertStudent()
    await insertStudent(otherStudentId)
    const app = appFor()
    const same = metadata({ id: 'same-id' })
    const responses = await Promise.all([
      app.inject({ method: 'POST', url: '/api/material-uploads', payload: same }),
      app.inject({ method: 'POST', url: '/api/material-uploads', payload: same }),
    ])
    const other = appFor(otherStudentId)
    const scoped = await other.inject({ method: 'POST', url: '/api/material-uploads', payload: same })
    await app.close(); await other.close()
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409])
    expect(responses.find((response) => response.statusCode === 409)?.json()).toMatchObject({ code: 'DUPLICATE_ID' })
    expect(scoped.statusCode).toBe(200)
    await expect(prisma.materialUploadJob.count({ where: { id: 'same-id' } })).resolves.toBe(2)
  })

  it('uses documented 413/415 envelopes and OpenAPI response documentation', async () => {
    const app = appFor()
    const unsupported = await app.inject({ method: 'POST', url: '/api/material-uploads', headers: { 'content-type': 'application/xml' }, payload: '<upload />' })
    const oversized = await app.inject({ method: 'POST', url: '/api/material-uploads', headers: { 'content-type': 'application/json' }, payload: JSON.stringify({ fileName: 'x'.repeat(1_048_576) }) })
    const docs = await app.inject({ method: 'GET', url: '/documentation/json' })
    await app.close()
    expect(unsupported.json()).toEqual({ code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Unsupported media type', data: null })
    expect(oversized.json()).toEqual({ code: 'PAYLOAD_TOO_LARGE', message: 'Payload too large', data: null })
    expect(Object.keys(docs.json().paths['/api/material-uploads'].post.responses).sort()).toEqual(['200', '400', '404', '409', '413', '415', '500'])
    const body = docs.json().paths['/api/material-uploads'].post.requestBody.content['application/json'].schema
    expect(body.required).toEqual(['fileName', 'mimeType', 'size', 'materialType'])
    expect(body.properties.mimeType.enum).toEqual(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'])
    expect(body.properties.size).toMatchObject({ minimum: 0, maximum: 20 * 1024 * 1024 })
  })
})
