import { expect, test } from 'vitest'
import { gradeAnswer, validateAttempt } from './answerRules'

test.each(['', '   ', '!!!', '???'])('rejects throwaway answer %j', (answer) => {
  expect(validateAttempt(answer)).toEqual({ valid: false, code: 'THROWAWAY', message: 'Please answer seriously first — empty or random input cannot be submitted' })
})

test('grades a choice by letter or exact option text', () => {
  const question = { options: ['A. 1', 'B. 2'], correctIndex: 1, acceptKeywords: ['B'] }
  expect(gradeAnswer(question, 'b').isCorrect).toBe(true)
  expect(gradeAnswer(question, '2').isCorrect).toBe(true)
})

test('grades open work with case-insensitive keywords', () => {
  expect(gradeAnswer({ acceptKeywords: ['y = 2x'] }, 'Therefore Y = 2X').isCorrect).toBe(true)
})

test('grades open work safely when no accepted keywords are defined', () => {
  expect(gradeAnswer({}, 'an answer')).toEqual({ isCorrect: false, normalizedAnswer: 'an answer' })
})
