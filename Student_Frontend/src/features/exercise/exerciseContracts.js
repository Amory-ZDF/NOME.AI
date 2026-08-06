const supportedQuestionTypes = new Set(['choice', 'fill_blank', 'calculation', 'proof', 'reading', 'writing'])
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const isNonemptyString = (value) => typeof value === 'string' && value.trim().length > 0

function hasCompleteHints(hints) {
  if (!Array.isArray(hints) || hints.length !== 5) return false
  const levels = new Set()
  for (const hint of hints) {
    if (!isRecord(hint)
      || !Number.isInteger(hint.level)
      || hint.level < 1
      || hint.level > 5
      || !isNonemptyString(hint.title)
      || !isNonemptyString(hint.content)) return false
    levels.add(hint.level)
  }
  return levels.size === 5 && [1, 2, 3, 4, 5].every((level) => levels.has(level))
}

function isRenderableQuestion(question) {
  if (!isRecord(question)
    || !isNonemptyString(question.id)
    || !isNonemptyString(question.content)
    || !isNonemptyString(question.topic)
    || !Number.isFinite(question.order)
    || !Number.isFinite(question.difficulty)
    || !supportedQuestionTypes.has(question.type)
    || !isNonemptyString(question.correctDisplay)
    || !isNonemptyString(question.errorType)
    || !Array.isArray(question.acceptKeywords)
    || question.acceptKeywords.length === 0
    || !question.acceptKeywords.every(isNonemptyString)
    || !hasCompleteHints(question.hints)) return false

  if (question.type !== 'choice') return true
  return Array.isArray(question.options)
    && question.options.length > 0
    && question.options.every(isNonemptyString)
    && Number.isInteger(question.correctIndex)
    && question.correctIndex >= 0
    && question.correctIndex < question.options.length
}

export function isRenderableExerciseSet(exerciseSet) {
  if (!isRecord(exerciseSet)
    || !isNonemptyString(exerciseSet.title)
    || !isNonemptyString(exerciseSet.subject)
    || !Array.isArray(exerciseSet.questions)
    || exerciseSet.questions.length === 0
    || !exerciseSet.questions.every(isRenderableQuestion)) return false
  const ids = exerciseSet.questions.map((question) => question.id)
  return new Set(ids).size === ids.length
}

export function isCompleteVariantResult(result) {
  if (!isRecord(result) || !isRenderableExerciseSet(result.exerciseSet) || !isRecord(result.task)) return false
  const { exerciseSet, task } = result
  return isNonemptyString(exerciseSet.id)
    && isNonemptyString(task.id)
    && isNonemptyString(task.title)
    && task.exerciseSetId === exerciseSet.id
    && task.type === 'ai_recommended'
    && task.status === 'pending'
}
