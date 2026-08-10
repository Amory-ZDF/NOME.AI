interface SerializedError {
  [key: string]: unknown
  type: string
  name: string
  message: string
  stack: string
  code?: string | number
  cause?: SerializedError
}

function readProperty(value: object, key: string): unknown {
  try {
    return Reflect.get(value, key)
  } catch {
    return undefined
  }
}

function readString(value: object, key: string): string | undefined {
  const property = readProperty(value, key)
  return typeof property === 'string' ? property : undefined
}

function readConstructorName(value: object, fallback: string): string {
  const constructor = readProperty(value, 'constructor')

  if (
    (typeof constructor === 'object' && constructor !== null) ||
    typeof constructor === 'function'
  ) {
    const name = readString(constructor, 'name')
    if (name !== undefined && name !== 'Object') return name
  }

  return fallback
}

function serializeCause(value: unknown, seen: WeakSet<object>): SerializedError {
  if (typeof value === 'object' && value !== null) {
    return serializeErrorValue(value, seen)
  }

  return {
    type: 'NonErrorCause',
    name: 'NonErrorCause',
    message: '[Non-error cause omitted]',
    stack: '',
  }
}

function serializeErrorValue(value: object, seen: WeakSet<object>): SerializedError {
  if (seen.has(value)) {
    return {
      type: 'CircularError',
      name: 'CircularError',
      message: '[Circular error cause]',
      stack: '',
    }
  }

  seen.add(value)

  const name = readString(value, 'name') ?? 'Error'
  const message = readString(value, 'message') ?? 'Unknown error'
  const stack = readString(value, 'stack') ?? `${name}: ${message}`
  const constructorName = readConstructorName(value, name)
  const code = readProperty(value, 'code')
  const cause = readProperty(value, 'cause')
  const serialized: SerializedError = {
    type: constructorName,
    name,
    message,
    stack,
  }

  if (typeof code === 'string' || typeof code === 'number') {
    serialized.code = code
  }

  if (cause !== undefined) {
    serialized.cause = serializeCause(cause, seen)
  }

  seen.delete(value)
  return serialized
}

export function serializeError(error: unknown): SerializedError {
  if (typeof error === 'object' && error !== null) {
    return serializeErrorValue(error, new WeakSet<object>())
  }

  return {
    type: 'NonError',
    name: 'NonError',
    message: '[Non-error thrown value omitted]',
    stack: '',
  }
}
