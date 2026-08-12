import { isProxy } from 'node:util/types'

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue }

const forbiddenObjectKeys = new Set(['__proto__', 'constructor', 'prototype'])
const MAX_JSON_DEPTH = 100
const MAX_JSON_NODES = 10_000
const MAX_JSON_ARRAY_LENGTH = 5_000

interface ValidationState {
  readonly ancestors: WeakSet<object>
  nodes: number
}

export function isSafeJsonObjectKey(key: string): boolean {
  return !forbiddenObjectKeys.has(key)
}

function invalidJson(path: string, cause?: unknown): never {
  const message = `Value at ${path} is not valid JSON`
  throw cause === undefined ? new TypeError(message) : new TypeError(message, { cause })
}

function inspectContainer(
  value: object,
  path: string,
): { isArray: boolean; keys: PropertyKey[]; prototype: object | null } {
  try {
    return {
      isArray: Array.isArray(value),
      keys: Reflect.ownKeys(value),
      prototype: Object.getPrototypeOf(value),
    }
  } catch (cause) {
    return invalidJson(path, cause)
  }
}

function ownDescriptor(
  value: object,
  key: PropertyKey,
  path: string,
): PropertyDescriptor {
  let descriptor: PropertyDescriptor | undefined
  try {
    descriptor = Object.getOwnPropertyDescriptor(value, key)
  } catch (cause) {
    return invalidJson(path, cause)
  }

  return descriptor ?? invalidJson(path)
}

function ownEnumerableDataValue(
  value: object,
  key: PropertyKey,
  path: string,
): unknown {
  const descriptor = ownDescriptor(value, key, path)
  if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
    return invalidJson(path)
  }
  return descriptor.value
}

function validateJson(
  value: unknown,
  path: string,
  depth: number,
  state: ValidationState,
): JsonValue {
  state.nodes += 1
  if (state.nodes > MAX_JSON_NODES) {
    return invalidJson(path)
  }

  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : invalidJson(path)
  }

  if (typeof value !== 'object') {
    return invalidJson(path)
  }

  // node:util/types performs an engine-level brand check. It does not invoke
  // any user-controlled Proxy trap, including for revoked proxies.
  if (isProxy(value)) {
    return invalidJson(path)
  }

  if (depth >= MAX_JSON_DEPTH || state.ancestors.has(value)) {
    return invalidJson(path)
  }

  const { isArray, keys, prototype } = inspectContainer(value, path)
  if (
    (isArray && prototype !== Array.prototype && prototype !== null) ||
    (!isArray && prototype !== Object.prototype && prototype !== null)
  ) {
    return invalidJson(path)
  }

  if (keys.length > MAX_JSON_NODES - state.nodes) {
    return invalidJson(path)
  }

  state.ancestors.add(value)

  try {
    if (isArray) {
      const lengthDescriptor = ownDescriptor(value, 'length', `${path}.length`)
      const length = lengthDescriptor.value
      if (
        !Object.hasOwn(lengthDescriptor, 'value') ||
        !Number.isSafeInteger(length) ||
        (length as number) < 0 ||
        (length as number) > MAX_JSON_ARRAY_LENGTH
      ) {
        return invalidJson(`${path}.length`)
      }

      for (const key of keys) {
        if (typeof key !== 'string') {
          return invalidJson(path)
        }
        if (key === 'length') {
          continue
        }
        const index = Number(key)
        if (
          !Number.isSafeInteger(index) ||
          index < 0 ||
          index >= length ||
          String(index) !== key
        ) {
          return invalidJson(`${path}.${key}`)
        }
      }

      const output: JsonValue[] = []
      for (let index = 0; index < length; index += 1) {
        const childPath = `${path}[${index}]`
        const entry = ownEnumerableDataValue(value, String(index), childPath)
        output.push(validateJson(entry, childPath, depth + 1, state))
      }
      return output
    }

    const output: Record<string, JsonValue> = {}
    for (const key of keys) {
      if (typeof key !== 'string' || !isSafeJsonObjectKey(key)) {
        return invalidJson(`${path}.${String(key)}`)
      }
      const childPath = `${path}.${key}`
      const entry = ownEnumerableDataValue(value, key, childPath)
      output[key] = validateJson(entry, childPath, depth + 1, state)
    }
    return output
  } finally {
    state.ancestors.delete(value)
  }
}

export function cloneSafeJson(value: unknown): JsonValue {
  return validateJson(value, '$', 0, {
    ancestors: new WeakSet(),
    nodes: 0,
  })
}
