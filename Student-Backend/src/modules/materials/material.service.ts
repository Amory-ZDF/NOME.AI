import { AppError } from '../../common/errors/app-error.js'
import { cloneSafeJson } from '../../common/json/safe-json.js'
import { createHash } from 'node:crypto'
import { ZodError } from 'zod'
import {
  materialClassificationResultSchema,
  materialUploadJobSchema,
  noteSchema,
  type MaterialClassificationResult,
  type MaterialUploadJob,
  type Note,
} from '../../contracts/student-contracts.js'
import type { StudentPrisma } from '../../db/client.js'
import { toInputJson } from '../../db/json.js'
import {
  containsRawCarrier,
  parseMaterialClassificationPatch,
  parseMaterialMetadata,
} from './material-rules.js'
import { materialJobIdSchema } from '../../contracts/student-contracts.js'
import { Prisma } from '../../generated/prisma/client.js'
import {
  AgentDomainError,
  AgentOutputInvalidError,
  AgentUnavailableError,
} from '../../integrations/student-agent/student-agent.errors.js'
import { materialClassificationRequestSchema } from '../../integrations/student-agent/student-agent.contracts.js'
import type { StudentAgentClient } from '../../integrations/student-agent/student-agent.client.js'

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
function duplicateNote(): never { throw new AppError('Note id already exists', 409, 'DUPLICATE_ID') }
function notFound(): never { throw new AppError('Material upload not found', 404, 'NOT_FOUND') }
function completed(): never { throw new AppError('This upload is already completed', 409, 'UPLOAD_ALREADY_COMPLETED') }
function cancelled(): never { throw new AppError('This upload was cancelled', 409, 'UPLOAD_CANCELLED') }
function invalidState(): never { throw new AppError('Only uploads awaiting confirmation can be confirmed', 409, 'INVALID_JOB_STATE') }
function invalidProcessState(): never { throw new AppError('Only queued or failed uploads can be processed', 409, 'INVALID_JOB_STATE') }
function invalidPatch(): never { throw new AppError('Classification patch contains invalid fields', 400, 'INVALID_CLASSIFICATION_PATCH') }
function invalidStored(cause: unknown): never {
  throw new AppError('Stored student data is invalid', 500, 'STORED_DATA_INVALID', null, { cause })
}

function isPrismaCode(cause: unknown, ...codes: string[]): boolean {
  return typeof cause === 'object' && cause !== null && 'code' in cause && typeof cause.code === 'string' && codes.includes(cause.code)
}

const transactionRetryDelaysMs = [25, 50, 100, 200] as const
const activeMaterialProcesses = new Map<string, Promise<MaterialUploadJob>>()

function isTransientTransactionContention(cause: unknown): boolean {
  if (cause instanceof AppError || cause instanceof ZodError) return false
  return cause instanceof Prisma.PrismaClientKnownRequestError &&
    (cause.code === 'P1008' || cause.code === 'P2034')
}

function waitForRetry(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
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
    const id = factory()
    if (typeof id !== 'string' || !materialJobIdSchema.safeParse(id).success) {
      throw new TypeError('Invalid generated id')
    }
    return id
  } catch (cause) {
    throw new AppError('Internal server error', 500, 'INTERNAL_ERROR', null, { cause })
  }
}

function parseStored(row: StoredMaterialRow): MaterialUploadJob {
  try {
    const job = materialUploadJobSchema.parse(row.payload)
    if (job.id !== row.id || job.status !== row.status || Date.parse(job.createdAt) !== row.createdAtValue.getTime()) {
      return invalidStored(new Error(`Stored material ${row.id} metadata mismatch`))
    }
    if (job.result !== undefined && containsRawCarrier(job.result)) {
      return invalidStored(new Error(`Stored material ${row.id} contains a raw carrier`))
    }
    return job
  } catch (cause) {
    if (cause instanceof AppError) throw cause
    return invalidStored(new Error(`Invalid stored material ${row.id}`, { cause }))
  }
}

function parseConfirmedResult(value: unknown): MaterialClassificationResult {
  try {
    const result = materialClassificationResultSchema.parse(value)
    if (containsRawCarrier(result)) invalidPatch()
    return result
  } catch (cause) {
    if (cause instanceof AppError) throw cause
    return invalidPatch()
  }
}

function deriveNoteSource(materialType: MaterialClassificationResult['materialType']): Note['source'] {
  if (materialType === 'handwritten_draft') return 'handwritten'
  if (materialType === 'error_photo') return 'photo'
  return 'typed'
}

function createConfirmationNote(job: MaterialUploadJob, result: MaterialClassificationResult): Note {
  try {
    return noteSchema.parse({
      id: `note-${job.id}`,
      title: result.suggestedTitle,
      materialType: result.materialType,
      examBoard: result.examBoard,
      subject: result.subject,
      chapter: result.chapter,
      folderId: result.folderId,
      folderPath: result.folderPath,
      tags: [],
      questionBlocks: result.questionBlocks,
      answerBlocks: result.answerBlocks,
      content: result.content,
      linkedTopics: result.linkedTopics,
      linkedErrors: result.linkedErrors,
      aiSuggestions: [],
      sourceJobId: job.id,
      source: deriveNoteSource(result.materialType),
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      version: 1,
      versions: [],
    })
  } catch (cause) {
    return invalidStored(new Error(`Stored material ${job.id} cannot create a valid note`, { cause }))
  }
}

export class MaterialService {
  constructor(
    private readonly prisma: StudentPrisma,
    private readonly studentId: string,
    private readonly now: Clock,
    private readonly createId: IdFactory,
    private readonly agentClient?: StudentAgentClient,
    private readonly processScope = '',
  ) {}

  private async retry<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try { return await operation() } catch (cause) {
        const delay = transactionRetryDelaysMs[attempt]
        if (!isTransientTransactionContention(cause) || delay === undefined) throw cause
        await waitForRetry(delay)
      }
    }
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

  async process(id: string): Promise<MaterialUploadJob> {
    if (this.agentClient === undefined) {
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR')
    }
    const processKey = `${this.processScope}\0${this.studentId}\0${id}`
    const active = activeMaterialProcesses.get(processKey)
    if (active !== undefined) return active

    const operation = this.processOnce(id, this.agentClient)
    activeMaterialProcesses.set(processKey, operation)
    try {
      return await operation
    } finally {
      if (activeMaterialProcesses.get(processKey) === operation) activeMaterialProcesses.delete(processKey)
    }
  }

  private async processOnce(id: string, agentClient: StudentAgentClient): Promise<MaterialUploadJob> {
    const row = await this.prisma.materialUploadJob.findUnique({
      where: { studentId_id: { studentId: this.studentId, id } },
    })
    if (row === null) notFound()
    const snapshot = parseStored(row)
    assertProcessable(snapshot)

    const request = materialClassificationRequestSchema.parse({
      contractVersion: 1,
      operationKey: materialOperationKey(this.studentId, snapshot),
      studentId: this.studentId,
      job: materialAgentMetadata(snapshot),
    })

    let result: MaterialClassificationResult
    try {
      result = materialClassificationResultSchema.parse(
        await agentClient.classifyMaterial(request),
      )
      if (containsRawCarrier(result)) throw new AgentOutputInvalidError()
    } catch (cause) {
      if (cause instanceof AgentDomainError) {
        return this.persistAgentDomainFailure(id, snapshot, cause)
      }
      if (cause instanceof AgentUnavailableError) {
        throw new AppError('Student Agent is unavailable', 503, 'AGENT_UNAVAILABLE')
      }
      if (cause instanceof AgentOutputInvalidError || cause instanceof ZodError) {
        throw new AppError('Student Agent returned invalid output', 502, 'AGENT_OUTPUT_INVALID')
      }
      throw cause
    }

    return this.retry(() => this.prisma.$transaction(async (transaction) => {
      const currentRow = await transaction.materialUploadJob.findUnique({
        where: { studentId_id: { studentId: this.studentId, id } },
      })
      if (currentRow === null) notFound()
      const current = parseStored(currentRow)
      assertProcessable(current)
      if (!sameProcessGeneration(snapshot, current)) invalidProcessState()
      const { failure: _failure, ...base } = current
      const next = materialUploadJobSchema.parse({
        ...base,
        status: 'needs_confirmation',
        progress: 100,
        result,
        updatedAt: readClock(this.now),
      })
      await transaction.materialUploadJob.update({
        where: { studentId_id: { studentId: this.studentId, id } },
        data: { status: next.status, payload: toInputJson(next) },
      })
      return next
    }))
  }

  private async persistAgentDomainFailure(
    id: string,
    snapshot: MaterialUploadJob,
    failure: AgentDomainError,
  ): Promise<never> {
    const failed = await this.retry(() => this.prisma.$transaction(async (transaction) => {
      const currentRow = await transaction.materialUploadJob.findUnique({
        where: { studentId_id: { studentId: this.studentId, id } },
      })
      if (currentRow === null) notFound()
      const current = parseStored(currentRow)
      assertProcessable(current)
      if (!sameProcessGeneration(snapshot, current)) invalidProcessState()
      const { failure: _oldFailure, result: _oldResult, ...base } = current
      const next = materialUploadJobSchema.parse({
        ...base,
        status: 'failed',
        progress: Math.max(1, current.progress),
        updatedAt: readClock(this.now),
        failure: { code: failure.safeCode, message: failure.safeMessage },
      })
      await transaction.materialUploadJob.update({
        where: { studentId_id: { studentId: this.studentId, id } },
        data: { status: next.status, payload: toInputJson(next) },
      })
      return next
    }))
    throw new AppError(
      failure.safeMessage,
      400,
      failure.safeCode,
      cloneSafeJson({ job: failed }),
    )
  }

  async confirm(id: string, rawPatch: unknown): Promise<{ job: MaterialUploadJob; note: Note }> {
    const patch = parseMaterialClassificationPatch(rawPatch)
    try {
      return await this.retry(() => this.prisma.$transaction(async (transaction) => {
        const row = await transaction.materialUploadJob.findUnique({
          where: { studentId_id: { studentId: this.studentId, id } },
        })
        if (row === null) notFound()
        const job = parseStored(row)
        if (job.status === 'cancelled') cancelled()
        if (job.status === 'completed') completed()
        if (job.status !== 'needs_confirmation') invalidState()
        if (job.result === undefined) invalidStored(new Error(`Stored material ${id} is missing result`))

        const result = parseConfirmedResult({ ...job.result, ...patch })
        const note = createConfirmationNote(job, result)
        const confirmed = materialUploadJobSchema.parse({
          ...job,
          materialType: result.materialType,
          examBoard: result.examBoard,
          subject: result.subject,
          chapter: result.chapter,
          folderId: result.folderId,
          folderPath: result.folderPath,
          status: 'completed',
          progress: 100,
          result,
        })
        const existingNote = await transaction.note.findUnique({
          where: { studentId_id: { studentId: this.studentId, id: note.id } }, select: { id: true },
        })
        if (existingNote !== null) duplicateNote()
        await transaction.note.create({
          data: {
            id: note.id, studentId: this.studentId, version: note.version,
            updatedAtValue: new Date(note.updatedAt), payload: toInputJson(note),
          },
        })
        await transaction.materialUploadJob.update({
          where: { studentId_id: { studentId: this.studentId, id } },
          data: { status: confirmed.status, payload: toInputJson(confirmed) },
        })
        return { job: confirmed, note }
      }))
    } catch (cause) {
      if (isPrismaCode(cause, 'P2002')) duplicateNote()
      throw cause
    }
  }
}

function assertProcessable(job: MaterialUploadJob): void {
  if (job.status === 'cancelled') cancelled()
  if (job.status === 'completed') completed()
  if (job.status !== 'queued' && job.status !== 'failed') invalidProcessState()
}

function sameProcessGeneration(left: MaterialUploadJob, right: MaterialUploadJob): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function materialOperationKey(studentId: string, job: MaterialUploadJob): string {
  const digest = createHash('sha256')
    .update(studentId)
    .update('\0')
    .update(job.id)
    .update('\0')
    .update(job.updatedAt)
    .digest('hex')
  return `material-process-v1:${digest}`
}

function materialAgentMetadata(job: MaterialUploadJob) {
  return {
    id: job.id,
    fileName: job.fileName,
    mimeType: job.mimeType,
    size: job.size,
    materialType: job.materialType,
    ...(job.examBoard === undefined ? {} : { examBoard: job.examBoard }),
    ...(job.subject === undefined ? {} : { subject: job.subject }),
    ...(job.chapter === undefined ? {} : { chapter: job.chapter }),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  }
}
