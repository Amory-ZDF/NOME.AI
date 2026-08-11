import type { StudentPrisma } from '../db/client.js'

declare module 'fastify' {
  interface FastifyInstance {
    prisma: StudentPrisma
  }
}

export {}
