import { AppError } from '../../common/errors/app-error.js'
import {
  materialUploadJobSchema,
  type MaterialUploadJob,
} from '../../contracts/student-contracts.js'
import type { StudentPrisma } from '../../db/client.js'
import { toInputJson } from '../../db/json.js'
import { parseMaterialMetadata } from './material-rules.js'

type Clock = () => Date
type IdFactory = () => string

interface StoredMaterialRow {
  id: string
  studentId: string
  status: string
  createdAtValue: Date
  payload: unknown
}

function duplicate(): never { throw new AppError('Material upload id already exists', 409, 'DUPLICATE_ID') }
function notFound(): never { throw new AppError('Material upload not found', 404, 'NOT_FOUND') }
function completed(): never { throw new AppError('This upload is already completed', 409, 'UPLOAD_ALREADY_COMPLETED') }
function invalidStored(cause: unknown): never {
  throw new AppError('Stored student data is invalid', 500, 'STORED_DATA_INVALID', null, { cause })
}

function isPrismaCode(cause: unknown, ...codes: string[]): boolean {
  return typeof cause === 'object' && cause !== null && 'code' in cause && typeof cause.code === 'string' && codes.includes(cause.code)
}

function transientSqliteError(cause: unknown): boolean {
  if (isPrismaCode(cause, 'P2028', 'P2034')) return true
  return cause instanceof Error && /SQLITE_BUSY|database is locked|transaction/i.test(cause.message)
}

function readClock(clock: Clock): string {
  try {
    const value = clock()
    const milliseconds = Reflect.apply(Date.prototype.getTime, value, []) as number
    if (!Number.isFinite(milliseconds)) throw new TypeError('Invalid clock')
    return new Date(milliseconds).toISOString()
  } catch (cause) {
    throw new AppError('Internal server error', 500, 'INTERNAL_ERROR', null, { cause })
  }
}

function readId(factory: IdFactory): string {
  try {
    return parseMaterialMetadata({ id: factory(), fileName: 'x', mimeType: 'application/pdf', size: 0, materialType: 'class_note' }).id!
  } catch (cause) {
    if (cause instanceof AppError) throw cause
    throw new AppError('Internal server error', 500, 'INTERNAL_ERROR', null, { cause })
  }
}

function parseStored(row: StoredMaterialRow): MaterialUploadJob {
  try {
    const job = materialUploadJobSchema.parse(row.payload)
    if (job.id !== row.id || job.status !== row.status || Date.parse(job.createdAt) !== row.createdAtValue.getTime()) {
      return invalidStored(new Error(`Stored material ${row.id} metadata mismatch`))
    }
    return job
  } catch (cause) {
    if (cause instanceof AppError) throw cause
    return invalidStored(new Error(`Invalid stored material ${row.id}`, { cause }))
  }
}

export class MaterialService {
  constructor(
    private readonly prisma: StudentPrisma,
    private readonly studentId: string,
    private readonly now: Clock,
    private readonly createId: IdFactory,
  ) {}

  private async retry<T>(operation: () => Promise<T>): Promise<T> {
    let last: unknown
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try { return await operation() } catch (cause) {
        last = cause
        if (!transientSqliteError(cause) || attempt === 2) throw cause
      }
    }
    throw last
  }

  async create(input: unknown): Promise<MaterialUploadJob> {
    const metadata = parseMaterialMetadata(input)
    const id = metadata.id ?? readId(this.createId)
    const createdAt = metadata.createdAt ?? readClock(this.now)
    const job = materialUploadJobSchema.parse({ ...metadata, id, createdAt, updatedAt: createdAt, progress: 0, status: 'queued' })
    try {
      return await this.retry(() => this.prisma.$transaction(async (transaction) => {
        const student = await transaction.student.findUnique({ where: { id: this.studentId }, select: { id: true } })
        if (student === null) throw new AppError('Student not found', 404, 'NOT_FOUND')
        await transaction.materialUploadJob.create({
          data: { id: job.id, studentId: this.studentId, status: job.status, createdAtValue: new Date(job.createdAt), payload: toInputJson(job) },
        })
        return job
      }))
    } catch (cause) {
      if (isPrismaCode(cause, 'P2002')) duplicate()
      throw cause
    }
  }

  async cancel(id: string): Promise<MaterialUploadJob> {
    return this.retry(() => this.prisma.$transaction(async (transaction) => {
      const row = await transaction.materialUploadJob.findUnique({ where: { studentId_id: { studentId: this.studentId, id } } })
      if (row === null) notFound()
      const job = parseStored(row)
      if (job.status === 'completed') completed()
      if (job.status === 'cancelled') return job
      const { failure: _failure, result: _result, ...base } = job
      const cancelled = materialUploadJobSchema.parse({ ...base, status: 'cancelled', updatedAt: readClock(this.now) })
      await transaction.materialUploadJob.update({
        where: { studentId_id: { studentId: this.studentId, id } },
        data: { status: cancelled.status, payload: toInputJson(cancelled) },
      })
      return cancelled
    }))
  }
}
