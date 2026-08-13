import { createHash } from 'node:crypto'

function digest(parts: readonly string[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 24)
}

export function questionVariantIds(studentId: string, sourceQuestionId: string) {
  const suffix = digest(['question-variant-v1', studentId, sourceQuestionId])
  return {
    setId: `variant-${suffix}`,
    taskId: `task-variant-${suffix}`,
    questionId: `q-variant-${suffix}`,
  }
}

export function questionVariantOperationKey(studentId: string, sourceQuestionId: string): string {
  const value = createHash('sha256')
    .update(JSON.stringify(['question-variant-v1', studentId, sourceQuestionId]))
    .digest('hex')
  return `question-variant-v1:${value}`
}
