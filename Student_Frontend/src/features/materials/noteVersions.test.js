import { describe, expect, test } from 'vitest'
import {
  applyNoteOrganization,
  applyNotePatch,
  NoteVersionError,
  undoLastNoteVersion,
} from './noteVersions'

const SNAPSHOT_FIELDS = [
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
]

const makeNote = (overrides = {}) => ({
  id: 'n1',
  title: 'Old title',
  folderId: 'f-math',
  folderPath: 'A-Level Math',
  tags: ['calculus'],
  content: [{ t: 'p', v: 'Original paragraph' }],
  linkedTopics: ['topic-existing'],
  linkedErrors: ['error-existing'],
  aiSuggestions: [],
  source: 'typed',
  createdAt: '2026-08-01T08:00:00Z',
  updatedAt: '2026-08-01T08:00:00Z',
  versions: [],
  version: 1,
  ...overrides,
})

const editOptions = {
  changedAt: '2026-08-06T10:00:00Z',
  reason: 'title_edit',
}

const expectVersionError = (action, code) => {
  try {
    action()
    throw new Error('Expected a NoteVersionError')
  } catch (error) {
    expect(error).toBeInstanceOf(NoteVersionError)
    expect(error.code).toBe(code)
  }
}

describe('applyNotePatch', () => {
  test('records an exact immutable previous-version snapshot for a meaningful edit', () => {
    const note = makeNote()
    const original = JSON.parse(JSON.stringify(note))

    const next = applyNotePatch(note, { title: 'New title' }, editOptions)

    expect(next).toMatchObject({
      title: 'New title',
      version: 2,
      updatedAt: editOptions.changedAt,
    })
    expect(Object.keys(next.versions[0])).toEqual(SNAPSHOT_FIELDS)
    expect(next.versions[0]).toEqual({
      version: 1,
      title: 'Old title',
      folderId: 'f-math',
      folderPath: 'A-Level Math',
      tags: ['calculus'],
      content: [{ t: 'p', v: 'Original paragraph' }],
      linkedTopics: ['topic-existing'],
      linkedErrors: ['error-existing'],
      changedAt: editOptions.changedAt,
      reason: editOptions.reason,
    })
    expect(note).toEqual(original)

    next.tags.push('next-only')
    next.content[0].v = 'next mutation'
    next.versions[0].tags.push('history-only')
    next.versions[0].content[0].v = 'history mutation'

    expect(note).toEqual(original)
    expect(next.tags).toEqual(['calculus', 'next-only'])
    expect(next.versions[0].tags).toEqual(['calculus', 'history-only'])
  })

  test('returns an equivalent isolated note without adding history for a structural no-op', () => {
    const note = makeNote({
      content: [{ t: 'p', v: 'Same' }, { t: 'formula', v: 'x = 1' }],
    })
    const patch = {
      title: 'Old title',
      tags: ['calculus'],
      content: [{ v: 'Same', t: 'p' }, { v: 'x = 1', t: 'formula' }],
      linkedTopics: ['topic-existing'],
    }

    const next = applyNotePatch(note, patch, editOptions)

    expect(next).toEqual(note)
    expect(next).not.toBe(note)
    expect(next.content).not.toBe(note.content)
    expect(next.version).toBe(1)
    expect(next.versions).toEqual([])
  })

  test('updates every editable field and rejects immutable or unknown fields', () => {
    const next = applyNotePatch(makeNote(), {
      title: 'Edited',
      folderId: 'f-calculus',
      folderPath: 'A-Level Math / Calculus',
      tags: ['exam'],
      content: [{ t: 'h', v: 'Derivative rules' }],
      linkedTopics: ['topic-derivatives'],
      linkedErrors: ['error-derivatives'],
    }, editOptions)

    expect(next).toMatchObject({
      title: 'Edited',
      folderId: 'f-calculus',
      folderPath: 'A-Level Math / Calculus',
      tags: ['exam'],
      content: [{ t: 'h', v: 'Derivative rules' }],
      linkedTopics: ['topic-derivatives'],
      linkedErrors: ['error-derivatives'],
      version: 2,
    })
    expectVersionError(
      () => applyNotePatch(makeNote(), { source: 'ai_organized' }, editOptions),
      'INVALID_NOTE_PATCH',
    )
    expectVersionError(
      () => applyNotePatch(makeNote(), { id: 'different' }, editOptions),
      'INVALID_NOTE_PATCH',
    )
  })

  test.each([
    ['a custom-prototype note', () => Object.assign(Object.create({ inherited: true }), makeNote())],
    ['an undefined patch value', () => ({ title: undefined })],
    ['a non-finite patch value', () => ({ tags: [Number.POSITIVE_INFINITY] })],
    ['a sparse patch array', () => {
      const tags = []
      tags.length = 1
      return { tags }
    }],
    ['an enumerable array property', () => {
      const tags = ['calculus']
      tags.extra = 'unsafe'
      return { tags }
    }],
    ['a cyclic patch', () => {
      const patch = { tags: [] }
      patch.tags.push(patch)
      return patch
    }],
    ['a prototype-polluting patch key', () => {
      const patch = { title: 'Safe' }
      Object.defineProperty(patch, '__proto__', {
        enumerable: true,
        value: { polluted: true },
      })
      return patch
    }],
  ])('rejects %s without mutating the note', (_case, buildValue) => {
    const note = makeNote()
    const original = JSON.parse(JSON.stringify(note))
    const value = buildValue()
    const action = _case === 'a custom-prototype note'
      ? () => applyNotePatch(value, { title: 'New' }, editOptions)
      : () => applyNotePatch(note, value, editOptions)

    expectVersionError(action, _case === 'a custom-prototype note' ? 'INVALID_NOTE' : 'INVALID_NOTE_PATCH')
    expect(note).toEqual(original)
  })

  test.each([
    ['zero current version', { version: 0 }],
    ['missing version history', { versions: undefined }],
    ['gapped version history', {
      version: 3,
      versions: [{
        version: 1,
        title: 'V1',
        folderId: 'f-math',
        folderPath: 'A-Level Math',
        tags: [],
        content: [],
        linkedTopics: [],
        linkedErrors: [],
        changedAt: '2026-08-02T00:00:00Z',
        reason: 'edit',
      }],
    }],
    ['snapshot with extra fields', {
      version: 2,
      versions: [{
        version: 1,
        title: 'V1',
        folderId: 'f-math',
        folderPath: 'A-Level Math',
        tags: [],
        content: [],
        linkedTopics: [],
        linkedErrors: [],
        changedAt: '2026-08-02T00:00:00Z',
        reason: 'edit',
        extra: true,
      }],
    }],
  ])('rejects an invalid note version state: %s', (_case, overrides) => {
    expectVersionError(
      () => applyNotePatch(makeNote(overrides), { title: 'New' }, editOptions),
      'INVALID_NOTE_VERSION_STATE',
    )
  })
})

describe('applyNoteOrganization', () => {
  test('applies only selected existing suggestions by type and deduplicates all additions', () => {
    const note = makeNote({
      tags: ['calculus', 'calculus'],
      content: [
        { t: 'p', v: 'Original paragraph' },
        { t: 'p', v: 'Original paragraph' },
      ],
      linkedTopics: ['topic-existing', 'topic-existing'],
      linkedErrors: ['error-existing', 'error-existing'],
      aiSuggestions: [
        { id: 's-tag', type: 'add_tag', tag: 'exam-ready' },
        { id: 's-content', type: 'append_content', content: [{ t: 'p', v: 'AI summary' }] },
        { id: 's-topic', type: 'link_topic', topicId: 'topic-new' },
        { id: 's-error', type: 'link_error', errorId: 'error-new' },
        { id: 's-unselected', type: 'add_tag', tag: 'must-not-apply' },
      ],
    })
    const original = JSON.parse(JSON.stringify(note))

    const next = applyNoteOrganization(
      note,
      ['s-tag', 'unknown', 's-content', 's-topic', 's-error', 's-tag'],
      '2026-08-06T11:00:00Z',
    )

    expect(next).toMatchObject({
      tags: ['calculus', 'exam-ready', 'organized'],
      content: [
        { t: 'p', v: 'Original paragraph' },
        { t: 'p', v: 'AI summary' },
      ],
      linkedTopics: ['topic-existing', 'topic-new'],
      linkedErrors: ['error-existing', 'error-new'],
      source: 'ai_organized',
      version: 2,
      updatedAt: '2026-08-06T11:00:00Z',
    })
    expect(next.tags).not.toContain('must-not-apply')
    expect(next.versions[0].reason).toBe('ai_organize')
    expect(next.versions[0].changedAt).toBe('2026-08-06T11:00:00Z')
    expect(note).toEqual(original)
  })

  test('does not create a version when selected suggestions produce no actual change', () => {
    const note = makeNote({
      tags: ['calculus', 'organized'],
      source: 'ai_organized',
      aiSuggestions: [
        { id: 's-tag', type: 'add_tag', tag: 'calculus' },
        { id: 's-topic', type: 'link_topic', topicId: 'topic-existing' },
      ],
    })

    const duplicate = applyNoteOrganization(note, ['s-tag', 's-topic'], '2026-08-06T11:00:00Z')
    const unknown = applyNoteOrganization(note, ['missing'], '2026-08-06T11:00:00Z')

    expect(duplicate).toEqual(note)
    expect(unknown).toEqual(note)
    expect(duplicate.version).toBe(1)
    expect(unknown.versions).toEqual([])
  })

  test('rejects malformed selected suggestions and invalid selection data', () => {
    const malformed = makeNote({
      aiSuggestions: [{ id: 's-tag', type: 'add_tag', tag: '' }],
    })

    expectVersionError(
      () => applyNoteOrganization(malformed, ['s-tag'], '2026-08-06T11:00:00Z'),
      'INVALID_NOTE_SUGGESTION',
    )
    expectVersionError(
      () => applyNoteOrganization(makeNote(), [undefined], '2026-08-06T11:00:00Z'),
      'INVALID_SUGGESTION_IDS',
    )
    expectVersionError(
      () => applyNoteOrganization(makeNote(), ['s1'], ''),
      'INVALID_CHANGE_METADATA',
    )
  })
})

describe('undoLastNoteVersion', () => {
  test('restores the latest snapshot, increments the version, and records the pre-undo state', () => {
    const edited = applyNotePatch(
      makeNote(),
      { title: 'New title', tags: ['calculus', 'edited'] },
      editOptions,
    )
    const originalEdited = JSON.parse(JSON.stringify(edited))

    const restored = undoLastNoteVersion(edited, '2026-08-06T10:01:00Z')

    expect(restored).toMatchObject({
      title: 'Old title',
      tags: ['calculus'],
      version: 3,
      updatedAt: '2026-08-06T10:01:00Z',
    })
    expect(restored.versions).toHaveLength(2)
    expect(restored.versions[0]).toEqual(edited.versions[0])
    expect(restored.versions[1]).toEqual({
      version: 2,
      title: 'New title',
      folderId: 'f-math',
      folderPath: 'A-Level Math',
      tags: ['calculus', 'edited'],
      content: [{ t: 'p', v: 'Original paragraph' }],
      linkedTopics: ['topic-existing'],
      linkedErrors: ['error-existing'],
      changedAt: '2026-08-06T10:01:00Z',
      reason: 'undo',
    })
    expect(edited).toEqual(originalEdited)
  })

  test('keeps every state traceable across edit, organize, undo, and another undo', () => {
    const edited = applyNotePatch(makeNote(), { title: 'Edited' }, editOptions)
    const organized = applyNoteOrganization({
      ...edited,
      aiSuggestions: [{ id: 's-tag', type: 'add_tag', tag: 'exam-ready' }],
    }, ['s-tag'], '2026-08-06T10:01:00Z')
    const firstUndo = undoLastNoteVersion(organized, '2026-08-06T10:02:00Z')
    const secondUndo = undoLastNoteVersion(firstUndo, '2026-08-06T10:03:00Z')

    expect(organized.version).toBe(3)
    expect(firstUndo).toMatchObject({ version: 4, title: 'Edited', source: 'ai_organized' })
    expect(firstUndo.tags).toEqual(['calculus'])
    expect(secondUndo).toMatchObject({ version: 5, title: 'Edited', source: 'ai_organized' })
    expect(secondUndo.tags).toEqual(['calculus', 'exam-ready', 'organized'])
    expect(secondUndo.versions.map(({ version }) => version)).toEqual([1, 2, 3, 4])
    expect(secondUndo.versions.map(({ reason }) => reason)).toEqual([
      'title_edit',
      'ai_organize',
      'undo',
      'undo',
    ])
  })

  test('fails stably when there is no prior version to restore', () => {
    expectVersionError(
      () => undoLastNoteVersion(makeNote(), '2026-08-06T10:01:00Z'),
      'NO_NOTE_VERSION',
    )
  })

  test('all version operations return JSON-roundtrippable isolated data', () => {
    const note = Object.assign(Object.create(null), makeNote({
      aiSuggestions: [{ id: 's-topic', type: 'link_topic', topicId: 'topic-new' }],
    }))
    const edited = applyNotePatch(note, { title: 'Edited' }, editOptions)
    const organized = applyNoteOrganization(edited, ['s-topic'], '2026-08-06T10:01:00Z')
    const restored = undoLastNoteVersion(organized, '2026-08-06T10:02:00Z')

    expect(JSON.parse(JSON.stringify(edited))).toEqual(edited)
    expect(JSON.parse(JSON.stringify(organized))).toEqual(organized)
    expect(JSON.parse(JSON.stringify(restored))).toEqual(restored)
    expect(Object.getPrototypeOf(restored)).toBe(Object.prototype)

    restored.versions[0].content[0].v = 'history mutation'
    expect(note.content[0].v).toBe('Original paragraph')
    expect(edited.versions[0].content[0].v).toBe('Original paragraph')
  })
})
