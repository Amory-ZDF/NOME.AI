export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue }

interface AppErrorOptions {
  cause?: unknown
}

function assertJsonSafe(
  value: unknown,
  ancestors = new WeakSet<object>(),
): asserts value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return
  }

  if (typeof value === 'number') {
    if (Number.isFinite(value)) return
    throw new TypeError('AppError data must be JSON-safe')
  }

  if (typeof value !== 'object') {
    throw new TypeError('AppError data must be JSON-safe')
  }

  if (ancestors.has(value)) {
    throw new TypeError('AppError data must be JSON-safe')
  }

  ancestors.add(value)

  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) {
      throw new TypeError('AppError data must be JSON-safe')
    }

    for (const item of value) assertJsonSafe(item, ancestors)
    ancestors.delete(value)
    return
  }

  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('AppError data must be JSON-safe')
  }

  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') {
      throw new TypeError('AppError data must be JSON-safe')
    }

    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw new TypeError('AppError data must be JSON-safe')
    }

    assertJsonSafe(descriptor.value, ancestors)
  }

  ancestors.delete(value)
}

export class AppError extends Error {
  readonly status: number
  readonly code: string
  readonly data: JsonValue

  constructor(
    message: string,
    status: number,
    code: string,
    data?: JsonValue,
    options?: AppErrorOptions,
  ) {
    super(message, options)

    if (!Number.isInteger(status) || status < 400 || status > 599) {
      throw new TypeError('AppError status must be an integer between 400 and 599')
    }

    const normalizedData = data ?? null
    assertJsonSafe(normalizedData)

    this.name = 'AppError'
    this.status = status
    this.code = code
    this.data = normalizedData
  }
}
