export const ok = <T>(data: T) => ({ code: 0 as const, message: 'ok' as const, data })

export const fail = (code: string, message: string, data: unknown = null) => ({
  code,
  message,
  data,
})
