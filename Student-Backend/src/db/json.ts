import type { Prisma } from '../generated/prisma/client.js'
import { cloneSafeJson } from '../common/json/safe-json.js'

export type { JsonValue } from '../common/json/safe-json.js'

export function toInputJson(value: unknown): Prisma.InputJsonValue {
  return cloneSafeJson(value) as Prisma.InputJsonValue
}
