import type { FastifyInstance } from 'fastify'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'
import { noteSchema, settingsSchema } from '../../src/contracts/student-contracts.js'
import { parseEnv } from '../../src/config/env.js'
import { toInputJson } from '../../src/db/json.js'
import { createTestPrisma, resetDatabase } from '../helpers/database.js'

const prisma = createTestPrisma()
const studentId = 'envelope-student'
const otherId = 'envelope-other'

interface Probes {
  raw: string
  secret: string
  path: string
  sql: string
}

interface InjectResponse {
  statusCode: number
  json(): unknown
  headers: Record<string, string | number | string[] | undefined>
}

function probes(name: string): Probes {
  const token = name.toUpperCase().replaceAll(/[^A-Z0-9]+/g, '_')
  return {
    raw: `RAW_INPUT_${token}`,
    secret: `PRIVATE_SECRET_${token}`,
    path: `C:\\private\\${token}\\student-test.db`,
    sql: `SELECT secret_${token} FROM private_${token}`,
  }
}

function app(student = studentId, loggerStream?: { write(message: string): void }) {
  return buildApp({
    env: parseEnv({
      NODE_ENV: 'test',
      DATABASE_URL: 'file:./prisma/test.db',
      STUDENT_ID: student,
      CORS_ORIGINS: 'https://student.example.com',
      LOG_LEVEL: loggerStream === undefined ? 'silent' : 'warn',
    }),
    prisma,
    ...(loggerStream === undefined ? {} : { loggerStream }),
  })
}

function requestHeaders(value: Probes, additional: Record<string, string> = {}) {
  return {
    authorization: `Bearer ${value.secret}`,
    'x-contract-raw': value.raw,
    'x-contract-path': value.path,
    'x-contract-sql': value.sql,
    ...additional,
  }
}

function expectFailure(
  response: InjectResponse,
  status: number,
  code: string,
  message: string,
  value: Probes,
) {
  expect(response.statusCode).toBe(status)
  expect(response.json()).toStrictEqual({ code, message, data: null })
  const publicSurface = `${JSON.stringify(response.json())}\n${JSON.stringify(response.headers)}`
  for (const sentinel of Object.values(value)) expect(publicSurface).not.toContain(sentinel)
  expect(publicSurface).not.toMatch(/(?:stack|sqlite|prisma|node_modules|\.ts:\d+|C:\\|\/(?:Users|home|workspace)\/|\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\s+FROM\b)/i)
}

async function insertStudent(id = studentId) {
  await prisma.student.create({
    data: {
      id,
      name: id,
      avatar: null,
      joinedDays: 1,
      gradeInfo: 'Year 12',
      greeting: toInputJson({ message: 'Hello', fallback: 'Hello' }),
      moduleStats: toInputJson({ notesCount: 0, weeklyExercises: 0, latestAccuracy: 0, pendingErrorReview: 0 }),
      learningSummary: toInputJson({ overallMastery: 0, weeklyCompleted: 0, weeklyTotal: 0, overdueTasks: 0, weakTopics: [], knowledgeHeatmap: [] }),
    },
  })
  await prisma.studentSettings.create({
    data: {
      studentId: id,
      payload: toInputJson(settingsSchema.parse({ tone: 35, dailyGoalHours: 4, reminderTask: true, reminderErrorReview: true, reminderStudyTime: false })),
    },
  })
}

async function durableSnapshot() {
  const [students, settings, tasks, adjustments, sets, sessions, errors, notes, folders, jobs] = await Promise.all([
    prisma.student.findMany({ orderBy: { id: 'asc' } }),
    prisma.studentSettings.findMany({ orderBy: { studentId: 'asc' } }),
    prisma.task.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }),
    prisma.taskAdjustment.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }),
    prisma.exerciseSet.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }),
    prisma.session.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }),
    prisma.errorItem.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }),
    prisma.note.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }),
    prisma.noteFolder.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }),
    prisma.materialUploadJob.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }),
  ])
  return JSON.stringify({ students, settings, tasks, adjustments, sets, sessions, errors, notes, folders, jobs })
}

type FailureRow = {
  name: string
  status: number
  code: string
  message: string
  prepare?: (value: Probes) => Promise<void>
  request: (server: FastifyInstance, value: Probes) => Promise<InjectResponse>
}

const failureRows: FailureRow[] = [
  {
    name: 'malformed empty JSON',
    status: 400,
    code: 'INVALID_INPUT',
    message: 'Invalid request',
    request: (server, value) => server.inject({ method: 'POST', url: '/api/tasks', headers: requestHeaders(value, { 'content-type': 'application/json', 'content-length': '0' }), payload: '' }),
  },
  {
    name: 'malformed truncated JSON',
    status: 400,
    code: 'INVALID_INPUT',
    message: 'Invalid request',
    request: (server, value) => server.inject({ method: 'POST', url: '/api/tasks', headers: requestHeaders(value, { 'content-type': 'application/json' }), payload: `{"title":"${value.raw}` }),
  },
  {
    name: 'malformed invalid content length',
    status: 400,
    code: 'INVALID_INPUT',
    message: 'Invalid request',
    request: (server, value) => {
      const payload = JSON.stringify({ probe: value.raw })
      return server.inject({ method: 'POST', url: '/api/tasks', headers: requestHeaders(value, { 'content-type': 'application/json', 'content-length': String(payload.length + 100) }), payload })
    },
  },
  {
    name: 'unsupported media type',
    status: 415,
    code: 'UNSUPPORTED_MEDIA_TYPE',
    message: 'Unsupported media type',
    request: (server, value) => server.inject({ method: 'POST', url: '/api/tasks', headers: requestHeaders(value, { 'content-type': 'application/xml' }), payload: `<task>${value.raw}</task>` }),
  },
  {
    name: 'oversized JSON',
    status: 413,
    code: 'PAYLOAD_TOO_LARGE',
    message: 'Payload too large',
    request: (server, value) => server.inject({ method: 'POST', url: '/api/tasks', headers: requestHeaders(value, { 'content-type': 'application/json' }), payload: JSON.stringify({ title: `${value.raw}${'x'.repeat(1_100_000)}` }) }),
  },
  {
    name: 'bad percent-encoded URL',
    status: 400,
    code: 'INVALID_INPUT',
    message: 'Invalid request',
    request: (server, value) => server.inject({ method: 'GET', url: `/api/exercise-sets/%E0%A4%A?probe=${value.raw}`, headers: requestHeaders(value) }),
  },
  {
    name: 'overlong path id',
    status: 400,
    code: 'INVALID_INPUT',
    message: 'Invalid request',
    request: (server, value) => server.inject({ method: 'POST', url: `/api/material-uploads/${value.raw}${'x'.repeat(101)}/confirm`, headers: requestHeaders(value), payload: {} }),
  },
  {
    name: 'strict unknown field',
    status: 400,
    code: 'INVALID_INPUT',
    message: 'Invalid request',
    request: (server, value) => server.inject({ method: 'PATCH', url: '/api/student/settings', headers: requestHeaders(value), payload: { unknown: value.raw } }),
  },
  {
    name: 'missing target id',
    status: 404,
    code: 'NOT_FOUND',
    message: 'Note not found',
    request: (server, value) => server.inject({ method: 'PATCH', url: `/api/notes/missing-${value.raw}`, headers: requestHeaders(value), payload: { title: 'not found', changedAt: '2026-08-11T11:00:00.000Z', reason: 'missing' } }),
  },
  {
    name: 'cross-tenant target id',
    status: 404,
    code: 'NOT_FOUND',
    message: 'Note not found',
    prepare: async (value) => {
      await insertStudent(otherId)
      const note = noteSchema.parse({
        id: `other-${value.raw}`,
        title: 'Other tenant note',
        folderId: null,
        folderPath: null,
        tags: [],
        linkedTopics: [],
        linkedErrors: [],
        source: 'typed',
        createdAt: '2026-08-11T10:00:00.000Z',
        updatedAt: '2026-08-11T10:00:00.000Z',
        content: [{ t: 'p', v: 'Other tenant content' }],
        aiSuggestions: [],
        version: 1,
        versions: [],
      })
      await prisma.note.create({ data: { id: note.id, studentId: otherId, version: 1, updatedAtValue: new Date(note.updatedAt), payload: toInputJson(note) } })
    },
    request: (server, value) => server.inject({ method: 'PATCH', url: `/api/notes/other-${value.raw}`, headers: requestHeaders(value), payload: { title: 'cross tenant', changedAt: '2026-08-11T11:00:00.000Z', reason: 'cross' } }),
  },
  {
    name: 'stored corruption',
    status: 500,
    code: 'STORED_DATA_INVALID',
    message: 'Stored student data is invalid',
    prepare: async (value) => {
      await prisma.task.create({
        data: {
          id: 'corrupt',
          studentId,
          type: 'teacher_assigned',
          status: 'pending',
          dueAt: null,
          payload: toInputJson({ id: 'corrupt', title: `${value.raw} ${value.secret} ${value.path} ${value.sql}` }),
        },
      })
    },
    request: (server, value) => server.inject({ method: 'GET', url: '/api/student/bootstrap', headers: requestHeaders(value) }),
  },
  {
    name: 'unexpected exception',
    status: 500,
    code: 'INTERNAL_ERROR',
    message: 'Internal server error',
    request: (server, value) => {
      server.get('/contract-unexpected', async () => { throw new Error(`${value.raw} ${value.secret} ${value.path} ${value.sql}`) })
      return server.inject({ method: 'GET', url: '/contract-unexpected', headers: requestHeaders(value) })
    },
  },
]

beforeEach(async () => resetDatabase(prisma))
afterAll(async () => { await resetDatabase(prisma); await prisma.$disconnect() })

describe('public error envelope and raw-router contract', () => {
  it.each(failureRows)('$name has an exact safe envelope and no durable write', async (row) => {
    await insertStudent()
    const value = probes(row.name)
    await row.prepare?.(value)
    const logs: string[] = []
    const server = row.name === 'unexpected exception'
      ? app(studentId, { write: (line) => logs.push(line) })
      : app()
    try {
      const before = await durableSnapshot()
      const response = await row.request(server, value)
      expectFailure(response, row.status, row.code, row.message, value)
      expect(await durableSnapshot()).toBe(before)
      if (row.name === 'unexpected exception') {
        expect(JSON.stringify(logs)).toContain(value.secret)
        expect(JSON.stringify(logs)).toContain(value.raw)
      }
    } finally { await server.close() }
  })

  it('keeps configured CORS exact and attacker origins absent without a durable write', async () => {
    await insertStudent()
    const server = app()
    try {
      const before = await durableSnapshot()
      const configured = await server.inject({ method: 'GET', url: '/health', headers: { origin: 'https://student.example.com' } })
      const attacker = await server.inject({ method: 'GET', url: '/health', headers: { origin: 'https://attacker.example.com' } })
      expect(configured.statusCode).toBe(200)
      expect(configured.headers['access-control-allow-origin']).toBe('https://student.example.com')
      expect(attacker.statusCode).toBe(200)
      expect(attacker.headers['access-control-allow-origin']).toBeUndefined()
      expect(await durableSnapshot()).toBe(before)
    } finally { await server.close() }
  })

  it('maps the raw router independently to JSON while hiding its unique probes and preserving every model', async () => {
    await insertStudent()
    const value = probes('raw router independent')
    const server = app()
    try {
      const before = await durableSnapshot()
      const response = await server.inject({
        method: 'GET',
        url: `/api/exercise-sets/%E0%A4%A?probe=${value.raw}`,
        headers: requestHeaders(value, { origin: 'https://attacker.example.com' }),
      })
      expect(response.headers['access-control-allow-origin']).toBeUndefined()
      expect(response.headers['content-type']).toContain('application/json')
      expectFailure(response, 400, 'INVALID_INPUT', 'Invalid request', value)
      expect(await durableSnapshot()).toBe(before)
    } finally { await server.close() }
  })
})
