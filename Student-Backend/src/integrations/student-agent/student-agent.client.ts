import type {
  GeneratedQuestion,
  MaterialClassificationResult,
} from '../../contracts/student-contracts.js'
import type {
  ErrorVariantRequest,
  MaterialClassificationRequest,
  QuestionVariantRequest,
} from './student-agent.contracts.js'

export interface AgentCallOptions {
  signal?: AbortSignal
}

export interface StudentAgentClient {
  classifyMaterial(
    request: MaterialClassificationRequest,
    options?: AgentCallOptions,
  ): Promise<MaterialClassificationResult>
  generateQuestionVariant(
    request: QuestionVariantRequest,
    options?: AgentCallOptions,
  ): Promise<GeneratedQuestion>
  generateErrorVariant(
    request: ErrorVariantRequest,
    options?: AgentCallOptions,
  ): Promise<GeneratedQuestion>
}
