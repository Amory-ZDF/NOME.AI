import { sessionSchema } from './src/contracts/student-contracts.js'

const res = await fetch('http://localhost:3001/api/bank/exercise/bank-9702-12-ch01')
const set = (await res.json()).data

const now = Date.now()
const elapsedSeconds = 95
const completedAt = new Date(now).toISOString()

const questions = set.questions.map((q, idx) => {
  // q0: wrong then correct. q1: wrong only. q2: correct first try. q3: wrong only.
  const t = (iso) => new Date(now - (set.questions.length - idx) * 20000).toISOString()
  if (idx === 0) {
    const wrong = { answer: q.options[(q.correctIndex + 1) % q.options.length], normalizedAnswer: 'x', submittedAt: t(1), isCorrect: false }
    const right = { answer: q.options[q.correctIndex], normalizedAnswer: q.options[q.correctIndex].toLowerCase(), submittedAt: t(2), isCorrect: true }
    return { ...q, result: { status: 'correct', attempts: [wrong, right], hintsUsed: 1, solvedAtHintLevel: 1, handwritingUsed: false } }
  }
  if (idx === 1) {
    const wrong = { answer: q.options[(q.correctIndex + 1) % q.options.length], normalizedAnswer: 'x', submittedAt: t(1), isCorrect: false }
    return { ...q, result: { status: 'wrong', attempts: [wrong], hintsUsed: 1, solvedAtHintLevel: null, handwritingUsed: false } }
  }
  if (idx === 2) {
    const right = { answer: q.options[q.correctIndex], normalizedAnswer: q.options[q.correctIndex].toLowerCase(), submittedAt: t(1), isCorrect: true }
    return { ...q, result: { status: 'correct', attempts: [right], hintsUsed: 0, solvedAtHintLevel: 0, handwritingUsed: false } }
  }
  const wrong = { answer: q.options[(q.correctIndex + 1) % q.options.length], normalizedAnswer: 'x', submittedAt: t(1), isCorrect: false }
  return { ...q, result: { status: 'wrong', attempts: [wrong], hintsUsed: 1, solvedAtHintLevel: null, handwritingUsed: false } }
})

const session = {
  sessionId: 'repro-0002',
  taskId: set.taskId ?? null,
  taskTitle: set.title,
  subject: set.subject,
  completedAt,
  timeSpentSeconds: elapsedSeconds,
  timeSpent: Math.round(elapsedSeconds / 60),
  questions,
}

const parsed = sessionSchema.safeParse(session)
console.log(parsed.success ? 'SCHEMA OK' : 'SCHEMA FAIL: ' + JSON.stringify(parsed.error.issues, null, 2))

const post = await fetch('http://localhost:3001/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(session) })
console.log('POST status:', post.status, await post.text())
