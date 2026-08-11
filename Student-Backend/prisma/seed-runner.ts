import { parseEnv } from '../src/config/env.js'
import { createPrisma, type StudentPrisma } from '../src/db/client.js'
import {
  createStudentSeedData,
  seedStudentData,
  type StudentSeedData,
} from './seed-data.js'

export interface StudentSeedRunnerDependencies {
  createPrisma(databaseUrl: string): StudentPrisma
  createStudentSeedData(studentId: string): StudentSeedData
  seedStudentData(prisma: StudentPrisma, data: StudentSeedData): Promise<void>
}

const defaultDependencies: StudentSeedRunnerDependencies = {
  createPrisma,
  createStudentSeedData,
  seedStudentData,
}

export async function runStudentSeed(
  input: NodeJS.ProcessEnv | Record<string, string | undefined>,
  dependencies: StudentSeedRunnerDependencies = defaultDependencies,
): Promise<void> {
  if (input.NODE_ENV !== 'development' && input.NODE_ENV !== 'test') {
    throw new Error('Student demo seed requires NODE_ENV=development or test')
  }

  const env = parseEnv(input)
  const prisma = dependencies.createPrisma(env.DATABASE_URL)

  try {
    await dependencies.seedStudentData(
      prisma,
      dependencies.createStudentSeedData(env.STUDENT_ID),
    )
  } finally {
    await prisma.$disconnect()
  }
}
