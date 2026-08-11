import { describe, expect, it, vi } from 'vitest'

import { runStudentSeed } from '../../prisma/seed-runner.js'

function guardedDependencies() {
  return {
    createPrisma: vi.fn(() => {
      throw new Error('createPrisma must not be called')
    }),
    createStudentSeedData: vi.fn(() => {
      throw new Error('createStudentSeedData must not be called')
    }),
    seedStudentData: vi.fn(async () => {
      throw new Error('seedStudentData must not be called')
    }),
  }
}

describe('student seed runner guard', () => {
  it.each([
    ['production', 'production'],
    ['an unset environment', undefined],
  ])('rejects %s before creating a Prisma client', async (_case, nodeEnv) => {
    const dependencies = guardedDependencies()
    const databaseUrl = 'file:./prisma/secret-production-target.db'
    const environment = {
      DATABASE_URL: databaseUrl,
      STUDENT_ID: 'stu-001',
      ...(nodeEnv === undefined ? {} : { NODE_ENV: nodeEnv }),
    }

    const result = runStudentSeed(environment, dependencies)

    await expect(result).rejects.toThrow(
      'Student demo seed requires NODE_ENV=development or test',
    )
    await expect(result).rejects.not.toThrow(databaseUrl)
    expect(dependencies.createPrisma).not.toHaveBeenCalled()
    expect(dependencies.createStudentSeedData).not.toHaveBeenCalled()
    expect(dependencies.seedStudentData).not.toHaveBeenCalled()
  })
})
