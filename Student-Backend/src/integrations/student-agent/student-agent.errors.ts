export class AgentUnavailableError extends Error {
  readonly code = 'AGENT_UNAVAILABLE'

  constructor() {
    super('Student Agent is unavailable')
    this.name = 'AgentUnavailableError'
  }
}

export class AgentOutputInvalidError extends Error {
  readonly code = 'AGENT_OUTPUT_INVALID'

  constructor() {
    super('Student Agent returned invalid output')
    this.name = 'AgentOutputInvalidError'
  }
}

export const AGENT_DOMAIN_MESSAGES = {
  UNSUPPORTED_MATERIAL: 'Material is not supported',
  CONTENT_UNAVAILABLE: 'Material content is unavailable',
  CLASSIFICATION_FAILED: 'Material classification failed',
  GENERATION_REJECTED: 'Question generation was rejected',
} as const

export type AgentDomainCode = keyof typeof AGENT_DOMAIN_MESSAGES

export class AgentDomainError extends Error {
  readonly safeMessage: string

  constructor(
    readonly safeCode: AgentDomainCode,
  ) {
    const safeMessage: string | undefined = AGENT_DOMAIN_MESSAGES[safeCode]
    if (safeMessage === undefined) throw new TypeError('Invalid Agent domain code')
    super(safeMessage)
    this.name = 'AgentDomainError'
    this.safeMessage = safeMessage
  }
}
