import { ALLOWED_FILE_TYPES, MATERIAL_TYPES, MAX_FILE_BYTES } from './materialRules'

const JOB_FIELDS = new Set([
  'id', 'fileName', 'mimeType', 'size', 'materialType',
  'examBoard', 'subject', 'chapter', 'folderId', 'folderPath',
  'createdAt', 'updatedAt', 'progress', 'status', 'result', 'failure',
])
const RESULT_FIELDS = new Set([
  'suggestedTitle', 'materialType', 'examBoard', 'subject', 'chapter',
  'folderId', 'folderPath', 'questionBlocks', 'answerBlocks', 'content',
  'linkedTopics', 'linkedErrors', 'confidence',
])
const MATERIAL_TYPE_SET = new Set(MATERIAL_TYPES)
const STATUS_SET = new Set(['queued', 'processing', 'failed', 'needs_confirmation', 'completed', 'cancelled'])
const RESULT_CONTENT_TYPES = new Set(['h', 'p', 'formula'])
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key)
const isNonemptyString = (value) => typeof value === 'string' && value.trim().length > 0

export class MaterialContractError extends Error {
  constructor(message = 'Invalid upload job') {
    super(message)
    this.name = 'MaterialContractError'
    this.code = 'INVALID_UPLOAD_JOB'
  }
}

const invalid = () => {
  throw new MaterialContractError()
}

const isPlainRecord = (value) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const isDenseArray = (value) => {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false
  for (let index = 0; index < value.length; index += 1) {
    if (!hasOwn(value, index)) return false
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
    if (!descriptor || !hasOwn(descriptor, 'value') || !descriptor.enumerable) return false
  }
  return Reflect.ownKeys(value).every((key) => {
    if (key === 'length') return true
    if (typeof key !== 'string') return false
    const index = Number(key)
    return Number.isInteger(index) && index >= 0 && index < value.length && String(index) === key
  })
}

const cloneStrictJson = (value, ancestors = new WeakSet()) => {
  if (value === null) return null
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'object' || ancestors.has(value)) invalid()

  ancestors.add(value)
  let clone
  if (Array.isArray(value)) {
    if (!isDenseArray(value)) invalid()
    clone = value.map((item) => cloneStrictJson(item, ancestors))
  } else {
    if (!isPlainRecord(value)) invalid()
    clone = {}
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key)) invalid()
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (!descriptor || !hasOwn(descriptor, 'value') || !descriptor.enumerable) invalid()
      clone[key] = cloneStrictJson(descriptor.value, ancestors)
    }
  }
  ancestors.delete(value)
  return clone
}

const hasExactKeys = (value, keys) => isPlainRecord(value)
  && Reflect.ownKeys(value).length === keys.length
  && Reflect.ownKeys(value).every((key) => typeof key === 'string' && keys.includes(key))

const isStringArray = (value) => isDenseArray(value) && value.every(isNonemptyString)
const isQuestionBlock = (block) => hasExactKeys(block, ['id', 'label', 'text'])
  && isNonemptyString(block.id) && isNonemptyString(block.label) && isNonemptyString(block.text)
const isAnswerBlock = (block) => hasExactKeys(block, ['id', 'questionId', 'text'])
  && isNonemptyString(block.id) && isNonemptyString(block.questionId) && isNonemptyString(block.text)
const isResultContent = (block) => hasExactKeys(block, ['t', 'v'])
  && RESULT_CONTENT_TYPES.has(block.t) && isNonemptyString(block.v)

const assertClassificationResult = (result) => {
  if (!isPlainRecord(result)
    || Reflect.ownKeys(result).length !== RESULT_FIELDS.size
    || Reflect.ownKeys(result).some((key) => typeof key !== 'string' || !RESULT_FIELDS.has(key))) invalid()
  if (!isNonemptyString(result.suggestedTitle) || !MATERIAL_TYPE_SET.has(result.materialType)) invalid()
  if (![result.examBoard, result.subject, result.chapter, result.folderId, result.folderPath].every(isNonemptyString)) invalid()
  if (!isDenseArray(result.questionBlocks) || !result.questionBlocks.every(isQuestionBlock)) invalid()
  if (!isDenseArray(result.answerBlocks) || !result.answerBlocks.every(isAnswerBlock)) invalid()
  if (!isDenseArray(result.content) || result.content.length === 0 || !result.content.every(isResultContent)) invalid()
  if (!isStringArray(result.linkedTopics) || !isStringArray(result.linkedErrors)) invalid()
  if (!Number.isFinite(result.confidence) || result.confidence < 0 || result.confidence > 1) invalid()
  const questionIds = new Set(result.questionBlocks.map(({ id }) => id))
  if (questionIds.size !== result.questionBlocks.length) invalid()
  if (new Set(result.answerBlocks.map(({ id }) => id)).size !== result.answerBlocks.length) invalid()
  if (!result.answerBlocks.every(({ questionId }) => questionIds.has(questionId))) invalid()
}

const assertUploadJob = (job, expectedId) => {
  if (!isPlainRecord(job)
    || Reflect.ownKeys(job).some((key) => typeof key !== 'string' || !JOB_FIELDS.has(key))) invalid()
  if (!isNonemptyString(job.id) || (expectedId !== undefined && job.id !== expectedId)) invalid()
  if (!isNonemptyString(job.fileName) || !ALLOWED_FILE_TYPES.has(job.mimeType)) invalid()
  if (!Number.isFinite(job.size) || job.size < 0 || job.size > MAX_FILE_BYTES) invalid()
  if (!MATERIAL_TYPE_SET.has(job.materialType)) invalid()
  if (!isNonemptyString(job.createdAt) || !isNonemptyString(job.updatedAt)) invalid()
  if (!Number.isFinite(job.progress) || job.progress < 0 || job.progress > 100) invalid()
  if (!STATUS_SET.has(job.status)) invalid()
  for (const field of ['examBoard', 'subject', 'chapter', 'folderId', 'folderPath']) {
    if (hasOwn(job, field) && typeof job[field] !== 'string') invalid()
  }

  if (job.status === 'failed') {
    if (!hasExactKeys(job.failure, ['code', 'message'])
      || !isNonemptyString(job.failure.code)
      || !isNonemptyString(job.failure.message)
      || hasOwn(job, 'result')) invalid()
  } else if (hasOwn(job, 'failure')) invalid()

  if (['needs_confirmation', 'completed'].includes(job.status)) {
    if (!hasOwn(job, 'result')) invalid()
    assertClassificationResult(job.result)
  } else if (hasOwn(job, 'result')) invalid()
}

export const sanitizeUploadJob = (job, { expectedId } = {}) => {
  const clone = cloneStrictJson(job)
  assertUploadJob(clone, expectedId)
  return clone
}

export const sanitizeUploadJobs = (jobs) => {
  if (!isDenseArray(jobs)) return []
  const sanitized = []
  for (const job of jobs) {
    try {
      sanitized.push(sanitizeUploadJob(job))
    } catch (error) {
      if (!(error instanceof MaterialContractError)) throw error
    }
  }
  return sanitized
}
