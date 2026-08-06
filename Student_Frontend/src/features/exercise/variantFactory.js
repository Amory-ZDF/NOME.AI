import { VARIANT_TEMPLATES } from '../../data/variantTemplates'

const isNonemptyString = (value) => typeof value === 'string' && value.trim().length > 0
export const normalizeVariantContent = (value) => typeof value === 'string'
  ? value.trim().toLowerCase().replace(/\s+/g, ' ')
  : ''

const requireNonemptyString = (value, field) => {
  if (!isNonemptyString(value)) throw new TypeError(`${field} must be a non-empty string`)
}

const validateSourceQuestion = (sourceQuestion) => {
  if (sourceQuestion === null || typeof sourceQuestion !== 'object' || Array.isArray(sourceQuestion)) {
    throw new TypeError('sourceQuestion must be an object')
  }
  requireNonemptyString(sourceQuestion.id, 'sourceQuestion.id')
  requireNonemptyString(sourceQuestion.topic, 'sourceQuestion.topic')
  requireNonemptyString(sourceQuestion.content, 'sourceQuestion.content')
}

const subjectForTopic = (topic) => topic.startsWith('Reading Skills -')
  ? 'IELTS Reading'
  : 'A-Level Math'

export function createVariantExercise(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('factory input must be an object')
  }

  const {
    sourceQuestion,
    templateIndex,
    variantId,
    taskId,
    createdAt,
    verificationForErrorId,
  } = input
  validateSourceQuestion(sourceQuestion)
  if (!Number.isInteger(templateIndex) || templateIndex < 0) {
    throw new TypeError('templateIndex must be a non-negative integer')
  }
  requireNonemptyString(variantId, 'variantId')
  requireNonemptyString(taskId, 'taskId')
  requireNonemptyString(createdAt, 'createdAt')
  if (verificationForErrorId !== undefined) {
    requireNonemptyString(verificationForErrorId, 'verificationForErrorId')
  }

  const topic = sourceQuestion.topic
  const templates = VARIANT_TEMPLATES[topic]
  if (!templates) throw new RangeError(`No variant templates available for topic "${topic}"`)

  const selectedTemplate = templates[templateIndex]
  if (!selectedTemplate) {
    throw new RangeError(`No variant template for topic "${topic}" at index ${templateIndex}`)
  }
  if (normalizeVariantContent(selectedTemplate.content) === normalizeVariantContent(sourceQuestion.content)) {
    throw new RangeError('Selected variant template must differ from the source question')
  }

  const title = `Transfer Practice · ${topic}`
  const subject = subjectForTopic(topic)
  const question = {
    ...structuredClone(selectedTemplate),
    id: `${variantId}-q1`,
    order: 1,
    variantOf: sourceQuestion.id,
  }

  return {
    exerciseSet: {
      id: variantId,
      taskId,
      title,
      subject,
      createdAt,
      sourceQuestionId: sourceQuestion.id,
      questions: [question],
    },
    task: {
      id: taskId,
      title,
      type: 'ai_recommended',
      subject,
      estimatedMinutes: 15,
      dueAt: null,
      assignedBy: null,
      priority: 'P2',
      isOverdue: false,
      status: 'pending',
      exerciseSetId: variantId,
      reason: 'Independent transfer check',
      sourceQuestionId: sourceQuestion.id,
      createdAt,
      ...(verificationForErrorId === undefined
        ? {}
        : { verificationForErrorId: verificationForErrorId.trim() }),
    },
  }
}
