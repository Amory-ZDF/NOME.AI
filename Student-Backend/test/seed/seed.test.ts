import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import {
  createStudentSeedData,
  seedStudentData,
} from '../../prisma/seed-data.js'
import { toInputJson } from '../../src/db/json.js'
import {
  createTestPrisma,
  resetDatabase,
} from '../helpers/database.js'

const prisma = createTestPrisma()

beforeEach(async () => {
  await resetDatabase(prisma)
})

afterAll(async () => {
  await resetDatabase(prisma)
  await prisma.$disconnect()
})

describe('student seed', () => {
  it('is repeatable, complete, and limited to its configured student', async () => {
    await prisma.student.create({
      data: {
        id: 'unrelated-student',
        name: 'Unrelated',
        avatar: null,
        joinedDays: 1,
        gradeInfo: 'Other',
        greeting: toInputJson({ message: 'Other', fallback: 'Other' }),
        moduleStats: toInputJson({
          notesCount: 0,
          weeklyExercises: 0,
          latestAccuracy: 0,
          pendingErrorReview: 0,
        }),
        learningSummary: toInputJson({
          overallMastery: 0,
          weeklyCompleted: 0,
          weeklyTotal: 0,
          overdueTasks: 0,
          weakTopics: [],
          knowledgeHeatmap: [],
        }),
      },
    })

    const seed = createStudentSeedData('stu-001')
    await seedStudentData(prisma, seed)
    await seedStudentData(prisma, seed)

    await expect(prisma.student.count()).resolves.toBe(2)
    await expect(
      prisma.student.findUnique({ where: { id: 'unrelated-student' } }),
    ).resolves.toMatchObject({ name: 'Unrelated' })
    await expect(prisma.task.count({ where: { studentId: 'stu-001' } })).resolves.toBe(2)
    await expect(
      prisma.exerciseSet.count({ where: { studentId: 'stu-001', kind: 'task' } }),
    ).resolves.toBeGreaterThanOrEqual(1)
    await expect(
      prisma.exerciseSet.count({ where: { studentId: 'stu-001', kind: 'bank' } }),
    ).resolves.toBeGreaterThanOrEqual(1)
    await expect(prisma.session.count({ where: { studentId: 'stu-001' } })).resolves.toBe(1)
    await expect(prisma.errorItem.count({ where: { studentId: 'stu-001' } })).resolves.toBe(1)
    await expect(prisma.note.count({ where: { studentId: 'stu-001' } })).resolves.toBe(1)
    await expect(prisma.noteFolder.count({ where: { studentId: 'stu-001' } })).resolves.toBe(1)
    await expect(prisma.studentSettings.count({ where: { studentId: 'stu-001' } })).resolves.toBe(1)

    const jobs = await prisma.materialUploadJob.findMany({
      where: { studentId: 'stu-001' },
    })
    expect(jobs).toHaveLength(1)
    expect(['queued', 'processing', 'failed', 'needs_confirmation', 'completed', 'cancelled'])
      .toContain(jobs[0]?.status)
  })
})
