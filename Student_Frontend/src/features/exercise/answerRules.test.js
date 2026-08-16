import { expect, test } from 'vitest'
import { gradeAnswer, gradeAnswerLocal, validateAttempt } from './answerRules'

test.each(['', '   ', '!!!', '???'])('rejects throwaway answer %j', (answer) => {
  expect(validateAttempt(answer)).toEqual({ valid: false, code: 'THROWAWAY', message: 'Please answer seriously first — empty or random input cannot be submitted' })
})

test('grades a choice by letter or exact option text', () => {
  const question = { options: ['A. 1', 'B. 2'], correctIndex: 1, acceptKeywords: ['B'] }
  expect(gradeAnswer(question, 'b').isCorrect).toBe(true)
  expect(gradeAnswer(question, '2').isCorrect).toBe(true)
})

test('returns null verdict for free-response questions (delegated to the LLM)', () => {
  const question = { acceptKeywords: ['y = 2x'], correctDisplay: 'y = 2x' }
  expect(gradeAnswer(question, 'y = 2x').isCorrect).toBeNull()
  expect(gradeAnswer({ markScheme: 'p = mv' }, 'p = mv').isCorrect).toBeNull()
})

test('grades open work locally with case-insensitive keywords', () => {
  expect(gradeAnswerLocal({ acceptKeywords: ['y = 2x'] }, 'Therefore Y = 2X').isCorrect).toBe(true)
})

test.each([
  ['0', '10'],
  ['0', '100'],
  ['0', '-10'],
  ['0', '0.5'],
  ['2', '20'],
  ['2', '2.5'],
  ['2', '-2'],
  ['2', 'x2'],
  ['2', '2x'],
  ['2', '2/3'],
  ['2', '1/2'],
  ['2', '2+1'],
  ['2', '2-1'],
  ['2', '2*3'],
  ['2', '2^2'],
  ['0', '0/0'],
  ['25%', '125%'],
  ['25 percent', '125 percent'],
])('does not match numeric keyword %j inside a different numeric or identifier token %j', (keyword, answer) => {
  expect(gradeAnswerLocal({ acceptKeywords: [keyword] }, answer).isCorrect).toBe(false)
})

test.each([
  ['0', "f'(2) = 0"],
  ['5', 'maximum 5, minimum -1.63'],
  ['-1.63', 'maximum 5, minimum -1.63'],
  ['2', 'limit = 2'],
  ['2', 'The answer is 2.'],
  ['2', '2.'],
  ['-2', 'x = -2.'],
  ['0%', '0%.'],
  ['25%', '25%'],
  ['25%', 'The answer is 25%.'],
  ['25 percent', 'answer: 25 percent.'],
  ['y = 2x', 'Therefore Y = 2X'],
  ['n=1', 'Base case n=1 is true'],
  ['k+1', 'Assume the result for k+1'],
  ['induction', 'Therefore the claim follows by induction'],
])('matches standalone numeric or normalized phrase keyword %j in %j', (keyword, answer) => {
  expect(gradeAnswerLocal({ acceptKeywords: [keyword] }, answer).isCorrect).toBe(true)
})

test('grades open work safely when no accepted keywords are defined', () => {
  expect(gradeAnswerLocal({}, 'an answer')).toEqual({ isCorrect: false, normalizedAnswer: 'an answer' })
})
