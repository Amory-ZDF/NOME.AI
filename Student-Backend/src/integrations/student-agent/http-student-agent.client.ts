import { z } from 'zod'

import type { MaterialClassificationResult, GeneratedQuestion } from '../../contracts/student-contracts.js'
import {
  errorVariantRequestSchema,
  generatedQuestionDataSchema,
  materialClassificationDataSchema,
  materialClassificationRequestSchema,
  questionVariantRequestSchema,
  type ErrorVariantRequest,
  type MaterialClassificationRequest,
  type QuestionVariantRequest,
} from './student-agent.contracts.js'
import type { AgentCallOptions, StudentAgentClient } from './student-agent.client.js'
import {
  AgentDomainError,
  AgentOutputInvalidError,
  AgentUnavailableError,
} from './student-agent.errors.js'

const MAX_RESPONSE_BYTES = 1024 * 1024
const INTERNAL_PATHS = {
  material: '/internal/v1/student-agent/material-classifications',
  question: '/internal/v1/student-agent/question-variants',
  error: '/internal/v1/student-agent/error-variants',
} as const

const safeDomainCodeSchema = z.enum([
  'UNSUPPORTED_MATERIAL',
  'CONTENT_UNAVAILABLE',
  'CLASSIFICATION_FAILED',
  'GENERATION_REJECTED',
])
const safeDomainMessages: Record<z.infer<typeof safeDomainCodeSchema>, string> = {
  UNSUPPORTED_MATERIAL: 'Material is not supported',
  CONTENT_UNAVAILABLE: 'Material content is unavailable',
  CLASSIFICATION_FAILED: 'Material classification failed',
  GENERATION_REJECTED: 'Question generation was rejected',
}
const domainErrorEnvelopeSchema = z.strictObject({
  code: safeDomainCodeSchema,
  message: z.string().min(1).max(200),
  data: z.null(),
})

interface HttpStudentAgentClientOptions {
  baseUrl: string
  timeoutMs: number
}

function invalidOutput(): never {
  throw new AgentOutputInvalidError()
}

async function readBoundedJson(
  response: Response,
  signals: { caller: AbortSignal | undefined; timeout: AbortSignal },
): Promise<unknown> {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  const mediaType = contentType.split(';', 1)[0]?.trim()
  if (mediaType !== 'application/json') invalidOutput()
  if (response.body === null) invalidOutput()

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel()
        invalidOutput()
      }
      chunks.push(value)
    }
  } catch (cause) {
    if (cause instanceof AgentOutputInvalidError) throw cause
    if (isAborted(signals.caller)) throw callerAbortReason(signals.caller)
    if (signals.timeout.aborted) throw new AgentUnavailableError()
    invalidOutput()
  }

  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch {
    invalidOutput()
  }
}

function successEnvelopeSchema<Data extends z.ZodType>(data: Data) {
  return z.strictObject({
    code: z.literal(0),
    message: z.literal('ok'),
    data,
  })
}

function callerAbortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The operation was aborted', 'AbortError')
}

function isAborted(signal: AbortSignal | undefined): signal is AbortSignal {
  return signal?.aborted === true
}

export function createHttpStudentAgentClient({
  baseUrl,
  timeoutMs,
}: HttpStudentAgentClientOptions): StudentAgentClient {
  const origin = new URL(baseUrl).origin

  async function post<Request, Data>(
    path: string,
    request: Request,
    dataSchema: z.ZodType<Data>,
    options: AgentCallOptions = {},
  ): Promise<Data> {
    const callerSignal = options.signal
    if (isAborted(callerSignal)) throw callerAbortReason(callerSignal)

    const timeoutSignal = AbortSignal.timeout(timeoutMs)
    const signal = callerSignal === undefined
      ? timeoutSignal
      : AbortSignal.any([callerSignal, timeoutSignal])
    let response: Response
    try {
      response = await fetch(new URL(path, origin), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-NOME-Agent-Contract-Version': '1',
        },
        body: JSON.stringify(request),
        redirect: 'error',
        signal,
      })
    } catch {
      if (isAborted(callerSignal)) throw callerAbortReason(callerSignal)
      throw new AgentUnavailableError()
    }

    if (response.status >= 500) {
      try {
        await response.body?.cancel()
      } catch {
        // The public failure remains generic even if transport cleanup fails.
      }
      throw new AgentUnavailableError()
    }
    const payload = await readBoundedJson(response, {
      caller: callerSignal,
      timeout: timeoutSignal,
    })

    if (!response.ok) {
      const domain = domainErrorEnvelopeSchema.safeParse(payload)
      if (!domain.success) invalidOutput()
      throw new AgentDomainError(domain.data.code, safeDomainMessages[domain.data.code])
    }

    const envelope = successEnvelopeSchema(dataSchema).safeParse(payload)
    if (!envelope.success) invalidOutput()
    return envelope.data.data
  }

  return {
    async classifyMaterial(request: MaterialClassificationRequest, options?: AgentCallOptions): Promise<MaterialClassificationResult> {
      const parsed = materialClassificationRequestSchema.parse(request)
      const data = await post(INTERNAL_PATHS.material, parsed, materialClassificationDataSchema, options)
      return data.classification
    },
    async generateQuestionVariant(request: QuestionVariantRequest, options?: AgentCallOptions): Promise<GeneratedQuestion> {
      const parsed = questionVariantRequestSchema.parse(request)
      const data = await post(INTERNAL_PATHS.question, parsed, generatedQuestionDataSchema, options)
      return data.question
    },
    async generateErrorVariant(request: ErrorVariantRequest, options?: AgentCallOptions): Promise<GeneratedQuestion> {
      const parsed = errorVariantRequestSchema.parse(request)
      const data = await post(INTERNAL_PATHS.error, parsed, generatedQuestionDataSchema, options)
      return data.question
    },
  }
}
