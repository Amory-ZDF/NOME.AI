import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'
import { errorItemSchema, exerciseSetSchema, settingsSchema, taskSchema } from '../../src/contracts/student-contracts.js'
import { parseEnv } from '../../src/config/env.js'
import { toInputJson } from '../../src/db/json.js'
import { createTestPrisma, resetDatabase } from '../helpers/database.js'

const prisma = createTestPrisma()
const first = 'isolation-first'
const second = 'isolation-second'
const timestamp = '2026-08-11T10:00:00.000Z'
const actionTimestamp = '2026-08-11T11:00:00.000Z'

function server(studentId: string) {
  return buildApp({
    env: parseEnv({ NODE_ENV: 'test', DATABASE_URL: 'file:./prisma/test.db', STUDENT_ID: studentId, LOG_LEVEL: 'silent' }),
    prisma, now: () => new Date(timestamp), createId: () => 'generated-job',
  })
}

function task(title: string) {
  return taskSchema.parse({ id: 'shared', title, type: 'teacher_assigned', subject: 'Math', estimatedMinutes: 30, dueAt: null, assignedBy: 'Teacher', priority: 'P1', isOverdue: false, status: 'pending' })
}

function error(title: string) {
  return errorItemSchema.parse({
    id: 'shared', questionId: 'shared-question', sessionId: null, subject: 'Math', errorType: 'method', questionSummary: title, questionContent: title, type: 'calculation', difficulty: 2,
    errorDescription: title, relatedTopic: 'Algebra', topicId: 'algebra', whereWrong: title, whyWrong: title, linkedAbility: title, hintDependency: 0,
    firstOccurredAt: timestamp, lastOccurredAt: timestamp, occurrences: [timestamp], occurrenceKeys: ['shared-occurrence'], occurrenceRecords: [{ key: 'shared-occurrence', occurredAt: timestamp }], repeatCount: 1,
    status: 'pending_review', studentAnswer: '1', correctAnswer: '2', analysis: title, acceptKeywords: ['2'], redoHistory: [], verificationVariantId: null, variantVerifiedAt: null, variantVerification: null,
  })
}

async function insertStudent(id: string, name: string) {
  await prisma.student.create({ data: {
    id, name, avatar: null, joinedDays: 2, gradeInfo: 'Year 12',
    greeting: toInputJson({ message: name, fallback: name }),
    moduleStats: toInputJson({ notesCount: 0, weeklyExercises: 0, latestAccuracy: 0, pendingErrorReview: 0 }),
    learningSummary: toInputJson({ overallMastery: 0, weeklyCompleted: 0, weeklyTotal: 0, overdueTasks: 0, weakTopics: [], knowledgeHeatmap: [] }),
  } })
  await prisma.studentSettings.create({ data: { studentId: id, payload: toInputJson(settingsSchema.parse({ tone: 35, dailyGoalHours: 4, reminderTask: true, reminderErrorReview: true, reminderStudyTime: false })) } })
}

async function otherSnapshot() {
  const [student, settings, tasks, sets, errors, notes, jobs] = await Promise.all([
    prisma.student.findUnique({ where: { id: second } }), prisma.studentSettings.findUnique({ where: { studentId: second } }),
    prisma.task.findMany({ where: { studentId: second }, orderBy: { id: 'asc' } }), prisma.exerciseSet.findMany({ where: { studentId: second }, orderBy: { id: 'asc' } }),
    prisma.errorItem.findMany({ where: { studentId: second }, orderBy: { id: 'asc' } }), prisma.note.findMany({ where: { studentId: second }, orderBy: { id: 'asc' } }), prisma.materialUploadJob.findMany({ where: { studentId: second }, orderBy: { id: 'asc' } }),
  ])
  return JSON.stringify({ student, settings, tasks, sets, errors, notes, jobs })
}

beforeEach(async () => resetDatabase(prisma))
afterAll(async () => { await resetDatabase(prisma); await prisma.$disconnect() })

describe('student isolation across documented non-Agent ownership families', () => {
  it('allows duplicate client ids per student while reads and writes remain byte-isolated', async () => {
    await insertStudent(first, 'First Student')
    await insertStudent(second, 'Second Student')
    const one = server(first)
    const two = server(second)
    try {
      for (const [app, label] of [[one, 'First'], [two, 'Second']] as const) {
        expect((await app.inject({ method: 'POST', url: '/api/tasks', payload: task(`${label} task`) })).statusCode).toBe(200)
        expect((await app.inject({ method: 'POST', url: '/api/errors/batch', payload: { items: [error(`${label} error`)] } })).statusCode).toBe(200)
        expect((await app.inject({ method: 'POST', url: '/api/notes', payload: { id: 'shared', title: `${label} note`, folderId: null, folderPath: null, tags: [], linkedTopics: [], linkedErrors: [], source: 'typed', createdAt: timestamp, updatedAt: timestamp, content: [{ t: 'p', v: label }], aiSuggestions: [], version: 1, versions: [] } })).statusCode).toBe(200)
        expect((await app.inject({ method: 'POST', url: '/api/material-uploads', payload: { id: 'shared', fileName: `${label}.pdf`, mimeType: 'application/pdf', size: 1, materialType: 'class_note', createdAt: timestamp } })).statusCode).toBe(200)
      }

      const set = exerciseSetSchema.parse({ id: 'shared-set', taskId: 'shared', title: 'Second-only set', subject: 'Math', questions: [{ id: 'shared-question', order: 1, type: 'calculation', topic: 'Algebra', difficulty: 2, content: '2+2', acceptKeywords: ['4'], correctDisplay: '4', errorType: 'calculation', hints: [1, 2, 3, 4, 5].map((level) => ({ level, title: String(level), content: String(level) })) }] })
      await prisma.exerciseSet.create({ data: { id: 'shared-set', studentId: second, taskId: 'shared', kind: 'task', payload: toInputJson(set) } })
      const before = await otherSnapshot()

      const complete = await one.inject({ method: 'PATCH', url: '/api/tasks/shared', payload: { status: 'completed' } })
      const redo = await one.inject({ method: 'POST', url: '/api/errors/shared/redo', payload: { attemptedAt: actionTimestamp, answer: '2', isCorrect: true, timeSpent: 3 } })
      const update = await one.inject({ method: 'PATCH', url: '/api/notes/shared', payload: { title: 'First note changed', changedAt: actionTimestamp, reason: 'edit' } })
      const cancel = await one.inject({ method: 'POST', url: '/api/material-uploads/shared/cancel' })
      const settings = await one.inject({ method: 'PATCH', url: '/api/student/settings', payload: { dailyGoalHours: 6 } })
      expect({ complete: complete.statusCode, redo: redo.statusCode, update: update.statusCode, cancel: cancel.statusCode, settings: settings.statusCode }).toEqual({ complete: 200, redo: 200, update: 200, cancel: 200, settings: 200 })

      const bootstrap = await one.inject({ method: 'GET', url: '/api/student/bootstrap' })
      expect(JSON.stringify(bootstrap.json())).toContain('First Student')
      expect(JSON.stringify(bootstrap.json())).not.toContain('Second Student')
      const hiddenSet = await one.inject({ method: 'GET', url: '/api/exercise-sets/shared' })
      expect(hiddenSet.statusCode).toBe(404)
      expect(await otherSnapshot()).toBe(before)
      await expect(prisma.task.count({ where: { id: 'shared' } })).resolves.toBe(2)
      await expect(prisma.errorItem.count({ where: { id: 'shared' } })).resolves.toBe(2)
      await expect(prisma.note.count({ where: { id: 'shared' } })).resolves.toBe(2)
      await expect(prisma.materialUploadJob.count({ where: { id: 'shared' } })).resolves.toBe(2)
    } finally { await one.close(); await two.close() }
  })
})
