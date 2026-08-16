import { z } from 'zod'

import {
  normalizeSqliteDatabaseUrl,
  normalizePostgresDatabaseUrl,
} from '../db/database-url.js'

const DEFAULT_CORS_ORIGIN = 'http://localhost:5173'
const DEFAULT_STUDENT_ID = 'stu-001'
const DEFAULT_AGENT_BASE_URL = 'http://127.0.0.1:8000'

const databaseUrlSchema = z.string().transform((value, context) => {
  const trimmed = value.trim()
  if (trimmed.startsWith('postgresql://')) {
    try {
      return normalizePostgresDatabaseUrl(trimmed)
    } catch (error) {
      context.addIssue({
        code: 'custom',
        message: error instanceof Error ? error.message : 'must be a valid postgresql:// URL',
      })
      return z.NEVER
    }
  }
  try {
    return normalizeSqliteDatabaseUrl(trimmed)
  } catch {
    context.addIssue({
      code: 'custom',
      message: 'must be a supported SQLite file: URL or postgresql:// URL',
    })
    return z.NEVER
  }
})

const httpOriginSchema = z.string().trim().min(1, 'must not be empty').transform((value, context) => {
  try {
    const url = new URL(value)
    const isHttp = url.protocol === 'http:' || url.protocol === 'https:'
    const isOriginOnly =
      !url.username &&
      !url.password &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash

    if (!isHttp || !isOriginOnly) {
      throw new Error('Invalid origin')
    }

    return url.origin
  } catch {
    context.addIssue({
      code: 'custom',
      message: 'must be a valid HTTP(S) origin',
    })
    return z.NEVER
  }
})

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().trim().min(1, 'must not be empty').default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
    DATABASE_URL: databaseUrlSchema,
    STUDENT_ID: z.string().trim().min(1, 'must not be empty').optional(),
    AGENT_URL: z
      .string()
      .trim()
      .min(1, 'must not be empty')
      .default('http://127.0.0.1:8000'),
    CORS_ORIGINS: z
      .string()
      .default(DEFAULT_CORS_ORIGIN)
      .transform((value) => value.split(','))
      .pipe(z.array(httpOriginSchema).min(1, 'must contain at least one origin')),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    AGENT_BASE_URL: httpOriginSchema.optional(),
    AGENT_TIMEOUT_MS: z.coerce.number().int().min(1).max(60_000).default(10_000),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === 'production' && value.STUDENT_ID === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['STUDENT_ID'],
        message: 'is required in production',
      })
    }
    if (value.NODE_ENV === 'production' && value.AGENT_BASE_URL === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['AGENT_BASE_URL'],
        message: 'is required in production',
      })
    }
  })
  .transform((value) => ({
    ...value,
    STUDENT_ID: value.STUDENT_ID ?? DEFAULT_STUDENT_ID,
    AGENT_BASE_URL: value.AGENT_BASE_URL ?? DEFAULT_AGENT_BASE_URL,
  }))

export type Env = z.infer<typeof envSchema>

export function parseEnv(
  input: NodeJS.ProcessEnv | Record<string, string | undefined>,
): Env {
  const result = envSchema.safeParse(input)

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => {
        const field = issue.path.join('.') || 'environment'

        if (issue.path[0] === 'DATABASE_URL') {
          return 'DATABASE_URL is missing or invalid'
        }

        return `${field}: ${issue.message}`
      })
      .join('; ')

    throw new Error(`Invalid environment: ${details}`)
  }

  return result.data
}
