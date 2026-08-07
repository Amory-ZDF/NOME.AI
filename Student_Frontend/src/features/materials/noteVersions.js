const SNAPSHOT_FIELDS = Object.freeze([
  'version',
  'title',
  'folderId',
  'folderPath',
  'tags',
  'content',
  'linkedTopics',
  'linkedErrors',
  'changedAt',
  'reason',
])

const EDITABLE_FIELDS = Object.freeze([
  'title',
  'folderId',
  'folderPath',
  'tags',
  'content',
  'linkedTopics',
  'linkedErrors',
])

const EDITABLE_FIELD_SET = new Set(EDITABLE_FIELDS)
const CONTENT_TYPES = new Set(['p', 'h', 'formula', 'image', 'list', 'highlight'])
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key)
const isNonemptyString = (value) => typeof value === 'string' && value.trim().length > 0
const isPositiveInteger = (value) => Number.isInteger(value) && value > 0

const isRecord = (value) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const isDenseArray = (value) => {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false

  for (let index = 0; index < value.length; index += 1) {
    if (!hasOwn(value, index)) return false
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
    if (!descriptor || !hasOwn(descriptor, 'value') || !descriptor.enumerable) return false
  }

  return Reflect.ownKeys(value).every((key) => {
    if (key === 'length') return true
    if (typeof key !== 'string') return false
    const index = Number(key)
    return Number.isInteger(index)
      && index >= 0
      && index < value.length
      && String(index) === key
  })
}

export class NoteVersionError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'NoteVersionError'
    this.code = code
  }
}

const fail = (code, message) => {
  throw new NoteVersionError(code, message)
}

const cloneJson = (value, invalid, ancestors = new WeakSet()) => {
  if (value === null) return null
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'object') invalid()
  if (ancestors.has(value)) invalid()

  ancestors.add(value)
  let clone

  if (Array.isArray(value)) {
    if (!isDenseArray(value)) invalid()
    clone = []
    for (let index = 0; index < value.length; index += 1) {
      clone.push(cloneJson(value[index], invalid, ancestors))
    }
  } else {
    if (!isRecord(value)) invalid()
    clone = {}
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string' || UNSAFE_KEYS.has(key)) invalid()
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (!descriptor || !hasOwn(descriptor, 'value') || !descriptor.enumerable) invalid()
      Object.defineProperty(clone, key, {
        configurable: true,
        enumerable: true,
        value: cloneJson(descriptor.value, invalid, ancestors),
        writable: true,
      })
    }
  }

  ancestors.delete(value)
  return clone
}

const invalidNote = () => fail('INVALID_NOTE', 'Note contains invalid or non-JSON data')
const invalidPatch = () => fail('INVALID_NOTE_PATCH', 'Note patch contains invalid fields')
const invalidVersionState = () => fail(
  'INVALID_NOTE_VERSION_STATE',
  'Note version history is invalid',
)

const isStringArray = (value) => (
  isDenseArray(value) && value.every(isNonemptyString)
)

const isContentBlock = (block) => (
  isRecord(block)
  && hasOwn(block, 't')
  && CONTENT_TYPES.has(block.t)
  && hasOwn(block, 'v')
  && typeof block.v === 'string'
)

const isContent = (value) => (
  isDenseArray(value) && value.every(isContentBlock)
)

const hasExactSnapshotFields = (snapshot) => {
  if (!isRecord(snapshot)) return false
  const keys = Reflect.ownKeys(snapshot)
  return keys.length === SNAPSHOT_FIELDS.length
    && keys.every((key) => typeof key === 'string' && SNAPSHOT_FIELDS.includes(key))
}

const isSnapshot = (snapshot, expectedVersion) => (
  hasExactSnapshotFields(snapshot)
  && snapshot.version === expectedVersion
  && isPositiveInteger(snapshot.version)
  && isNonemptyString(snapshot.title)
  && (snapshot.folderId === null || isNonemptyString(snapshot.folderId))
  && (snapshot.folderPath === null || isNonemptyString(snapshot.folderPath))
  && isStringArray(snapshot.tags)
  && isContent(snapshot.content)
  && isStringArray(snapshot.linkedTopics)
  && isStringArray(snapshot.linkedErrors)
  && isNonemptyString(snapshot.changedAt)
  && isNonemptyString(snapshot.reason)
)

const assertVersionState = (note) => {
  if (!isRecord(note)) invalidNote()
  if (
    !hasOwn(note, 'version')
    || !isPositiveInteger(note.version)
    || !hasOwn(note, 'versions')
    || !isDenseArray(note.versions)
    || note.versions.length !== note.version - 1
  ) {
    invalidVersionState()
  }

  note.versions.forEach((snapshot, index) => {
    let clonedSnapshot
    try {
      clonedSnapshot = cloneJson(snapshot, invalidVersionState)
    } catch (error) {
      if (error instanceof NoteVersionError) invalidVersionState()
      throw error
    }
    if (!isSnapshot(clonedSnapshot, index + 1)) invalidVersionState()
  })
}

const assertNoteShape = (note) => {
  if (!hasOwn(note, 'id') || !isNonemptyString(note.id)) invalidNote()
  if (!hasOwn(note, 'title') || !isNonemptyString(note.title)) invalidNote()
  if (hasOwn(note, 'folderId') && note.folderId !== null && !isNonemptyString(note.folderId)) invalidNote()
  if (hasOwn(note, 'folderPath') && note.folderPath !== null && !isNonemptyString(note.folderPath)) invalidNote()
  if (!hasOwn(note, 'tags') || !isStringArray(note.tags)) invalidNote()
  if (!hasOwn(note, 'content') || !isContent(note.content)) invalidNote()
  if (!hasOwn(note, 'linkedTopics') || !isStringArray(note.linkedTopics)) invalidNote()
  if (!hasOwn(note, 'linkedErrors') || !isStringArray(note.linkedErrors)) invalidNote()
  if (hasOwn(note, 'aiSuggestions') && !isDenseArray(note.aiSuggestions)) invalidNote()
}

const cloneAndValidateNote = (note) => {
  if (!isRecord(note)) invalidNote()

  const hasVersion = hasOwn(note, 'version')
  const hasVersions = hasOwn(note, 'versions')
  if (hasVersion !== hasVersions) invalidVersionState()

  if (hasVersion) assertVersionState(note)

  const rawClone = cloneJson(note, invalidNote)
  const clone = hasVersion
    ? rawClone
    : { ...rawClone, versions: [], version: 1 }

  assertVersionState(clone)
  assertNoteShape(clone)
  return clone
}

const cloneAndValidatePatch = (patch) => {
  const clone = cloneJson(patch, invalidPatch)
  if (!isRecord(clone)) invalidPatch()

  for (const [field, value] of Object.entries(clone)) {
    if (!EDITABLE_FIELD_SET.has(field)) invalidPatch()
    if (field === 'title' || field === 'folderId' || field === 'folderPath') {
      if (!isNonemptyString(value)) invalidPatch()
    } else if (field === 'content') {
      if (!isContent(value)) invalidPatch()
    } else if (!isStringArray(value)) {
      invalidPatch()
    }
  }

  return clone
}

const cloneChangeMetadata = (metadata) => {
  const invalid = () => fail('INVALID_CHANGE_METADATA', 'Change metadata is invalid')
  const clone = cloneJson(metadata, invalid)
  if (
    !isRecord(clone)
    || Reflect.ownKeys(clone).length !== 2
    || !hasOwn(clone, 'changedAt')
    || !isNonemptyString(clone.changedAt)
    || !hasOwn(clone, 'reason')
    || !isNonemptyString(clone.reason)
  ) {
    invalid()
  }
  return clone
}

const cloneChangedAt = (changedAt) => {
  if (!isNonemptyString(changedAt)) {
    fail('INVALID_CHANGE_METADATA', 'Change metadata is invalid')
  }
  return changedAt
}

const cloneSnapshotValue = (value) => cloneJson(value, invalidNote)

const createSnapshot = (note, changedAt, reason) => ({
  version: note.version,
  title: note.title,
  folderId: hasOwn(note, 'folderId') ? note.folderId : null,
  folderPath: hasOwn(note, 'folderPath') ? note.folderPath : null,
  tags: cloneSnapshotValue(note.tags),
  content: cloneSnapshotValue(note.content),
  linkedTopics: cloneSnapshotValue(note.linkedTopics),
  linkedErrors: cloneSnapshotValue(note.linkedErrors),
  changedAt,
  reason,
})

const structurallyEqual = (left, right) => {
  if (Object.is(left, right)) return true
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
    return false
  }
  if (Array.isArray(left) !== Array.isArray(right)) return false

  if (Array.isArray(left)) {
    return left.length === right.length
      && left.every((value, index) => structurallyEqual(value, right[index]))
  }

  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => (
      key === rightKeys[index] && structurallyEqual(left[key], right[key])
    ))
}

const applyValidatedChange = (note, patch, { changedAt, reason }) => {
  const meaningful = Object.entries(patch).some(([field, value]) => (
    !structurallyEqual(note[field], value)
  ))
  if (!meaningful) return note

  const snapshot = createSnapshot(note, changedAt, reason)
  return {
    ...note,
    ...patch,
    updatedAt: changedAt,
    versions: [...note.versions, snapshot],
    version: note.version + 1,
  }
}

export function applyNotePatch(note, patch, metadata) {
  const noteClone = cloneAndValidateNote(note)
  const patchClone = cloneAndValidatePatch(patch)
  const metadataClone = cloneChangeMetadata(metadata)
  return applyValidatedChange(noteClone, patchClone, metadataClone)
}

const uniqueStrings = (values) => {
  const seen = new Set()
  return values.filter((value) => {
    if (seen.has(value)) return false
    seen.add(value)
    return true
  })
}

const uniqueContent = (blocks) => blocks.filter((block, index) => (
  blocks.findIndex((candidate) => structurallyEqual(candidate, block)) === index
))

const invalidSuggestion = () => fail(
  'INVALID_NOTE_SUGGESTION',
  'Selected note suggestion is invalid',
)

const canonicalJson = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`

  const entries = Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
  return `{${entries.join(',')}}`
}

const stableHash = (value) => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

const normalizeSuggestions = (suggestions) => {
  if (!isDenseArray(suggestions)) invalidSuggestion()

  const explicitIds = new Set()
  suggestions.forEach((suggestion) => {
    if (!isRecord(suggestion)) invalidSuggestion()
    if (hasOwn(suggestion, 'id')) {
      if (!isNonemptyString(suggestion.id) || explicitIds.has(suggestion.id)) invalidSuggestion()
      explicitIds.add(suggestion.id)
    }
  })

  const usedIds = new Set(explicitIds)
  return suggestions.map((suggestion, index) => {
    if (hasOwn(suggestion, 'id')) return cloneJson(suggestion, invalidSuggestion)

    const fingerprint = stableHash(canonicalJson(suggestion))
    const baseId = `legacy-note-suggestion-${index}-${fingerprint}`
    let id = baseId
    let suffix = 2
    while (usedIds.has(id)) {
      id = `${baseId}-${suffix}`
      suffix += 1
    }
    usedIds.add(id)

    return { ...cloneJson(suggestion, invalidSuggestion), id }
  })
}

export function normalizeNoteSuggestions(note) {
  const noteClone = cloneAndValidateNote(note)
  const suggestions = hasOwn(noteClone, 'aiSuggestions') ? noteClone.aiSuggestions : []
  return normalizeSuggestions(suggestions)
}

const applySuggestion = (draft, suggestion) => {
  if (!isRecord(suggestion) || !isNonemptyString(suggestion.id) || !isNonemptyString(suggestion.type)) {
    invalidSuggestion()
  }

  switch (suggestion.type) {
    case 'add_tag':
    case 'tag': {
      const tag = hasOwn(suggestion, 'tag') ? suggestion.tag : suggestion.value
      if (!isNonemptyString(tag)) invalidSuggestion()
      draft.tags.push(tag)
      return
    }
    case 'append_content':
    case 'content': {
      const blocks = hasOwn(suggestion, 'content') ? suggestion.content : suggestion.blocks
      if (!isContent(blocks) || blocks.length === 0) invalidSuggestion()
      draft.content.push(...cloneJson(blocks, invalidSuggestion))
      return
    }
    case 'link_topic': {
      const hasPayload = hasOwn(suggestion, 'topicId') || hasOwn(suggestion, 'value')
      if (!hasPayload) {
        if (!isNonemptyString(suggestion.message)) invalidSuggestion()
        return
      }
      const topicId = hasOwn(suggestion, 'topicId') ? suggestion.topicId : suggestion.value
      if (!isNonemptyString(topicId)) invalidSuggestion()
      draft.linkedTopics.push(topicId)
      return
    }
    case 'link_error': {
      const errorId = hasOwn(suggestion, 'errorId') ? suggestion.errorId : suggestion.value
      if (!isNonemptyString(errorId)) invalidSuggestion()
      draft.linkedErrors.push(errorId)
      return
    }
    case 'split_note':
    case 'related_content':
      if (!isNonemptyString(suggestion.message)) invalidSuggestion()
      return
    default:
      invalidSuggestion()
  }
}

const cloneSuggestionIds = (suggestionIds) => {
  const invalid = () => fail('INVALID_SUGGESTION_IDS', 'Suggestion ids must be JSON strings')
  const clone = cloneJson(suggestionIds, invalid)
  if (!isStringArray(clone)) invalid()
  return uniqueStrings(clone)
}

export function applyNoteOrganization(note, suggestionIds, changedAt) {
  const noteClone = cloneAndValidateNote(note)
  const selectedIds = cloneSuggestionIds(suggestionIds)
  const stableChangedAt = cloneChangedAt(changedAt)
  const suggestions = normalizeSuggestions(
    hasOwn(noteClone, 'aiSuggestions') ? noteClone.aiSuggestions : [],
  )

  const suggestionsById = new Map()
  for (const suggestion of suggestions) {
    if (isRecord(suggestion) && isNonemptyString(suggestion.id) && !suggestionsById.has(suggestion.id)) {
      suggestionsById.set(suggestion.id, suggestion)
    }
  }

  const selectedSuggestions = selectedIds
    .map((id) => suggestionsById.get(id))
    .filter(Boolean)

  if (selectedSuggestions.length === 0) return noteClone

  const draft = {
    tags: [...noteClone.tags],
    content: cloneSnapshotValue(noteClone.content),
    linkedTopics: [...noteClone.linkedTopics],
    linkedErrors: [...noteClone.linkedErrors],
  }
  selectedSuggestions.forEach((suggestion) => applySuggestion(draft, suggestion))

  const patch = {
    tags: uniqueStrings([...draft.tags, 'organized']),
    content: uniqueContent(draft.content),
    linkedTopics: uniqueStrings(draft.linkedTopics),
    linkedErrors: uniqueStrings(draft.linkedErrors),
    source: 'ai_organized',
  }

  return applyValidatedChange(noteClone, patch, {
    changedAt: stableChangedAt,
    reason: 'ai_organize',
  })
}

export function undoLastNoteVersion(note, changedAt) {
  const noteClone = cloneAndValidateNote(note)
  const stableChangedAt = cloneChangedAt(changedAt)
  if (noteClone.versions.length === 0) {
    fail('NO_NOTE_VERSION', 'There is no previous note version to restore')
  }

  const target = noteClone.versions[noteClone.versions.length - 1]
  const currentSnapshot = createSnapshot(noteClone, stableChangedAt, 'undo')

  return {
    ...noteClone,
    title: target.title,
    folderId: target.folderId,
    folderPath: target.folderPath,
    tags: cloneSnapshotValue(target.tags),
    content: cloneSnapshotValue(target.content),
    linkedTopics: cloneSnapshotValue(target.linkedTopics),
    linkedErrors: cloneSnapshotValue(target.linkedErrors),
    updatedAt: stableChangedAt,
    versions: [...noteClone.versions, currentSnapshot],
    version: noteClone.version + 1,
  }
}
