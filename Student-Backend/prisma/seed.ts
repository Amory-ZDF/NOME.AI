import { parseEnv } from '../src/config/env.js'
import { createPrisma } from '../src/db/client.js'
import { createStudentSeedData, seedStudentData } from './seed-data.js'

async function main(): Promise<void> {
  const env = parseEnv(process.env)
  const prisma = createPrisma(env.DATABASE_URL)

  try {
    await seedStudentData(prisma, createStudentSeedData(env.STUDENT_ID))
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(() => {
  console.error('Student seed failed')
  process.exitCode = 1
})
