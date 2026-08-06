export const ERROR_TYPES = Object.freeze([
  'knowledge',
  'method',
  'calculation',
  'reading',
  'execution',
  'expression',
  'habit',
])

export const ERROR_TYPE_META = Object.freeze({
  knowledge: Object.freeze({ label: 'Knowledge', color: '#0D9488' }),
  method: Object.freeze({ label: 'Method', color: '#0EA5E9' }),
  calculation: Object.freeze({ label: 'Calculation', color: '#D97706' }),
  reading: Object.freeze({ label: 'Reading comprehension', color: '#78716C' }),
  execution: Object.freeze({ label: 'Execution', color: '#8B5CF6' }),
  expression: Object.freeze({ label: 'Expression', color: '#DC2626' }),
  habit: Object.freeze({ label: 'Habit', color: '#DB2777' }),
})

const validErrorTypes = new Set(ERROR_TYPES)
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const nonemptyString = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null)

const markSchemePhrase = (point) => {
  if (typeof point === 'string') return nonemptyString(point)
  if (!isRecord(point)) return null
  return nonemptyString(point.phrase)
    ?? nonemptyString(point.text)
    ?? nonemptyString(point.content)
}

const requiredMarkSchemePhrases = (question) => {
  if (!isRecord(question)) return []
  const source = Array.isArray(question.requiredMarkSchemePhrases)
    ? question.requiredMarkSchemePhrases
    : question.markSchemePoints
  return Array.isArray(source) ? source.map(markSchemePhrase).filter(Boolean) : []
}

const latestAttempt = (result) => (
  isRecord(result) && Array.isArray(result.attempts)
    ? result.attempts.at(-1)
    : undefined
)

function hasCorrectMethodButMissingMarkSchemePhrases(question, result) {
  if (!isRecord(result)) return false
  const attempt = latestAttempt(result)
  const methodCorrect = result.methodCorrect === true || (isRecord(attempt) && attempt.methodCorrect === true)
  if (!methodCorrect) return false

  if (Array.isArray(result.missingMarkSchemePhrases)) {
    return result.missingMarkSchemePhrases.some((phrase) => nonemptyString(phrase))
  }

  const requiredPhrases = requiredMarkSchemePhrases(question)
  if (requiredPhrases.length === 0 || !isRecord(attempt)) return false
  const answer = nonemptyString(attempt.answer)?.toLocaleLowerCase() ?? ''
  return requiredPhrases.some((phrase) => !answer.includes(phrase.toLocaleLowerCase()))
}

const avoidablePattern = (attempt) => {
  if (!isRecord(attempt)) return null
  return nonemptyString(attempt.avoidablePattern)
    ?? nonemptyString(attempt.mistakePattern)
    ?? nonemptyString(attempt.errorPattern)
}

function hasRepeatedAvoidablePattern(result) {
  if (!isRecord(result) || !Array.isArray(result.attempts) || result.attempts.length < 3) return false
  const recentPatterns = result.attempts.slice(-3).map(avoidablePattern)
  return recentPatterns[0] !== null && recentPatterns.every((pattern) => pattern === recentPatterns[0])
}

export function normalizeErrorType(question, result) {
  const safeQuestion = isRecord(question) ? question : {}
  const safeResult = isRecord(result) ? result : {}

  if (safeResult.status === 'unanswered') return 'execution'
  if (hasRepeatedAvoidablePattern(safeResult)) return 'habit'
  if (hasCorrectMethodButMissingMarkSchemePhrases(safeQuestion, safeResult)) return 'expression'
  return validErrorTypes.has(safeQuestion.errorType) ? safeQuestion.errorType : 'knowledge'
}
