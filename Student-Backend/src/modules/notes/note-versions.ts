import { ZodError } from 'zod'

import { cloneSafeJson, type JsonValue } from '../../common/json/safe-json.js'
import {
  evidenceTimeSchema,
  noteIdSchema,
  noteSchema,
  type Note,
} from '../../contracts/student-contracts.js'

const editableFields = new Set([
  'title', 'folderId', 'folderPath', 'tags', 'content', 'linkedTopics', 'linkedErrors',
])

export class NoteContractError extends Error {
  constructor(readonly code: 'INVALID_NOTE' | 'INVALID_NOTE_PATCH' | 'INVALID_CHANGE_METADATA' | 'INVALID_NOTE_SUGGESTION') {
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

export interface NoteOrganizeCommand {
  suggestionIds: string[]
  changedAt: string
}

export interface NoteUndoCommand {
  changedAt: string
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

function invalidSuggestion(): never { return fail('INVALID_NOTE_SUGGESTION') }

export function sanitizeNoteOrganizeCommand(value: unknown): NoteOrganizeCommand {
  const body = safeObject(value, 'INVALID_NOTE_SUGGESTION')
  const keys = Object.keys(body)
  if (keys.length !== 2 || !Object.hasOwn(body, 'suggestionIds') || !Object.hasOwn(body, 'changedAt')) invalidSuggestion()
  if (typeof body.changedAt !== 'string' || !evidenceTimeSchema.safeParse(body.changedAt).success) {
    fail('INVALID_CHANGE_METADATA')
  }
  if (!Array.isArray(body.suggestionIds)) invalidSuggestion()
  const suggestionIds = body.suggestionIds.map((id) => {
    if (typeof id !== 'string' || !noteIdSchema.safeParse(id).success) invalidSuggestion()
    return id
  })
  if (new Set(suggestionIds).size !== suggestionIds.length) invalidSuggestion()
  return { suggestionIds, changedAt: body.changedAt }
}

export function sanitizeNoteUndoCommand(value: unknown): NoteUndoCommand {
  const body = safeObject(value, 'INVALID_CHANGE_METADATA')
  const keys = Object.keys(body)
  if (keys.length !== 1 || !Object.hasOwn(body, 'changedAt') || typeof body.changedAt !== 'string' || !evidenceTimeSchema.safeParse(body.changedAt).success) {
    fail('INVALID_CHANGE_METADATA')
  }
  return { changedAt: body.changedAt }
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

function snapshot(note: Note, changedAt: string, reason: string) {
  return {
    version: note.version,
    title: note.title,
    folderId: note.folderId,
    folderPath: note.folderPath,
    tags: note.tags,
    content: note.content,
    linkedTopics: note.linkedTopics,
    linkedErrors: note.linkedErrors,
    source: note.source,
    changedAt,
    reason,
  }
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}

function uniqueContent(values: Note['content']): Note['content'] {
  return values.filter((value, index) => !values.slice(0, index).some((candidate) => (
    structurallyEqual(candidate as JsonValue, value as JsonValue)
  )))
}

function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key]!)}`).join(',')}}`
}

function stableHash(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function normalizedSuggestions(note: Note): Array<Record<string, JsonValue> & { id: string; type: string }> {
  const explicitIds = new Set<string>()
  const suggestions = note.aiSuggestions.map((suggestion) => safeObject(suggestion, 'INVALID_NOTE_SUGGESTION'))
  for (const suggestion of suggestions) {
    if (Object.hasOwn(suggestion, 'id')) {
      if (typeof suggestion.id !== 'string' || !noteIdSchema.safeParse(suggestion.id).success || explicitIds.has(suggestion.id)) invalidSuggestion()
      explicitIds.add(suggestion.id)
    }
  }
  const usedIds = new Set(explicitIds)
  return suggestions.map((suggestion, index) => {
    if (typeof suggestion.id === 'string') return suggestion as Record<string, JsonValue> & { id: string; type: string }
    const base = `legacy-note-suggestion-${index}-${stableHash(canonicalJson(suggestion))}`
    let id = base
    let suffix = 2
    while (usedIds.has(id)) { id = `${base}-${suffix}`; suffix += 1 }
    usedIds.add(id)
    if (typeof suggestion.type !== 'string') invalidSuggestion()
    return { ...suggestion, id } as Record<string, JsonValue> & { id: string; type: string }
  })
}

export function normalizeNoteSuggestions(note: Note): Array<Record<string, JsonValue> & { id: string; type: string }> {
  return normalizedSuggestions(note)
}

function suggestionString(suggestion: Record<string, JsonValue>, field: string): string | undefined {
  const value = suggestion[field]
  return typeof value === 'string' ? value : undefined
}

export function applyNoteOrganization(note: Note, command: NoteOrganizeCommand): Note {
  const known = new Map(normalizedSuggestions(note).map((suggestion) => [suggestion.id, suggestion]))
  const selected = command.suggestionIds.map((id) => {
    const suggestion = known.get(id)
    if (suggestion === undefined) invalidSuggestion()
    return suggestion
  })
  if (selected.length === 0) return note
  const tags = [...note.tags]
  const content = [...note.content]
  const linkedTopics = [...note.linkedTopics]
  const linkedErrors = [...note.linkedErrors]
  for (const suggestion of selected) {
    switch (suggestion.type) {
      case 'split_note':
      case 'related_content':
        break
      case 'add_tag':
      case 'tag': {
        const tag = suggestionString(suggestion, 'tag') ?? suggestionString(suggestion, 'value')
        if (tag === undefined) invalidSuggestion()
        tags.push(tag)
        break
      }
      case 'append_content':
      case 'content': {
        const blocks = suggestion.content ?? suggestion.blocks
        if (!Array.isArray(blocks) || blocks.length === 0) invalidSuggestion()
        content.push(...blocks as Note['content'])
        break
      }
      case 'link_topic': {
        const topicId = suggestionString(suggestion, 'topicId') ?? suggestionString(suggestion, 'value')
        if (topicId !== undefined) linkedTopics.push(topicId)
        break
      }
      case 'link_error': {
        const errorId = suggestionString(suggestion, 'errorId') ?? suggestionString(suggestion, 'value')
        if (errorId === undefined) invalidSuggestion()
        linkedErrors.push(errorId)
        break
      }
      default:
        invalidSuggestion()
    }
  }
  const next = {
    ...note,
    tags: uniqueStrings([...tags, 'organized']),
    content: uniqueContent(content),
    linkedTopics: uniqueStrings(linkedTopics),
    linkedErrors: uniqueStrings(linkedErrors),
    source: 'ai_organized' as const,
  }
  const changed = !structurallyEqual(note.tags as unknown as JsonValue, next.tags as unknown as JsonValue)
    || !structurallyEqual(note.content as unknown as JsonValue, next.content as unknown as JsonValue)
    || !structurallyEqual(note.linkedTopics as unknown as JsonValue, next.linkedTopics as unknown as JsonValue)
    || !structurallyEqual(note.linkedErrors as unknown as JsonValue, next.linkedErrors as unknown as JsonValue)
    || note.source !== next.source
  if (!changed) return note
  return parseNote({ ...next, updatedAt: command.changedAt, version: note.version + 1, versions: [...note.versions, snapshot(note, command.changedAt, 'ai_organize')] }, 'INVALID_NOTE')
}

export function undoLastNoteVersion(note: Note, changedAt: string): Note | null {
  const target = note.versions.at(-1)
  if (target === undefined) return null
  return parseNote({
    ...note,
    title: target.title,
    folderId: target.folderId,
    folderPath: target.folderPath,
    tags: target.tags,
    content: target.content,
    linkedTopics: target.linkedTopics,
    linkedErrors: target.linkedErrors,
    ...(target.source === null ? {} : { source: target.source }),
    updatedAt: changedAt,
    version: note.version + 1,
    versions: [...note.versions, snapshot(note, changedAt, 'undo')],
  }, 'INVALID_NOTE')
}
