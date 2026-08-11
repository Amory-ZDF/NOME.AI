import { AppError } from '../../common/errors/app-error.js'
import type { Note } from '../../contracts/student-contracts.js'
import type { StudentPrisma } from '../../db/client.js'
import { toInputJson } from '../../db/json.js'
import { applyNotePatch, normalizePersistedNote, sanitizeCreatedNote, sanitizeNotePatchCommand, NoteContractError } from './note-versions.js'

interface StoredNoteRow { id: string; studentId: string; version: number; updatedAtValue: Date; payload: unknown }

function storedDataInvalid(cause: unknown): never {
  throw new AppError('Stored student data is invalid', 500, 'STORED_DATA_INVALID', null, { cause })
}
function noteNotFound(): never { throw new AppError('Note not found', 404, 'NOT_FOUND') }
function duplicateNote(): never { throw new AppError('Note id already exists', 409, 'DUPLICATE_ID') }
function contractError(cause: NoteContractError): never {
  const message = cause.code === 'INVALID_NOTE' ? 'Note contains invalid or non-JSON data'
    : cause.code === 'INVALID_NOTE_PATCH' ? 'Note patch contains invalid fields' : 'Change metadata is invalid'
  throw new AppError(message, 400, cause.code)
}
function sameInstant(value: string, stored: Date): boolean {
  return Date.parse(value) === stored.getTime()
}
function parseStored(row: StoredNoteRow): Note {
  try {
    const note = normalizePersistedNote(row.payload)
    if (note.id !== row.id || note.version !== row.version || !sameInstant(note.updatedAt, row.updatedAtValue)) {
      return storedDataInvalid(new Error(`Stored note ${row.id} metadata mismatch`))
    }
    return note
  } catch (cause) {
    if (cause instanceof AppError) throw cause
    return storedDataInvalid(new Error(`Invalid stored note ${row.id}`, { cause }))
  }
}
function uniqueViolation(cause: unknown): boolean {
  return typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'P2002'
}

export class NoteService {
  constructor(private readonly prisma: StudentPrisma, private readonly studentId: string) {}

  async list(): Promise<Note[]> {
    const rows = await this.prisma.note.findMany({
      where: { studentId: this.studentId }, orderBy: [{ updatedAtValue: 'desc' }, { id: 'asc' }],
    })
    return rows.map(parseStored)
  }

  async create(rawNote: unknown): Promise<Note> {
    let note: Note
    try { note = sanitizeCreatedNote(rawNote) } catch (cause) {
      if (cause instanceof NoteContractError) return contractError(cause)
      throw cause
    }
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const student = await transaction.student.findUnique({ where: { id: this.studentId }, select: { id: true } })
        if (student === null) throw new AppError('Student not found', 404, 'NOT_FOUND')
        const existing = await transaction.note.findUnique({ where: { studentId_id: { studentId: this.studentId, id: note.id } }, select: { id: true } })
        if (existing !== null) duplicateNote()
        await transaction.note.create({ data: { id: note.id, studentId: this.studentId, version: note.version, updatedAtValue: new Date(note.updatedAt), payload: toInputJson(note) } })
        return note
      })
    } catch (cause) {
      if (uniqueViolation(cause)) duplicateNote()
      throw cause
    }
  }

  async update(noteId: string, rawCommand: unknown): Promise<Note> {
    let command
    try { command = sanitizeNotePatchCommand(rawCommand) } catch (cause) {
      if (cause instanceof NoteContractError) return contractError(cause)
      throw cause
    }
    return this.prisma.$transaction(async (transaction) => {
      const row = await transaction.note.findUnique({ where: { studentId_id: { studentId: this.studentId, id: noteId } } })
      if (row === null) noteNotFound()
      const note = parseStored(row)
      const updated = applyNotePatch(note, command)
      if (updated === note) return note
      await transaction.note.update({
        where: { studentId_id: { studentId: this.studentId, id: noteId } },
        data: { version: updated.version, updatedAtValue: new Date(updated.updatedAt), payload: toInputJson(updated) },
      })
      return updated
    })
  }
}
