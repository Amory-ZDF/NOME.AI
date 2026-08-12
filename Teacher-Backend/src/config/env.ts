import { z } from 'zod'

import { normalizeSqliteDatabaseUrl } from '../db/database-url.js'

const DEFAULT_CORS_ORIGIN = 'http://localhost:5173'
const DEFAULT_TEACHER_ID = 'teacher-001'

const sqliteDatabaseUrlSchema = z.string().transform((value, context) => {
  try {
    return normalizeSqliteDatabaseUrl(value)
  } catch {
    context.addIssue({
      code: 'custom',
      message: 'must be a supported SQLite file: URL',
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
    PORT: z.coerce.number().int().min(1).max(65_535).default(3002),
    DATABASE_URL: sqliteDatabaseUrlSchema,
    TEACHER_ID: z.string().trim().min(1, 'must not be empty').optional(),
    CORS_ORIGINS: z
      .string()
      .default(DEFAULT_CORS_ORIGIN)
      .transform((value) => value.split(','))
      .pipe(z.array(httpOriginSchema).min(1, 'must contain at least one origin')),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === 'production' && value.TEACHER_ID === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['TEACHER_ID'],
        message: 'is required in production',
      })
    }
  })
  .transform((value) => ({
    ...value,
    TEACHER_ID: value.TEACHER_ID ?? DEFAULT_TEACHER_ID,
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
