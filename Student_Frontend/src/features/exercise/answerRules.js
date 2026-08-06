const normalize = (answer) => String(answer ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
const numericKeywordPattern = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))(?:%| percent)?$/
const numericTokenPattern = /(?:^|[^a-z0-9_.%+*/^\-])([+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:%| percent)?)(?![a-z0-9_%+*/^\-]|\.(?=[a-z0-9_]))/g

const canonicalNumeric = (value) => {
  const match = value.match(numericKeywordPattern)
  if (!match) return null
  return `${match[1]}${value.endsWith('%') || value.endsWith(' percent') ? '%' : ''}`
}

const matchesKeyword = (normalizedAnswer, keyword) => {
  const normalizedKeyword = normalize(keyword)
  const canonicalKeyword = canonicalNumeric(normalizedKeyword)
  if (canonicalKeyword === null) return normalizedAnswer.includes(normalizedKeyword)
  return [...normalizedAnswer.matchAll(numericTokenPattern)]
    .some((match) => canonicalNumeric(match[1]) === canonicalKeyword)
}

export function validateAttempt(answer) {
  const value = String(answer ?? '').trim()
  if (!value || /^[^a-zA-Z0-9\u4e00-\u9fa5]+$/.test(value)) {
    return { valid: false, code: 'THROWAWAY', message: 'Please answer seriously first — empty or random input cannot be submitted' }
  }
  return { valid: true, value }
}

export function gradeAnswer(question, answer) {
  const normalizedAnswer = normalize(answer)
  if (question.options && Number.isInteger(question.correctIndex)) {
    const letter = ['a', 'b', 'c', 'd'][question.correctIndex]
    const optionText = normalize(question.options[question.correctIndex].replace(/^[A-D][.、\s]*/, ''))
    return { isCorrect: normalizedAnswer === letter || normalizedAnswer === optionText || normalizedAnswer.startsWith(`${letter}.`), normalizedAnswer }
  }
  return { isCorrect: (question.acceptKeywords ?? []).some((keyword) => matchesKeyword(normalizedAnswer, keyword)), normalizedAnswer }
}
