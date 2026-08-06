import { describe, expect, test } from 'vitest'
import { VARIANT_TEMPLATES } from '../../data/variantTemplates'
import { gradeAnswer } from './answerRules'
import { createVariantExercise } from './variantFactory'

const REQUIRED_TOPICS = [
  'Calculus - Differentiation',
  'Calculus - Extrema',
  "Limits - L'Hôpital's Rule",
  'Trigonometry - Double Angle',
  'Calculus - Tangent Line',
  'Reading Skills - Detail Location',
  'Reading Skills - True/False',
  'Reading Skills - Gap Fill',
  'Algebra - Mathematical Induction',
  'Algebra - Factorisation',
]

const sourceQuestion = {
  id: 'q-source',
  topic: 'Calculus - Differentiation',
  type: 'calculation',
  difficulty: 3,
  content: 'Differentiate the original source expression.',
  acceptKeywords: ['original'],
  hints: [{ level: 1, title: 'Original', content: 'Original hint' }],
}

const factoryArgs = {
  sourceQuestion,
  templateIndex: 0,
  variantId: 'variant-1',
  taskId: 'task-v1',
  createdAt: '2026-08-06T10:00:00Z',
}

describe('VARIANT_TEMPLATES', () => {
  test('covers every seeded answerable topic with two complete gradable templates', () => {
    expect(Object.keys(VARIANT_TEMPLATES).sort()).toEqual([...REQUIRED_TOPICS].sort())

    for (const topic of REQUIRED_TOPICS) {
      const templates = VARIANT_TEMPLATES[topic]
      expect(templates, topic).toHaveLength(2)

      for (const template of templates) {
        expect(template).toMatchObject({
          topic,
          type: expect.any(String),
          content: expect.any(String),
          acceptKeywords: expect.any(Array),
          correctDisplay: expect.any(String),
          errorType: expect.any(String),
        })
        expect(template).toHaveProperty('options')
        expect(template).toHaveProperty('correctIndex')
        expect(template.content.trim().length).toBeGreaterThan(0)
        expect(template.acceptKeywords.length).toBeGreaterThan(0)
        expect(template.correctDisplay.trim().length).toBeGreaterThan(0)
        expect(template.hints).toEqual([
          expect.objectContaining({ level: 1, title: expect.any(String), content: expect.any(String) }),
          expect.objectContaining({ level: 2, title: expect.any(String), content: expect.any(String) }),
          expect.objectContaining({ level: 3, title: expect.any(String), content: expect.any(String) }),
          expect.objectContaining({ level: 4, title: expect.any(String), content: expect.any(String) }),
          expect.objectContaining({ level: 5, title: expect.any(String), content: expect.any(String) }),
        ])
        expect(template.hints.every((hint) => hint.title.trim() && hint.content.trim())).toBe(true)

        const acceptedAnswer = Number.isInteger(template.correctIndex)
          ? ['a', 'b', 'c', 'd'][template.correctIndex]
          : template.acceptKeywords[0]
        expect(gradeAnswer(template, acceptedAnswer).isCorrect, `${topic}: ${template.content}`).toBe(true)
      }
    }
  })
})

describe('createVariantExercise', () => {
  test.each([[null], [[]], ['invalid']])('rejects invalid factory input %j with a stable error', (input) => {
    expect(() => createVariantExercise(input)).toThrow(new TypeError('factory input must be an object'))
  })

  test('creates a different one-question transfer set and a due-date-free P2 task', () => {
    const { exerciseSet, task } = createVariantExercise(factoryArgs)

    expect(exerciseSet).toMatchObject({
      id: 'variant-1',
      taskId: 'task-v1',
      title: 'Transfer Practice · Calculus - Differentiation',
      subject: 'A-Level Math',
      createdAt: '2026-08-06T10:00:00Z',
      sourceQuestionId: 'q-source',
    })
    expect(exerciseSet.questions).toHaveLength(1)
    expect(exerciseSet.questions[0]).toMatchObject({
      id: 'variant-1-q1',
      order: 1,
      variantOf: 'q-source',
      topic: 'Calculus - Differentiation',
    })
    expect(exerciseSet.questions[0].content).not.toBe(sourceQuestion.content)
    expect(task).toEqual({
      id: 'task-v1',
      title: 'Transfer Practice · Calculus - Differentiation',
      type: 'ai_recommended',
      subject: 'A-Level Math',
      estimatedMinutes: 15,
      dueAt: null,
      assignedBy: null,
      priority: 'P2',
      isOverdue: false,
      status: 'pending',
      exerciseSetId: 'variant-1',
      reason: 'Independent transfer check',
      sourceQuestionId: 'q-source',
      createdAt: '2026-08-06T10:00:00Z',
    })
  })

  test('adds error-book verification metadata only to a variant task created from that context', () => {
    const input = { ...factoryArgs, verificationForErrorId: '  error-1  ' }
    const before = structuredClone(input)

    const fromErrorBook = createVariantExercise(input)
    const ordinaryVariant = createVariantExercise(factoryArgs)

    expect(fromErrorBook.task.verificationForErrorId).toBe('error-1')
    expect(fromErrorBook.exerciseSet).not.toHaveProperty('verificationForErrorId')
    expect(ordinaryVariant.task).not.toHaveProperty('verificationForErrorId')
    expect(ordinaryVariant.exerciseSet).not.toHaveProperty('verificationForErrorId')
    expect(input).toEqual(before)
  })

  test('is deterministic without mutating the source question', () => {
    const before = structuredClone(sourceQuestion)

    expect(createVariantExercise(factoryArgs)).toEqual(createVariantExercise(factoryArgs))
    expect(sourceQuestion).toEqual(before)
  })

  test('deep-clones template data and each returned result', () => {
    const first = createVariantExercise(factoryArgs)
    const second = createVariantExercise(factoryArgs)
    const originalContent = VARIANT_TEMPLATES[sourceQuestion.topic][0].hints[0].content

    first.exerciseSet.questions[0].hints[0].content = 'mutated hint'
    first.exerciseSet.questions[0].acceptKeywords.push('mutated answer')

    expect(second.exerciseSet.questions[0].hints[0].content).toBe(originalContent)
    expect(second.exerciseSet.questions[0].acceptKeywords).not.toContain('mutated answer')
    expect(VARIANT_TEMPLATES[sourceQuestion.topic][0].hints[0].content).toBe(originalContent)
    expect(VARIANT_TEMPLATES[sourceQuestion.topic][0].acceptKeywords).not.toContain('mutated answer')
  })

  test('uses the explicitly requested template index', () => {
    const first = createVariantExercise(factoryArgs)
    const second = createVariantExercise({ ...factoryArgs, templateIndex: 1 })

    expect(first.exerciseSet.questions[0].content).toBe(VARIANT_TEMPLATES[sourceQuestion.topic][0].content)
    expect(second.exerciseSet.questions[0].content).toBe(VARIANT_TEMPLATES[sourceQuestion.topic][1].content)
    expect(second.exerciseSet.questions[0].content).not.toBe(first.exerciseSet.questions[0].content)
  })

  test('rejects a selected template whose normalized content matches the source question', () => {
    const selectedContent = VARIANT_TEMPLATES[sourceQuestion.topic][0].content
    const sameContentSource = {
      ...sourceQuestion,
      content: `  \n${selectedContent.toUpperCase()}\t `,
    }

    expect(() => createVariantExercise({ ...factoryArgs, sourceQuestion: sameContentSource }))
      .toThrow(new RangeError('Selected variant template must differ from the source question'))
  })

  test('derives IELTS Reading as the subject for reading variants', () => {
    const readingSource = {
      ...sourceQuestion,
      id: 'reading-source',
      topic: 'Reading Skills - Gap Fill',
      content: 'Original reading prompt.',
    }
    const { exerciseSet, task } = createVariantExercise({ ...factoryArgs, sourceQuestion: readingSource })

    expect(exerciseSet.subject).toBe('IELTS Reading')
    expect(task.subject).toBe('IELTS Reading')
  })

  test.each([
    [null, 'sourceQuestion must be an object'],
    [{ topic: 'Calculus - Differentiation', content: 'Prompt' }, 'sourceQuestion.id must be a non-empty string'],
    [{ id: 'q', content: 'Prompt' }, 'sourceQuestion.topic must be a non-empty string'],
    [{ id: 'q', topic: 'Calculus - Differentiation' }, 'sourceQuestion.content must be a non-empty string'],
  ])('rejects an invalid source question %#', (invalidSource, message) => {
    expect(() => createVariantExercise({ ...factoryArgs, sourceQuestion: invalidSource })).toThrow(new TypeError(message))
  })

  test('rejects an unknown topic', () => {
    const unknownSource = { ...sourceQuestion, topic: 'Unknown Topic' }
    expect(() => createVariantExercise({ ...factoryArgs, sourceQuestion: unknownSource }))
      .toThrow(new RangeError('No variant templates available for topic "Unknown Topic"'))
  })

  test.each([-1, 0.5, '0'])('rejects invalid template index %j', (templateIndex) => {
    expect(() => createVariantExercise({ ...factoryArgs, templateIndex }))
      .toThrow(new TypeError('templateIndex must be a non-negative integer'))
  })

  test('rejects a template index outside the topic template range', () => {
    expect(() => createVariantExercise({ ...factoryArgs, templateIndex: 2 }))
      .toThrow(new RangeError('No variant template for topic "Calculus - Differentiation" at index 2'))
  })

  test.each([
    ['variantId', ''],
    ['taskId', '   '],
    ['createdAt', null],
  ])('rejects invalid %s', (field, value) => {
    expect(() => createVariantExercise({ ...factoryArgs, [field]: value }))
      .toThrow(new TypeError(`${field} must be a non-empty string`))
  })

  test.each([null, '', '   ', 42, {}])('rejects invalid optional verificationForErrorId %j', (verificationForErrorId) => {
    expect(() => createVariantExercise({ ...factoryArgs, verificationForErrorId }))
      .toThrow(new TypeError('verificationForErrorId must be a non-empty string'))
  })
})
