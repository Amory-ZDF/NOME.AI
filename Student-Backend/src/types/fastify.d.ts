import type { StudentPrisma } from '../db/client.js'
import type { StudentAgentClient } from '../integrations/student-agent/student-agent.client.js'

declare module 'fastify' {
  interface FastifyInstance {
    prisma: StudentPrisma
    studentAgent: StudentAgentClient
  }
}

export {}
