import { normalizeErrorType } from './errorTypes'

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const getResult = (question) => (isRecord(question?.result) ? question.result : {})
const normalizeQuestionStatus = (question) => {
  const status = getResult(question).status
  return status === 'correct' || status === 'wrong' ? status : 'unanswered'
}
const getTopic = (question) => (
  typeof question?.topic === 'string' && question.topic.trim()
    ? question.topic.trim()
    : 'Unspecified'
)
const getHintsUsed = (question) => {
  const value = getResult(question).hintsUsed
  return Number.isFinite(value) && value > 0 ? value : 0
}

const countByErrorType = (questions) => questions.reduce((counts, question) => {
  const type = normalizeErrorType(question, { ...getResult(question), status: normalizeQuestionStatus(question) })
  counts[type] = (counts[type] ?? 0) + 1
  return counts
}, {})

const groupTopicOutcomes = (questions) => {
  const groups = new Map()
  questions.forEach((question) => {
    const topic = getTopic(question)
    const current = groups.get(topic) ?? { topic, correct: 0, wrong: 0 }
    const outcome = normalizeQuestionStatus(question) === 'correct' ? 'correct' : 'wrong'
    groups.set(topic, { ...current, [outcome]: current[outcome] + 1 })
  })
  return [...groups.values()]
}

export function summarizeSession(session) {
  const questions = Array.isArray(session?.questions) ? session.questions : []
  const total = questions.length
  const correct = questions.filter((question) => normalizeQuestionStatus(question) === 'correct')
  const wrongQuestions = questions.filter((question) => normalizeQuestionStatus(question) !== 'correct')
  const totalHints = questions.reduce((sum, question) => sum + getHintsUsed(question), 0)

  return {
    accuracy: total ? Math.round((correct.length / total) * 100) : 0,
    correctCount: correct.length,
    wrongCount: wrongQuestions.filter((question) => normalizeQuestionStatus(question) === 'wrong').length,
    unansweredCount: wrongQuestions.filter((question) => normalizeQuestionStatus(question) === 'unanswered').length,
    hintDependency: {
      totalHints,
      averageHints: total ? totalHints / total : 0,
      independentlySolved: correct.filter((question) => getResult(question).solvedAtHintLevel === 0).length,
    },
    errorDistribution: countByErrorType(wrongQuestions),
    topicOutcomes: groupTopicOutcomes(questions),
    wrongQuestions,
  }
}
