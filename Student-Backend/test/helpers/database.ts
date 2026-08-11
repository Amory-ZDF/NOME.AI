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
    prisma.noteFolder.updateMany({ data: { parentId: null } }),
    prisma.noteFolder.deleteMany(),
    prisma.materialUploadJob.deleteMany(),
    prisma.studentSettings.deleteMany(),
    prisma.task.deleteMany(),
    prisma.student.deleteMany(),
  ])
}

export async function holdStudentWriteLock(
  prisma: TestPrisma,
  studentId: string,
  holdMilliseconds: number,
): Promise<() => Promise<void>> {
  let signalLocked!: () => void
  let releaseLock!: () => void
  const locked = new Promise<void>((resolve) => {
    signalLocked = resolve
  })
  const released = new Promise<void>((resolve) => {
    releaseLock = resolve
  })
  const finished = prisma.$transaction(async (transaction) => {
    await transaction.student.update({
      where: { id: studentId },
      data: { joinedDays: { increment: 0 } },
    })
    signalLocked()
    await released
  }, { timeout: holdMilliseconds + 5_000 })
  await locked
  const timer = setTimeout(releaseLock, holdMilliseconds)

  return async () => {
    clearTimeout(timer)
    releaseLock()
    await finished
  }
}
