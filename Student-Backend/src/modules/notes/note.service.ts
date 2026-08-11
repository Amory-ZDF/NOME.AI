import { AppError } from '../../common/errors/app-error.js'
import { ZodError } from 'zod'
import type { Note } from '../../contracts/student-contracts.js'
import type { StudentPrisma } from '../../db/client.js'
import { toInputJson } from '../../db/json.js'
import { Prisma } from '../../generated/prisma/client.js'
import { applyNoteOrganization, applyNotePatch, hasLegacyVersionFields, normalizePersistedNote, sanitizeCreatedNote, sanitizeNoteOrganizeCommand, sanitizeNotePatchCommand, sanitizeNoteUndoCommand, undoLastNoteVersion, NoteContractError } from './note-versions.js'

interface StoredNoteRow { id: string; studentId: string; version: number; updatedAtValue: Date; payload: unknown }

function storedDataInvalid(cause: unknown): never {
  throw new AppError('Stored student data is invalid', 500, 'STORED_DATA_INVALID', null, { cause })
}
function noteNotFound(): never { throw new AppError('Note not found', 404, 'NOT_FOUND') }
function duplicateNote(): never { throw new AppError('Note id already exists', 409, 'DUPLICATE_ID') }
function contractError(cause: NoteContractError): never {
  const message = cause.code === 'INVALID_NOTE' ? 'Note contains invalid or non-JSON data'
    : cause.code === 'INVALID_NOTE_PATCH' ? 'Note patch contains invalid fields'
      : cause.code === 'INVALID_NOTE_SUGGESTION' ? 'Selected note suggestion is invalid'
        : 'Change metadata is invalid'
  throw new AppError(message, 400, cause.code)
}
function staleChange(): never { throw new AppError('Change timestamp is stale', 400, 'STALE_CHANGE') }
function noVersion(): never { throw new AppError('There is no previous note version to restore', 409, 'NO_NOTE_VERSION') }
function sameInstant(value: string, stored: Date): boolean {
  return Date.parse(value) === stored.getTime()
}
function isStrictlyLater(value: string, note: Note): boolean {
  const latest = Math.max(
    Date.parse(note.createdAt),
    Date.parse(note.updatedAt),
    ...note.versions.map((snapshot) => Date.parse(snapshot.changedAt)),
  )
  return Date.parse(value) > latest
}
class NoteWriteConflict extends Error {}
const transactionRetryDelaysMs = [25, 50, 100, 200] as const
const mutationRetries = transactionRetryDelaysMs.length + 1
function isTransientTransactionContention(cause: unknown): boolean {
  if (cause instanceof AppError || cause instanceof ZodError) return false
  return cause instanceof Prisma.PrismaClientKnownRequestError && (cause.code === 'P1008' || cause.code === 'P2034')
}
function waitForRetry(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
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
    return this.prisma.$transaction(async (transaction) => {
      const rows = await transaction.note.findMany({
        where: { studentId: this.studentId }, orderBy: [{ updatedAtValue: 'desc' }, { id: 'asc' }],
      })
      return Promise.all(rows.map(async (row) => {
        const note = parseStored(row)
        if (hasLegacyVersionFields(row.payload)) {
          await transaction.note.update({
            where: { studentId_id: { studentId: this.studentId, id: row.id } },
            data: { version: note.version, updatedAtValue: new Date(note.updatedAt), payload: toInputJson(note) },
          })
        }
        return note
      }))
    })
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
    for (let attempt = 0; attempt < mutationRetries; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (transaction) => {
          const row = await transaction.note.findUnique({ where: { studentId_id: { studentId: this.studentId, id: noteId } } })
          if (row === null) noteNotFound()
          const note = parseStored(row)
          const updated = applyNotePatch(note, command)
          if (updated === note) return note
          if (!isStrictlyLater(command.changedAt, note)) staleChange()
          const write = await transaction.note.updateMany({
            where: { studentId: this.studentId, id: noteId, version: note.version },
            data: { version: updated.version, updatedAtValue: new Date(updated.updatedAt), payload: toInputJson(updated) },
          })
          if (write.count !== 1) throw new NoteWriteConflict()
          return updated
        })
      } catch (cause) {
        const retryDelay = transactionRetryDelaysMs[attempt]
        if ((cause instanceof NoteWriteConflict || isTransientTransactionContention(cause)) && retryDelay !== undefined) {
          await waitForRetry(retryDelay)
          continue
        }
        if (cause instanceof NoteWriteConflict) return staleChange()
        throw cause
      }
    }
    return staleChange()
  }

  async organize(noteId: string, rawCommand: unknown): Promise<Note> {
    let command
    try { command = sanitizeNoteOrganizeCommand(rawCommand) } catch (cause) {
      if (cause instanceof NoteContractError) return contractError(cause)
      throw cause
    }
    for (let attempt = 0; attempt < mutationRetries; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (transaction) => {
          const row = await transaction.note.findUnique({ where: { studentId_id: { studentId: this.studentId, id: noteId } } })
          if (row === null) noteNotFound()
          const note = parseStored(row)
          let organized: Note
          try { organized = applyNoteOrganization(note, command) } catch (cause) {
            if (cause instanceof NoteContractError) return contractError(cause)
            throw cause
          }
          if (organized === note) return note
          if (!isStrictlyLater(command.changedAt, note)) staleChange()
          const write = await transaction.note.updateMany({
            where: { studentId: this.studentId, id: noteId, version: note.version },
            data: { version: organized.version, updatedAtValue: new Date(organized.updatedAt), payload: toInputJson(organized) },
          })
          if (write.count !== 1) throw new NoteWriteConflict()
          return organized
        })
      } catch (cause) {
        const retryDelay = transactionRetryDelaysMs[attempt]
        if ((cause instanceof NoteWriteConflict || isTransientTransactionContention(cause)) && retryDelay !== undefined) {
          await waitForRetry(retryDelay)
          continue
        }
        if (cause instanceof NoteWriteConflict) return staleChange()
        throw cause
      }
    }
    return staleChange()
  }

  async undo(noteId: string, rawCommand: unknown): Promise<Note> {
    let changedAt: string
    try {
      const command = sanitizeNoteUndoCommand(rawCommand)
      changedAt = command.changedAt
    } catch (cause) {
      if (cause instanceof NoteContractError) return contractError(cause)
      throw cause
    }
    for (let attempt = 0; attempt < mutationRetries; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (transaction) => {
          const row = await transaction.note.findUnique({ where: { studentId_id: { studentId: this.studentId, id: noteId } } })
          if (row === null) noteNotFound()
          const note = parseStored(row)
          let undone: Note | null
          try { undone = undoLastNoteVersion(note, changedAt) } catch (cause) {
            if (cause instanceof NoteContractError) return contractError(cause)
            throw cause
          }
          if (undone === null) noVersion()
          if (!isStrictlyLater(changedAt, note)) staleChange()
          const write = await transaction.note.updateMany({
            where: { studentId: this.studentId, id: noteId, version: note.version },
            data: { version: undone.version, updatedAtValue: new Date(undone.updatedAt), payload: toInputJson(undone) },
          })
          if (write.count !== 1) throw new NoteWriteConflict()
          return undone
        })
      } catch (cause) {
        const retryDelay = transactionRetryDelaysMs[attempt]
        if ((cause instanceof NoteWriteConflict || isTransientTransactionContention(cause)) && retryDelay !== undefined) {
          await waitForRetry(retryDelay)
          continue
        }
        if (cause instanceof NoteWriteConflict) return staleChange()
        throw cause
      }
    }
    return staleChange()
  }
}
