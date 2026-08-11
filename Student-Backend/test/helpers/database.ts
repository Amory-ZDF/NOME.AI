import { createPrisma } from '../../src/db/client.js'

export const TEST_DATABASE_URL = 'file:./prisma/test.db'

export type TestPrisma = ReturnType<typeof createPrisma>

export function createTestPrisma(): TestPrisma {
  return createPrisma(TEST_DATABASE_URL)
}

export async function resetDatabase(prisma: TestPrisma): Promise<void> {
  await prisma.$transaction([
    prisma.taskAdjustment.deleteMany(),
    prisma.session.deleteMany(),
    prisma.exerciseSet.deleteMany(),
    prisma.errorItem.deleteMany(),
    prisma.note.deleteMany(),
    prisma.noteFolder.deleteMany(),
    prisma.materialUploadJob.deleteMany(),
    prisma.studentSettings.deleteMany(),
    prisma.task.deleteMany(),
    prisma.student.deleteMany(),
  ])
}
