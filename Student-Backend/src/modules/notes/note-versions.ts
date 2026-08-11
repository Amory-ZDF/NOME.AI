import { ZodError } from 'zod'

import { cloneSafeJson, type JsonValue } from '../../common/json/safe-json.js'
import {
  evidenceTimeSchema,
  noteSchema,
  type Note,
} from '../../contracts/student-contracts.js'

const editableFields = new Set([
  'title', 'folderId', 'folderPath', 'tags', 'content', 'linkedTopics', 'linkedErrors',
])

export class NoteContractError extends Error {
  constructor(readonly code: 'INVALID_NOTE' | 'INVALID_NOTE_PATCH' | 'INVALID_CHANGE_METADATA') {
    super(code)
    this.name = 'NoteContractError'
  }
}

function fail(code: NoteContractError['code']): never {
  throw new NoteContractError(code)
}

function asObject(value: JsonValue, code: NoteContractError['code']): Record<string, JsonValue> {
  if (value === null || Array.isArray(value) || typeof value !== 'object') fail(code)
  return value
}

function safeObject(value: unknown, code: NoteContractError['code']): Record<string, JsonValue> {
  try {
    return asObject(cloneSafeJson(value), code)
  } catch (cause) {
    if (cause instanceof NoteContractError) throw cause
    return fail(code)
  }
}

function parseNote(value: unknown, code: NoteContractError['code']): Note {
  try {
    return noteSchema.parse(value)
  } catch (cause) {
    if (cause instanceof ZodError) return fail(code)
    throw cause
  }
}

export function normalizePersistedNote(value: unknown): Note {
  const raw = safeObject(value, 'INVALID_NOTE')
  const hasVersion = Object.hasOwn(raw, 'version')
  const hasVersions = Object.hasOwn(raw, 'versions')
  if (hasVersion !== hasVersions) fail('INVALID_NOTE')
  return parseNote(hasVersion ? raw : { ...raw, version: 1, versions: [] }, 'INVALID_NOTE')
}

export function sanitizeCreatedNote(value: unknown): Note {
  return normalizePersistedNote(value)
}

export interface NotePatchCommand {
  patch: Record<string, JsonValue>
  changedAt: string
  reason: string
}

export function sanitizeNotePatchCommand(value: unknown): NotePatchCommand {
  const body = safeObject(value, 'INVALID_NOTE_PATCH')
  const hasChangedAt = Object.hasOwn(body, 'changedAt')
  const hasUpdatedAt = Object.hasOwn(body, 'updatedAt')
  if (!hasChangedAt && !hasUpdatedAt) fail('INVALID_CHANGE_METADATA')
  for (const field of ['changedAt', 'updatedAt'] as const) {
    if (Object.hasOwn(body, field) && (
      typeof body[field] !== 'string' || !evidenceTimeSchema.safeParse(body[field]).success
    )) fail('INVALID_CHANGE_METADATA')
  }
  const changedAt = hasChangedAt ? body.changedAt as string : body.updatedAt as string
  const reason = Object.hasOwn(body, 'reason') ? body.reason : 'edit'
  if (typeof reason !== 'string' || reason.trim().length === 0) fail('INVALID_CHANGE_METADATA')

  const patch: Record<string, JsonValue> = {}
  for (const [key, field] of Object.entries(body)) {
    if (key === 'changedAt' || key === 'updatedAt' || key === 'reason') continue
    if (!editableFields.has(key)) fail('INVALID_NOTE_PATCH')
    patch[key] = field
  }
  // Validate patched values against the canonical Note contract without allowing
  // callers to supply any immutable field.
  const probe = {
    id: 'probe', title: 'probe', folderId: null, folderPath: null, tags: [], linkedTopics: [],
    linkedErrors: [], source: 'typed', createdAt: '2026-01-01', updatedAt: '2026-01-01',
    content: [], aiSuggestions: [], version: 1, versions: [], ...patch,
  }
  parseNote(probe, 'INVALID_NOTE_PATCH')
  return { patch, changedAt, reason }
}

function structurallyEqual(left: JsonValue | undefined, right: JsonValue): boolean {
  if (Object.is(left, right)) return true
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => structurallyEqual(value, right[index]!))
  }
  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index] && structurallyEqual(left[key], right[key]!))
}

export function hasLegacyVersionFields(value: unknown): boolean {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && !Object.hasOwn(value, 'version') && !Object.hasOwn(value, 'versions')
}

export function applyNotePatch(note: Note, command: NotePatchCommand): Note {
  const changed = Object.entries(command.patch).some(([key, value]) => (
    !structurallyEqual(note[key as keyof Note] as JsonValue | undefined, value)
  ))
  if (!changed) return note
  const snapshot = {
    version: note.version,
    title: note.title,
    folderId: note.folderId,
    folderPath: note.folderPath,
    tags: note.tags,
    content: note.content,
    linkedTopics: note.linkedTopics,
    linkedErrors: note.linkedErrors,
    source: note.source,
    changedAt: command.changedAt,
    reason: command.reason,
  }
  return parseNote({
    ...note,
    ...command.patch,
    updatedAt: command.changedAt,
    version: note.version + 1,
    versions: [...note.versions, snapshot],
  }, 'INVALID_NOTE')
}
