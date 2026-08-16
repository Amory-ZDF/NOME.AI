import { describe, expect, test } from 'vitest'
import { bankExerciseSets, exerciseSets } from '../../data/mockData'
import { createVariantExercise } from './variantFactory'
import { isCompleteVariantResult, isRenderableExerciseSet } from './exerciseContracts'

const VARIANT_SOURCE_ID = 'source-q1'

const completeHints = () => [1, 2, 3, 4, 5].map((level) => ({
  level,
  title: `Hint ${level}`,
  content: `Hint content ${level}`,
}))

const validQuestion = (overrides = {}) => ({
  id: 'q1',
  order: 1,
  type: 'reading',
  topic: 'Reading Skills - Detail Location',
  difficulty: 2,
  content: 'Read the passage and identify the detail.',
  acceptKeywords: ['detail'],
  correctDisplay: 'detail',
  errorType: 'reading',
  hints: completeHints(),
  ...overrides,
})

const validSet = (overrides = {}) => ({
  id: 'set-1',
  taskId: 'task-1',
  title: 'Practice set',
  subject: 'IELTS Reading',
  questions: [validQuestion()],
  ...overrides,
})

const validVariant = (overrides = {}) => {
  const exerciseSet = {
    ...validSet({
      id: 'variant-1',
      taskId: 'variant-task-1',
      sourceQuestionId: VARIANT_SOURCE_ID,
      questions: [validQuestion({ id: 'variant-q1', variantOf: VARIANT_SOURCE_ID })],
    }),
    ...overrides.exerciseSet,
  }
  const task = overrides.task === null
    ? null
    : {
        id: 'variant-task-1',
        title: 'Transfer practice',
        exerciseSetId: exerciseSet.id,
        type: 'ai_recommended',
        status: 'pending',
        sourceQuestionId: VARIANT_SOURCE_ID,
        ...overrides.task,
      }
  return {
    exerciseSet,
    task,
  }
}

describe('isRenderableExerciseSet', () => {
  test('accepts every seeded task and bank exercise set', () => {
    for (const [id, exerciseSet] of Object.entries({ ...exerciseSets, ...bankExerciseSets })) {
      expect(isRenderableExerciseSet(exerciseSet), id).toBe(true)
    }
  })

  test('accepts reading questions and finite order and difficulty values', () => {
    expect(isRenderableExerciseSet(validSet())).toBe(true)
  })

  test.each([
    ['a null question', [null]],
    ['an unsupported type', [validQuestion({ type: 'video' })]],
    ['a non-finite order', [validQuestion({ order: Number.NaN })]],
    ['a non-finite difficulty', [validQuestion({ difficulty: Number.POSITIVE_INFINITY })]],
    ['an empty correct display', [validQuestion({ correctDisplay: ' ' })]],
    ['duplicate question IDs', [validQuestion(), validQuestion({ order: 2 })]],
    ['missing hints', [validQuestion({ hints: null })]],
    ['incomplete hints', [validQuestion({ hints: completeHints().slice(0, 4) })]],
    ['duplicate hint levels', [validQuestion({ hints: completeHints().map((hint, index) => (index === 4 ? { ...hint, level: 4 } : hint)) })]],
    ['an empty hint title', [validQuestion({ hints: completeHints().map((hint, index) => (index === 0 ? { ...hint, title: '' } : hint)) })]],
    ['an empty hint body', [validQuestion({ hints: completeHints().map((hint, index) => (index === 0 ? { ...hint, content: ' ' } : hint)) })]],
    ['a free-response question with no gradeable standard', [validQuestion({ correctDisplay: ' ', markScheme: undefined })]],
  ])('rejects a set with %s', (_, questions) => {
    expect(isRenderableExerciseSet(validSet({ questions }))).toBe(false)
  })

  test.each([
    ['missing options', validQuestion({ type: 'choice', options: null, correctIndex: 0 })],
    ['an empty option', validQuestion({ type: 'choice', options: ['A', ' '], correctIndex: 0 })],
    ['a missing correct index', validQuestion({ type: 'choice', options: ['A', 'B'], correctIndex: null })],
    ['an out-of-range correct index', validQuestion({ type: 'choice', options: ['A', 'B'], correctIndex: 2 })],
  ])('rejects a choice question with %s', (_, question) => {
    expect(isRenderableExerciseSet(validSet({ questions: [question] }))).toBe(false)
  })
})

describe('isCompleteVariantResult', () => {
  test('accepts Task 3 factory results for every seeded source topic', () => {
    const sourceQuestions = [...Object.values(exerciseSets), ...Object.values(bankExerciseSets)]
      .flatMap((exerciseSet) => exerciseSet.questions)
    const sourcesByTopic = new Map(sourceQuestions.map((question) => [question.topic, question]))

    for (const [index, sourceQuestion] of [...sourcesByTopic.values()].entries()) {
      const result = createVariantExercise({
        sourceQuestion,
        templateIndex: 0,
        variantId: `variant-${index}`,
        taskId: `variant-task-${index}`,
        createdAt: '2026-08-06T10:00:00.000Z',
      })
      expect(isCompleteVariantResult(result, sourceQuestion.id), sourceQuestion.topic).toBe(true)
    }
  })

  test('requires an expected source question ID', () => {
    expect(isCompleteVariantResult(validVariant())).toBe(false)
  })

  test.each([
    ['a missing exercise-set ID', { exerciseSet: { id: '' } }],
    ['a missing task', { task: null }],
    ['a missing task ID', { task: { id: '' } }],
    ['a missing task title', { task: { title: ' ' } }],
    ['a mismatched exercise-set ID', { task: { exerciseSetId: 'another-set' } }],
    ['the wrong task type', { task: { type: 'teacher_assigned' } }],
    ['the wrong task status', { task: { status: 'completed' } }],
    ['an invalid exercise set', { exerciseSet: { questions: [] } }],
    ['a missing set source', { exerciseSet: { sourceQuestionId: undefined } }],
    ['the wrong set source', { exerciseSet: { sourceQuestionId: 'another-source' } }],
    ['a missing task source', { task: { sourceQuestionId: undefined } }],
    ['the wrong task source', { task: { sourceQuestionId: 'another-source' } }],
    ['a missing question source', { exerciseSet: { questions: [validQuestion({ id: 'variant-q1', variantOf: undefined })] } }],
    ['the wrong question source', { exerciseSet: { questions: [validQuestion({ id: 'variant-q1', variantOf: 'another-source' })] } }],
  ])('rejects a generated result with %s', (_, overrides) => {
    expect(isCompleteVariantResult(validVariant(overrides), VARIANT_SOURCE_ID)).toBe(false)
  })
})
