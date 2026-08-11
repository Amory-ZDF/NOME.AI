import { z } from 'zod'

export const errorEnvelopeSchema = z.strictObject({
  code: z.string().min(1),
  message: z.string(),
  data: z.null(),
})

export const ok = <T>(data: T) => ({ code: 0 as const, message: 'ok' as const, data })

export const fail = (code: string, message: string, data: unknown = null) => ({
  code,
  message,
  data,
})
