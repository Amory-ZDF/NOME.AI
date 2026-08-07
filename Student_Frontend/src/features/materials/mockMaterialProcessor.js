import { MATERIAL_FIXTURES } from '../../data/materialFixtures'
import { MATERIAL_TYPES } from './materialRules'

const RESULT_FIELDS = [
  'suggestedTitle',
  'materialType',
  'examBoard',
  'subject',
  'chapter',
  'folderId',
  'folderPath',
  'questionBlocks',
  'answerBlocks',
  'content',
  'linkedTopics',
  'linkedErrors',
  'confidence',
]

const RESULT_FIELD_SET = new Set(RESULT_FIELDS)
const MATERIAL_TYPE_SET = new Set(MATERIAL_TYPES)
const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

const isRecord = (value) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const isNonemptyString = (value) => typeof value === 'string' && value.trim().length > 0
const isStringArray = (value) => Array.isArray(value) && value.every(isNonemptyString)
const hasExactKeys = (value, keys) => (
  isRecord(value)
  && Object.keys(value).length === keys.length
  && Object.keys(value).every((key) => keys.includes(key))
)

const hasOnlyKeys = (value, keys) => (
  isRecord(value) && Object.keys(value).every((key) => keys.includes(key))
)

const isQuestionBlock = (block) => (
  hasExactKeys(block, ['id', 'label', 'text'])
  && isNonemptyString(block.id)
  && isNonemptyString(block.label)
  && isNonemptyString(block.text)
)

const isAnswerBlock = (block) => (
  hasExactKeys(block, ['id', 'questionId', 'text'])
  && isNonemptyString(block.id)
  && isNonemptyString(block.questionId)
  && isNonemptyString(block.text)
)

const isContentBlock = (block) => (
  hasExactKeys(block, ['t', 'v'])
  && ['h', 'p', 'formula'].includes(block.t)
  && isNonemptyString(block.v)
)

const hasUniqueBlockIds = (blocks) => new Set(blocks.map(({ id }) => id)).size === blocks.length

const isClassificationResult = (result) => {
  if (!hasExactKeys(result, RESULT_FIELDS)) return false
  if (!isNonemptyString(result.suggestedTitle)) return false
  if (!MATERIAL_TYPE_SET.has(result.materialType)) return false
  if (![
    result.examBoard,
    result.subject,
    result.chapter,
    result.folderId,
    result.folderPath,
  ].every(isNonemptyString)) return false
  if (!Array.isArray(result.questionBlocks) || !result.questionBlocks.every(isQuestionBlock)) return false
  if (!Array.isArray(result.answerBlocks) || !result.answerBlocks.every(isAnswerBlock)) return false
  if (!Array.isArray(result.content) || result.content.length === 0 || !result.content.every(isContentBlock)) return false
  if (!isStringArray(result.linkedTopics) || !isStringArray(result.linkedErrors)) return false
  if (!Number.isFinite(result.confidence) || result.confidence < 0 || result.confidence > 1) return false
  if (!hasUniqueBlockIds(result.questionBlocks) || !hasUniqueBlockIds(result.answerBlocks)) return false

  const questionIds = new Set(result.questionBlocks.map(({ id }) => id))
  return result.answerBlocks.every(({ questionId }) => questionIds.has(questionId))
}

export class MaterialProcessorError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'MaterialProcessorError'
    this.code = code
  }
}

const fail = (code, message) => {
  throw new MaterialProcessorError(code, message)
}

const cloneData = (value, invalid, ancestors = new WeakSet()) => {
  if (value === null || value === undefined) return value
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'object') invalid()
  if (ancestors.has(value)) invalid()

  ancestors.add(value)

  let cloned
  if (Array.isArray(value)) {
    cloned = value.map((item) => cloneData(item, invalid, ancestors))
  } else if (isRecord(value)) {
    cloned = {}
    for (const key of Object.keys(value)) {
      if (UNSAFE_OBJECT_KEYS.has(key)) invalid()
      cloned[key] = cloneData(value[key], invalid, ancestors)
    }
  } else {
    invalid()
  }

  ancestors.delete(value)
  return cloned
}

const cloneJob = (job) => cloneData(job, () => {
  fail('INVALID_MATERIAL_JOB', 'Material job contains non-serializable data')
})

const clonePatch = (patch) => cloneData(patch, () => {
  fail('INVALID_CLASSIFICATION_PATCH', 'Classification patch contains invalid fields')
})

const cloneResult = (result) => cloneData(result, () => {
  fail('INVALID_CONFIRMATION_JOB', 'Only classified jobs awaiting confirmation can be confirmed')
})

const validateJobMetadata = (job) => (
  isNonemptyString(job.id)
  && isNonemptyString(job.fileName)
  && MATERIAL_TYPE_SET.has(job.materialType)
)

const PATCH_VALIDATORS = {
  suggestedTitle: isNonemptyString,
  materialType: (value) => MATERIAL_TYPE_SET.has(value),
  examBoard: isNonemptyString,
  subject: isNonemptyString,
  chapter: isNonemptyString,
  folderId: isNonemptyString,
  folderPath: isNonemptyString,
  questionBlocks: (value) => Array.isArray(value) && value.every(isQuestionBlock),
  answerBlocks: (value) => Array.isArray(value) && value.every(isAnswerBlock),
  content: (value) => Array.isArray(value) && value.length > 0 && value.every(isContentBlock),
  linkedTopics: isStringArray,
  linkedErrors: isStringArray,
  confidence: (value) => Number.isFinite(value) && value >= 0 && value <= 1,
}

const isValidPatch = (patch) => (
  hasOnlyKeys(patch, RESULT_FIELDS)
  && Object.entries(patch).every(([field, value]) => PATCH_VALIDATORS[field](value))
)

const deriveNoteSource = (materialType) => {
  if (materialType === 'handwritten_draft') return 'handwritten'
  if (materialType === 'error_photo') return 'photo'
  return 'typed'
}

export function processMaterialJob(job, options) {
  if (!isRecord(job)) {
    fail('INVALID_MATERIAL_JOB', 'Material job must be an object')
  }
  if (!validateJobMetadata(job)) {
    fail('INVALID_MATERIAL_JOB', 'Material job is missing valid upload metadata')
  }
  if (job.status !== 'processing') {
    fail('INVALID_JOB_STATE', 'Only processing material jobs can be processed')
  }

  const fixtureKey = isRecord(options) ? options.fixtureKey : undefined
  const fixture = isNonemptyString(fixtureKey)
    && Object.prototype.hasOwnProperty.call(MATERIAL_FIXTURES, fixtureKey)
    ? MATERIAL_FIXTURES[fixtureKey]
    : undefined
  if (!fixture) {
    fail('UNKNOWN_MATERIAL_FIXTURE', 'Select a known material fixture')
  }

  const processedJob = cloneJob(job)
  return {
    ...processedJob,
    status: 'needs_confirmation',
    progress: 100,
    result: cloneData(fixture, () => {
      fail('UNKNOWN_MATERIAL_FIXTURE', 'Select a known material fixture')
    }),
  }
}

export function confirmMaterialClassification(job, patch) {
  if (
    !isRecord(job)
    || job.status !== 'needs_confirmation'
    || !isNonemptyString(job.id)
    || !isClassificationResult(job.result)
  ) {
    fail(
      'INVALID_CONFIRMATION_JOB',
      'Only classified jobs awaiting confirmation can be confirmed',
    )
  }
  if (!isRecord(patch)) {
    fail('INVALID_CLASSIFICATION_PATCH', 'Classification patch must be an object')
  }
  if (!isValidPatch(patch)) {
    fail('INVALID_CLASSIFICATION_PATCH', 'Classification patch contains invalid fields')
  }

  const confirmedResult = {
    ...cloneResult(job.result),
    ...clonePatch(patch),
  }
  if (!isClassificationResult(confirmedResult)) {
    fail('INVALID_CLASSIFICATION_PATCH', 'Classification patch contains invalid fields')
  }

  const completedJob = cloneJob(job)
  const completedResult = cloneResult(confirmedResult)
  Object.assign(completedJob, {
    materialType: confirmedResult.materialType,
    examBoard: confirmedResult.examBoard,
    subject: confirmedResult.subject,
    chapter: confirmedResult.chapter,
    folderId: confirmedResult.folderId,
    folderPath: confirmedResult.folderPath,
    status: 'completed',
    progress: 100,
    result: completedResult,
  })

  const note = {
    id: `note-${job.id}`,
    title: confirmedResult.suggestedTitle,
    materialType: confirmedResult.materialType,
    examBoard: confirmedResult.examBoard,
    subject: confirmedResult.subject,
    chapter: confirmedResult.chapter,
    folderId: confirmedResult.folderId,
    folderPath: confirmedResult.folderPath,
    tags: [],
    questionBlocks: cloneResult(confirmedResult.questionBlocks),
    answerBlocks: cloneResult(confirmedResult.answerBlocks),
    content: cloneResult(confirmedResult.content),
    linkedTopics: cloneResult(confirmedResult.linkedTopics),
    linkedErrors: cloneResult(confirmedResult.linkedErrors),
    aiSuggestions: [],
    sourceJobId: job.id,
    source: deriveNoteSource(confirmedResult.materialType),
    versions: [],
    version: 1,
  }

  if (isNonemptyString(job.createdAt)) note.createdAt = job.createdAt
  if (isNonemptyString(job.updatedAt)) {
    note.updatedAt = job.updatedAt
  } else if (note.createdAt) {
    note.updatedAt = note.createdAt
  }

  return { job: completedJob, note }
}
