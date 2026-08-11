import type { Prisma } from '../generated/prisma/client.js'

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue }

const forbiddenObjectKeys = new Set(['__proto__', 'constructor', 'prototype'])

function invalidJson(path: string): never {
  throw new TypeError(`Value at ${path} is not valid JSON`)
}

function validateJson(value: unknown, path: string, ancestors: WeakSet<object>): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : invalidJson(path)
  }

  if (typeof value !== 'object') {
    return invalidJson(path)
  }

  if (ancestors.has(value)) {
    return invalidJson(path)
  }

  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null && !Array.isArray(value)) {
    return invalidJson(path)
  }

  ancestors.add(value)

  try {
    if (Array.isArray(value)) {
      return value.map((entry, index) => {
        if (!Object.hasOwn(value, index)) {
          return invalidJson(`${path}[${index}]`)
        }
        return validateJson(entry, `${path}[${index}]`, ancestors)
      })
    }

    if (Object.getOwnPropertySymbols(value).length > 0) {
      return invalidJson(path)
    }

    const output: Record<string, JsonValue> = {}
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
      if (
        forbiddenObjectKeys.has(key) ||
        !descriptor.enumerable ||
        !Object.hasOwn(descriptor, 'value')
      ) {
        return invalidJson(`${path}.${key}`)
      }
      output[key] = validateJson(descriptor.value, `${path}.${key}`, ancestors)
    }
    return output
  } finally {
    ancestors.delete(value)
  }
}

export function toInputJson(value: unknown): Prisma.InputJsonValue {
  const validated = validateJson(value, '$', new WeakSet())
  return validated as Prisma.InputJsonValue
}
