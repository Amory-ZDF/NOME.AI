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

export class AgentDomainError extends Error {
  constructor(
    readonly safeCode: string,
    readonly safeMessage: string,
  ) {
    super(safeMessage)
    this.name = 'AgentDomainError'
  }
}
