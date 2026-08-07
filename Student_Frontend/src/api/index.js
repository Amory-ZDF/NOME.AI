// ============================================================
// NOME.AI Student — API endpoint layer
//
// Every function below maps 1:1 to a backend REST endpoint
// documented in API_INTERFACE.md (aligned with PRD §8).
// - Real backend: set VITE_API_BASE_URL → requests go over HTTP.
// - Frontend-only stage: unset → served by the local mock adapter.
// Either way the UI/store code stays identical.
// ============================================================

import { ApiError, http, isMockMode } from './client'
import { createSeedState } from '../data/mockData'
import { createMockRepository } from './mockRepository'
import { isTaskAdjustmentEligible } from '../features/tasks/taskRules'
import { createVariantExercise, normalizeVariantContent } from '../features/exercise/variantFactory'
import { VARIANT_TEMPLATES } from '../data/variantTemplates'
import { summarizeSession } from '../features/errors/sessionSummary'
import { mergeErrorCards } from '../features/errors/errorCards'
import {
  applyRedoAttempt,
  attachVerificationVariant,
  canMarkMastered,
  isValidEvidenceTime,
  recordVariantVerification,
  RedoChronologyError,
} from '../features/errors/masteryRules'
import {
  buildUploadJob,
  MaterialRulesError,
} from '../features/materials/materialRules'
import {
  confirmMaterialClassification,
  MaterialProcessorError,
  processMaterialJob,
} from '../features/materials/mockMaterialProcessor'
import {
  applyNoteOrganization,
  applyNotePatch,
  NoteVersionError,
  undoLastNoteVersion,
} from '../features/materials/noteVersions'

const repository = createMockRepository({ seedFactory: createSeedState })
const cancelledUploadIds = new Set()

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const hasId = (value, field = 'id') => typeof value?.[field] === 'string' && value[field].trim().length > 0
const invalid = (message) => new ApiError(message, { status: 400, code: 'INVALID_INPUT' })
const notFound = (entity, id) => new ApiError(`${entity} ${id} was not found`, { status: 404, code: 'NOT_FOUND' })
const duplicate = (entity, id) => new ApiError(`${entity} ${id} already exists`, { status: 409, code: 'DUPLICATE_ID' })
const domainError = (error, status = 400) => new ApiError(error.message, {
  status,
  code: error.code || 'INVALID_INPUT',
  cause: error,
})
const uploadCancelled = () => new ApiError('This upload was cancelled', {
  status: 409,
  code: 'UPLOAD_CANCELLED',
})
const uploadAlreadyCompleted = () => new ApiError('This upload is already completed', {
  status: 409,
  code: 'UPLOAD_ALREADY_COMPLETED',
})
const invalidUploadState = (message = 'The upload job is not in a valid state for this action') => new ApiError(message, {
  status: 409,
  code: 'INVALID_JOB_STATE',
})
const invalidUploadMetadata = (message = 'Upload metadata contains invalid fields') => new ApiError(message, {
  status: 400,
  code: 'INVALID_UPLOAD_METADATA',
})
const masteryGateNotMet = () => new ApiError('Complete the independent variant before marking this mastered', {
  status: 409,
  code: 'MASTERY_GATE_NOT_MET',
})
const hasOwn = (value, field) => Object.prototype.hasOwnProperty.call(value, field)
const isNonemptyString = (value) => typeof value === 'string' && value.trim().length > 0
const isString = (value) => typeof value === 'string'
const isNullableString = (value) => value === null || typeof value === 'string'
const isNullableNonemptyString = (value) => value === null || isNonemptyString(value)
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value)
const isNonnegativeNumber = (value) => isNumber(value) && value >= 0
const isNonnegativeInteger = (value) => Number.isInteger(value) && value >= 0
const isPositiveInteger = (value) => Number.isInteger(value) && value > 0
const isDifficulty = (value) => Number.isInteger(value) && value >= 1 && value <= 5
const isStringArray = (value) => Array.isArray(value) && value.every(isString)
const isNonemptyStringArray = (value) => Array.isArray(value) && value.every(isNonemptyString)
const hasUniqueValues = (value) => new Set(value).size === value.length
const isOneOf = (...values) => (value) => values.includes(value)
const QUESTION_TYPES = Object.freeze(['choice', 'calculation', 'proof', 'fill_blank', 'reading', 'writing'])
const UPLOAD_METADATA_FIELDS = new Set([
  'id',
  'fileName',
  'mimeType',
  'size',
  'materialType',
  'examBoard',
  'subject',
  'chapter',
  'createdAt',
])
const MATERIAL_FIXTURE_BY_TYPE = Object.freeze({
  class_note: 'alevel_handwritten_calculus_note',
  teacher_material: 'alevel_handwritten_calculus_note',
  homework: 'homework',
  past_paper: 'alevel_past_paper',
  mock_paper: 'alevel_past_paper',
  mark_scheme: 'alevel_mark_scheme',
  ielts_passage: 'ielts_reading_passage',
  writing_speaking: 'ielts_reading_passage',
  handwritten_draft: 'alevel_handwritten_calculus_note',
  error_photo: 'error_photo',
})
const MATERIAL_TYPE_LABELS = Object.freeze({
  class_note: 'Class Note',
  teacher_material: 'Teacher Material',
  homework: 'Homework',
  past_paper: 'Past Paper',
  mock_paper: 'Mock Paper',
  mark_scheme: 'Mark Scheme',
  ielts_passage: 'IELTS Passage',
  writing_speaking: 'Writing & Speaking',
  handwritten_draft: 'Handwritten Draft',
  error_photo: 'Error Photo',
})

const isPlainRecord = (value) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const cloneCommand = (value, onInvalid) => {
  try {
    return structuredClone(value)
  } catch {
    throw onInvalid()
  }
}

const normalizeLegacyNote = (note) => {
  const cloned = structuredClone(note)
  const hasVersion = hasOwn(cloned, 'version')
  const hasVersions = hasOwn(cloned, 'versions')
  if (!hasVersion && !hasVersions) return { ...cloned, versions: [], version: 1 }
  return cloned
}

const normalizeMaterialState = (state) => ({
  ...state,
  uploadJobs: Array.isArray(state.uploadJobs) ? state.uploadJobs : [],
  notes: Array.isArray(state.notes) ? state.notes.map(normalizeLegacyNote) : [],
})

const persistMaterialMigration = () => repository.update(normalizeMaterialState)

const createGeneratedId = () => globalThis.crypto?.randomUUID?.()
  || `upload-${Date.now()}-${Math.random().toString(16).slice(2)}`

const snapshotUploadMetadata = (input) => {
  if (!isPlainRecord(input)) throw invalidUploadMetadata('Upload metadata must be an object')
  const ownKeys = Reflect.ownKeys(input)
  if (ownKeys.some((key) => typeof key !== 'string' || !UPLOAD_METADATA_FIELDS.has(key))) {
    throw invalidUploadMetadata()
  }
  for (const key of ownKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key)
    if (!descriptor || !hasOwn(descriptor, 'value') || !descriptor.enumerable) {
      throw invalidUploadMetadata()
    }
  }

  const cloned = cloneCommand(input, invalidUploadMetadata)
  const id = cloned.id === undefined ? createGeneratedId() : cloned.id
  const createdAt = cloned.createdAt === undefined ? new Date().toISOString() : cloned.createdAt
  try {
    return buildUploadJob({
      file: {
        name: cloned.fileName,
        type: cloned.mimeType,
        size: cloned.size,
      },
      materialType: cloned.materialType,
      examBoard: cloned.examBoard,
      subject: cloned.subject,
      chapter: cloned.chapter,
      id,
      createdAt,
    })
  } catch (error) {
    if (error instanceof MaterialRulesError) throw domainError(error)
    throw error
  }
}

const fixtureFromFileName = (fileName) => {
  const normalized = fileName.toLowerCase()
  if (/(^|[_\s.-])ms([_\s.-]|$)|mark[\s_-]*scheme/.test(normalized)) return 'alevel_mark_scheme'
  if (/(^|[_\s.-])qp([_\s.-]|$)|past[\s_-]*paper/.test(normalized)) return 'alevel_past_paper'
  if (/error|mistake|wrong/.test(normalized)) return 'error_photo'
  if (/ielts|reading|passage|writing|speaking/.test(normalized)) return 'ielts_reading_passage'
  if (/homework|assignment/.test(normalized)) return 'homework'
  if (/hand|draft|working|class[\s_-]*note/.test(normalized)) return 'alevel_handwritten_calculus_note'
  return null
}

const selectMaterialFixture = (job) => fixtureFromFileName(job.fileName)
  || MATERIAL_FIXTURE_BY_TYPE[job.materialType]

const adaptProcessedJob = (job, processed) => {
  const selectedFixtureMatchesType = processed.result.materialType === job.materialType
  const fileStem = job.fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim()
  return {
    ...processed,
    materialType: job.materialType,
    result: {
      ...processed.result,
      suggestedTitle: selectedFixtureMatchesType
        ? processed.result.suggestedTitle
        : `${MATERIAL_TYPE_LABELS[job.materialType]} — ${fileStem || 'Study material'}`,
      materialType: job.materialType,
    },
  }
}

const assertUploadId = (id) => {
  if (!isNonemptyString(id)) throw invalid('Upload job id is required')
}

const findUploadJob = (state, id) => state.uploadJobs.find((job) => job.id === id)

const replaceUploadJob = (state, replacement) => ({
  ...state,
  uploadJobs: state.uploadJobs.map((job) => (job.id === replacement.id ? replacement : job)),
})

const throwTerminalUploadState = (job) => {
  if (cancelledUploadIds.has(job.id) || job.status === 'cancelled') throw uploadCancelled()
  if (job.status === 'completed') throw uploadAlreadyCompleted()
}

const toMaterialApiError = (error) => {
  if (error instanceof ApiError) return error
  if (error instanceof MaterialRulesError || error instanceof MaterialProcessorError || error instanceof NoteVersionError) {
    const status = ['NO_NOTE_VERSION', 'INVALID_JOB_STATE'].includes(error.code) ? 409 : 400
    return domainError(error, status)
  }
  return error
}

const toUploadProcessingApiError = (error) => {
  const mapped = toMaterialApiError(error)
  if (mapped instanceof ApiError) return mapped
  return new ApiError('Unable to process the material upload', {
    status: 500,
    code: 'UPLOAD_PROCESSING_FAILED',
    cause: error,
  })
}

const mapMaterialDomainError = (error) => {
  throw toMaterialApiError(error)
}
const isAdjustmentRequest = (request) => isRecord(request)
  && isNonemptyString(request.id)
  && isNonemptyString(request.taskId)
  && isOneOf('time_conflict', 'difficulty', 'health', 'other')(request.reason)
  && isString(request.details)
  && isNonnegativeNumber(request.availableMinutes)
  && isNonemptyString(request.proposedDueAt)
  && isNonemptyString(request.createdAt)
  && request.status === 'submitted'

const assertFields = (value, entity, validators) => {
  if (!isRecord(value)) throw invalid(`${entity} must be an object`)
  Object.entries(validators).forEach(([field, validate]) => {
    if (!validate(value[field])) throw invalid(`${entity}.${field} is invalid`)
  })
}

const isRedoAttempt = (attempt) => isRecord(attempt)
  && isValidEvidenceTime(attempt.attemptedAt)
  && isString(attempt.answer)
  && typeof attempt.isCorrect === 'boolean'
  && isNonnegativeNumber(attempt.timeSpent)

const isOccurrenceRecord = (record) => isRecord(record)
  && isNonemptyString(record.key)
  && isValidEvidenceTime(record.occurredAt)

const isVerificationResult = (result) => isRecord(result)
  && isNonemptyString(result.variantId)
  && typeof result.isCorrect === 'boolean'
  && isValidEvidenceTime(result.verifiedAt)
const isVariantVerification = (result) => result === null || isVerificationResult(result)

const isSessionAttempt = (attempt) => isRecord(attempt)
  && isString(attempt.answer)
  && isNonemptyString(attempt.submittedAt)
  && typeof attempt.isCorrect === 'boolean'

const isNoteBlock = (block) => isRecord(block)
  && isOneOf('p', 'h', 'formula', 'image', 'list', 'highlight')(block.t)
  && isString(block.v)

const isAiSuggestion = (suggestion) => isRecord(suggestion)
  && isOneOf('split_note', 'link_topic', 'related_content', 'add_tag', 'tag', 'append_content', 'content', 'link_error')(suggestion.type)
  && (suggestion.message === undefined || isString(suggestion.message))

const assertTask = (task) => {
  assertFields(task, 'Task', {
    id: isNonemptyString,
    title: isNonemptyString,
    type: isOneOf('teacher_assigned', 'error_review', 'ai_recommended'),
    subject: isNonemptyString,
    estimatedMinutes: isNonnegativeNumber,
    dueAt: isNullableString,
    assignedBy: isNullableString,
    priority: isOneOf('P0', 'P1', 'P2'),
    isOverdue: (value) => typeof value === 'boolean',
    status: isOneOf('pending', 'completed'),
  })
  if (task.lastAccuracy !== undefined && !isNumber(task.lastAccuracy)) throw invalid('Task.lastAccuracy is invalid')
  if (task.exerciseSetId !== undefined && !isNonemptyString(task.exerciseSetId)) throw invalid('Task.exerciseSetId is invalid')
  if (task.topicIds !== undefined && !isStringArray(task.topicIds)) throw invalid('Task.topicIds is invalid')
  if (task.completedAt !== undefined && !isNonemptyString(task.completedAt)) throw invalid('Task.completedAt is invalid')
  if (task.adjustmentStatus !== undefined && task.adjustmentStatus !== 'submitted') throw invalid('Task.adjustmentStatus is invalid')
  if (task.sourceQuestionId !== undefined && !isNonemptyString(task.sourceQuestionId)) throw invalid('Task.sourceQuestionId is invalid')
  if (task.verificationForErrorId !== undefined && !isNonemptyString(task.verificationForErrorId)) {
    throw invalid('Task.verificationForErrorId is invalid')
  }
  if (task.reason !== undefined && !isString(task.reason)) throw invalid('Task.reason is invalid')
  if (task.createdAt !== undefined && !isNonemptyString(task.createdAt)) throw invalid('Task.createdAt is invalid')
}

const noteFieldValidators = Object.freeze({
  title: isNonemptyString,
  folderId: isNullableNonemptyString,
  folderPath: isNullableNonemptyString,
  tags: isStringArray,
  linkedTopics: isStringArray,
  linkedErrors: isStringArray,
  source: isOneOf('typed', 'handwritten', 'photo', 'ai_organized'),
  createdAt: isNonemptyString,
  updatedAt: isNonemptyString,
  content: (value) => Array.isArray(value) && value.every(isNoteBlock),
  aiSuggestions: (value) => Array.isArray(value) && value.every(isAiSuggestion),
})

const assertNote = (note) => {
  assertFields(note, 'Note', { id: isNonemptyString, ...noteFieldValidators })
}

const assertRedoAttempt = (attempt) => {
  if (!isRedoAttempt(attempt)) throw invalid('Redo attempt is invalid')
}

const assertError = (error) => {
  assertFields(error, 'Error', {
    id: isNonemptyString,
    questionId: isNonemptyString,
    subject: isNonemptyString,
    errorType: isOneOf('calculation', 'method', 'knowledge', 'reading', 'execution', 'expression', 'habit'),
    questionSummary: isString,
    questionContent: isString,
    errorDescription: isString,
    relatedTopic: isNonemptyString,
    topicId: isNullableNonemptyString,
    firstOccurredAt: isValidEvidenceTime,
    lastOccurredAt: isValidEvidenceTime,
    repeatCount: isPositiveInteger,
    status: isOneOf('pending_review', 'reviewing', 'verification_due', 'mastered'),
    studentAnswer: isString,
    correctAnswer: isString,
    analysis: isString,
    acceptKeywords: isStringArray,
    redoHistory: (value) => Array.isArray(value) && value.every(isRedoAttempt),
  })
  if (error.options !== undefined && !isStringArray(error.options)) throw invalid('Error.options is invalid')
  if (error.correctIndex !== undefined
    && (!isNonnegativeInteger(error.correctIndex)
      || !Array.isArray(error.options)
      || error.correctIndex >= error.options.length)) throw invalid('Error.correctIndex is invalid')
  if (error.sessionId !== undefined && !isNullableNonemptyString(error.sessionId)) throw invalid('Error.sessionId is invalid')
  if (error.type !== undefined && error.type !== null && !QUESTION_TYPES.includes(error.type)) throw invalid('Error.type is invalid')
  if (error.difficulty !== undefined && error.difficulty !== null && !isDifficulty(error.difficulty)) throw invalid('Error.difficulty is invalid')
  if (error.whereWrong !== undefined && !isString(error.whereWrong)) throw invalid('Error.whereWrong is invalid')
  if (error.whyWrong !== undefined && !isString(error.whyWrong)) throw invalid('Error.whyWrong is invalid')
  if (error.linkedAbility !== undefined && !isString(error.linkedAbility)) throw invalid('Error.linkedAbility is invalid')
  if (error.hintDependency !== undefined && !isNonnegativeInteger(error.hintDependency)) throw invalid('Error.hintDependency is invalid')
  if (error.occurrences !== undefined
    && (!Array.isArray(error.occurrences) || !error.occurrences.every(isValidEvidenceTime))) {
    throw invalid('Error.occurrences is invalid')
  }
  if (error.occurrenceKeys !== undefined
    && (!isNonemptyStringArray(error.occurrenceKeys) || !hasUniqueValues(error.occurrenceKeys))) {
    throw invalid('Error.occurrenceKeys is invalid')
  }
  if (error.occurrenceRecords !== undefined
    && (!Array.isArray(error.occurrenceRecords)
      || !error.occurrenceRecords.every(isOccurrenceRecord)
      || !hasUniqueValues(error.occurrenceRecords.map((record) => record.key)))) {
    throw invalid('Error.occurrenceRecords is invalid')
  }
  if (error.occurrenceKeys !== undefined && error.occurrenceRecords !== undefined
    && (error.occurrenceKeys.length !== error.occurrenceRecords.length
      || error.occurrenceKeys.some((key, index) => error.occurrenceRecords[index].key !== key))) {
    throw invalid('Error occurrence identities are inconsistent')
  }
  if (error.hasIncompleteOccurrenceHistory !== undefined
    && typeof error.hasIncompleteOccurrenceHistory !== 'boolean') {
    throw invalid('Error.hasIncompleteOccurrenceHistory is invalid')
  }
  if (error.verificationVariantId !== undefined && !isNullableNonemptyString(error.verificationVariantId)) {
    throw invalid('Error.verificationVariantId is invalid')
  }
  if (error.variantVerifiedAt !== undefined
    && error.variantVerifiedAt !== null
    && !isValidEvidenceTime(error.variantVerifiedAt)) {
    throw invalid('Error.variantVerifiedAt is invalid')
  }
  if (error.variantVerification !== undefined && !isVariantVerification(error.variantVerification)) {
    throw invalid('Error.variantVerification is invalid')
  }
  if (error.variantVerification) {
    const hasMatchingAudit = error.variantVerification.variantId === error.verificationVariantId
      && (error.variantVerification.isCorrect
        ? error.variantVerifiedAt === error.variantVerification.verifiedAt
        : error.variantVerifiedAt === null)
    if (!hasMatchingAudit) throw invalid('Error verification audit is inconsistent')
  } else if (error.variantVerifiedAt !== undefined && error.variantVerifiedAt !== null) {
    throw invalid('Error verification audit is incomplete')
  }
  for (const field of ['understandingExplanation', 'scoringExplanation', 'errorPattern']) {
    if (error[field] !== undefined && !isString(error[field])) throw invalid(`Error.${field} is invalid`)
  }
  if (error.markSchemePoints !== undefined
    && (!Array.isArray(error.markSchemePoints) || !error.markSchemePoints.every(isRecord))) {
    throw invalid('Error.markSchemePoints is invalid')
  }
  if (error.passageEvidence !== undefined
    && !isString(error.passageEvidence)
    && !isStringArray(error.passageEvidence)) throw invalid('Error.passageEvidence is invalid')
}

const isHint = (hint) => isRecord(hint)
  && isNumber(hint.level)
  && isString(hint.title)
  && isString(hint.content)

const isSessionQuestion = (question) => isRecord(question)
  && isNonemptyString(question.id)
  && isNumber(question.order)
  && isOneOf('choice', 'calculation', 'proof', 'fill_blank', 'reading', 'writing')(question.type)
  && isNonemptyString(question.topic)
  && isNumber(question.difficulty)
  && isString(question.content)
  && (question.options === undefined || isStringArray(question.options))
  && (question.correctIndex === undefined || isNonnegativeNumber(question.correctIndex))
  && isStringArray(question.acceptKeywords)
  && isString(question.correctDisplay)
  && isOneOf('calculation', 'method', 'knowledge', 'reading', 'execution', 'expression', 'habit')(question.errorType)
  && Array.isArray(question.hints)
  && question.hints.every(isHint)
  && isRecord(question.result)
  && isOneOf('correct', 'wrong', 'unanswered')(question.result.status)
  && Array.isArray(question.result.attempts)
  && question.result.attempts.every(isSessionAttempt)
  && isNonnegativeNumber(question.result.hintsUsed)
  && (question.result.solvedAtHintLevel === null || isNonnegativeNumber(question.result.solvedAtHintLevel))
  && (question.result.handwritingUsed === undefined || typeof question.result.handwritingUsed === 'boolean')
  && (question.variantOf === undefined || isNonemptyString(question.variantOf))
  && (question.sourceQuestionId === undefined || isNonemptyString(question.sourceQuestionId))
  && (question.understandingExplanation === undefined || isString(question.understandingExplanation))
  && (question.scoringExplanation === undefined || isString(question.scoringExplanation))
  && (question.passageEvidence === undefined || isString(question.passageEvidence))
  && (question.errorPattern === undefined || isString(question.errorPattern))

const assertSession = (session) => {
  assertFields(session, 'Session', {
    sessionId: isNonemptyString,
    taskId: (value) => value === null || isNonemptyString(value),
    taskTitle: isNonemptyString,
    subject: isNonemptyString,
    completedAt: isNonemptyString,
    timeSpent: isNonnegativeNumber,
    timeSpentSeconds: isNonnegativeNumber,
    questions: (value) => Array.isArray(value) && value.every(isSessionQuestion),
  })
}

const settingsValidators = Object.freeze({
  tone: (value) => isNumber(value) && value >= 0 && value <= 100,
  dailyGoalHours: (value) => isNumber(value) && value >= 1 && value <= 12,
  reminderTask: (value) => typeof value === 'boolean',
  reminderErrorReview: (value) => typeof value === 'boolean',
  reminderStudyTime: (value) => typeof value === 'boolean',
})

const assertSettingsPatch = (patch) => {
  if (!isRecord(patch)) throw invalid('Settings patch must be an object')
  Object.entries(patch).forEach(([field, value]) => {
    const validate = settingsValidators[field]
    if (!validate || !validate(value)) throw invalid(`Settings.${field} is invalid`)
  })
}

const updateTask = async (id, patch) => {
  if (!hasId({ id })) throw invalid('Task id is required')
  const state = await repository.update((current) => {
    if (!current.tasks.some((task) => task.id === id)) throw notFound('Task', id)
    return {
      ...current,
      tasks: current.tasks.map((task) => (task.id === id ? { ...task, ...patch } : task)),
    }
  })
  return state.tasks.find((task) => task.id === id)
}

const updateError = async (id, recipe) => {
  if (!hasId({ id })) throw invalid('Error id is required')
  const state = await repository.update((current) => {
    if (!current.errors.some((error) => error.id === id)) throw notFound('Error', id)
    return {
      ...current,
      errors: current.errors.map((error) => (error.id === id ? recipe(error) : error)),
    }
  })
  return state.errors.find((error) => error.id === id)
}

const assertStableOccurrenceIdentity = (error) => {
  if (!Array.isArray(error.occurrenceKeys) || error.occurrenceKeys.length === 0
    || !Array.isArray(error.occurrenceRecords) || error.occurrenceRecords.length === 0) {
    throw invalid('Error occurrence identities are required')
  }
  if (error.repeatCount !== new Set(error.occurrenceKeys).size) {
    throw invalid('Error.repeatCount must match its stable occurrence identities')
  }
  if (error.hasIncompleteOccurrenceHistory === true) {
    throw invalid('Incoming errors cannot claim incomplete legacy occurrence history')
  }
}

const assertFreshRecurrenceEvidence = (error) => {
  if (error.status !== 'pending_review') {
    throw invalid('Incoming errors must start in pending_review')
  }
  if (error.redoHistory.length !== 0) {
    throw invalid('Incoming errors cannot contain redo history')
  }
  for (const field of ['verificationVariantId', 'variantVerifiedAt', 'variantVerification']) {
    if (error[field] !== undefined && error[field] !== null) {
      throw invalid(`Incoming errors cannot contain ${field}`)
    }
  }
}

const assertErrorBatch = (items, { strictIdentity = false, freshRecurrence = false } = {}) => {
  if (!Array.isArray(items)) throw invalid('Error batch must be an array')
  items.forEach((item) => {
    assertError(item)
    if (strictIdentity) assertStableOccurrenceIdentity(item)
    if (freshRecurrence) assertFreshRecurrenceEvidence(item)
  })
}

const assertNoErrorIdCollisions = (current, items) => {
  const questionById = new Map(current.errors.map((error) => [error.id, error.questionId]))
  items.forEach((item) => {
    const knownQuestionId = questionById.get(item.id)
    if (knownQuestionId !== undefined && knownQuestionId !== item.questionId) {
      throw duplicate('Error', item.id)
    }
    questionById.set(item.id, item.questionId)
  })
}

const persistFreshErrorBatch = async (items) => {
  let trustedItems
  try {
    trustedItems = structuredClone(items)
  } catch {
    throw invalid('Error batch must contain serializable evidence')
  }
  assertErrorBatch(trustedItems, { strictIdentity: true, freshRecurrence: true })
  const state = await repository.update((current) => {
    assertNoErrorIdCollisions(current, trustedItems)
    return { ...current, errors: mergeErrorCards(current.errors, trustedItems) }
  })
  return { errors: state.errors }
}

const findQuestion = (current, questionId) => {
  const allSets = [...Object.values(current.exerciseSets), ...Object.values(current.bankExerciseSets)]
  return allSets.flatMap((exerciseSet) => exerciseSet.questions || [])
    .find((question) => question.id === questionId)
}

const questionFromError = (current, error) => findQuestion(current, error.questionId) ?? {
  id: error.questionId,
  topic: error.relatedTopic,
  content: error.questionContent,
  type: error.type,
  difficulty: error.difficulty,
  options: error.options,
  correctIndex: error.correctIndex,
  acceptKeywords: error.acceptKeywords,
  correctDisplay: error.correctAnswer,
  errorType: error.errorType,
}

const buildVariant = (current, sourceQuestion, verificationForErrorId) => {
  const templates = VARIANT_TEMPLATES[sourceQuestion.topic]
  if (!Array.isArray(templates) || templates.length === 0) {
    throw invalid(`No variant templates are available for ${sourceQuestion.topic}`)
  }
  const distinctTemplateIndexes = templates
    .map((template, index) => ({ index, content: normalizeVariantContent(template?.content) }))
    .filter(({ content }) => content !== normalizeVariantContent(sourceQuestion.content))
    .map(({ index }) => index)
  if (distinctTemplateIndexes.length === 0) {
    throw invalid(`No distinct variant template is available for ${sourceQuestion.topic}`)
  }
  const persistedVariantCount = Object.values(current.exerciseSets)
    .filter((exerciseSet) => exerciseSet.sourceQuestionId === sourceQuestion.id)
    .length
  let ordinal = persistedVariantCount + 1
  let variantId = `variant-${sourceQuestion.id}-${ordinal}`
  let taskId = `task-variant-${sourceQuestion.id}-${ordinal}`
  while (hasOwn(current.exerciseSets, variantId) || current.tasks.some((task) => task.id === taskId)) {
    ordinal += 1
    variantId = `variant-${sourceQuestion.id}-${ordinal}`
    taskId = `task-variant-${sourceQuestion.id}-${ordinal}`
  }

  return createVariantExercise({
    sourceQuestion,
    templateIndex: distinctTemplateIndexes[persistedVariantCount % distinctTemplateIndexes.length],
    variantId,
    taskId,
    createdAt: new Date().toISOString(),
    ...(verificationForErrorId ? { verificationForErrorId } : {}),
  })
}

const invalidNotePatchError = () => domainError(new NoteVersionError(
  'INVALID_NOTE_PATCH',
  'Note patch contains invalid fields',
))

const snapshotNoteCommand = (patch, options = {}) => {
  if (!isPlainRecord(patch) || !isPlainRecord(options)) throw invalidNotePatchError()
  const patchClone = cloneCommand(patch, invalidNotePatchError)
  const optionsClone = cloneCommand(options, invalidNotePatchError)
  const changedAt = optionsClone.changedAt
    ?? patchClone.changedAt
    ?? patchClone.updatedAt
    ?? new Date().toISOString()
  const reason = optionsClone.reason ?? patchClone.reason ?? 'edit'
  Reflect.deleteProperty(patchClone, 'changedAt')
  Reflect.deleteProperty(patchClone, 'updatedAt')
  Reflect.deleteProperty(patchClone, 'reason')
  return { patch: patchClone, metadata: { changedAt, reason } }
}

const updateVersionedNote = async (id, recipe) => {
  if (!hasId({ id })) throw invalid('Note id is required')
  try {
    const state = await repository.update((current) => {
      const materialState = normalizeMaterialState(current)
      const note = materialState.notes.find((item) => item.id === id)
      if (!note) throw notFound('Note', id)
      const replacement = recipe(note)
      return {
        ...materialState,
        notes: materialState.notes.map((item) => (item.id === id ? replacement : item)),
      }
    })
    return state.notes.find((note) => note.id === id)
  } catch (error) {
    mapMaterialDomainError(error)
  }
}

// ---------- Bootstrap (GET /api/student/bootstrap) ----------
export function bootstrap() {
  if (!isMockMode) return http.get('/api/student/bootstrap')
  return persistMaterialMigration()
}

export async function resetMockState() {
  cancelledUploadIds.clear()
  await repository.reset()
  return persistMaterialMigration()
}

// ---------- Tasks ----------
export const completeTask = async (id) => {
  if (!isMockMode) return http.patch(`/api/tasks/${id}`, { status: 'completed' })
  return { task: await updateTask(id, { status: 'completed', completedAt: new Date().toISOString(), isOverdue: false }) }
}
export const reportTaskAdjustment = async (id, request) => {
  if (!isMockMode) return http.post(`/api/tasks/${id}/adjustment-request`, request)
  if (!hasId({ id })) throw invalid('Task id is required')
  if (!isAdjustmentRequest(request)) throw invalid('Task adjustment request is invalid')
  if (request.taskId !== id) throw invalid('Task adjustment request taskId must match the target task')
  const state = await repository.update((current) => {
    const task = current.tasks.find((item) => item.id === id)
    if (!task) throw notFound('Task', id)
    if (!isTaskAdjustmentEligible(task, current.taskAdjustments)) {
      throw invalid('Adjustment requests are only available for a pending teacher-assigned task without a submitted adjustment.')
    }
    if (current.taskAdjustments.some((item) => item.id === request.id)) throw duplicate('Task adjustment request', request.id)
    return {
      ...current,
      taskAdjustments: [...current.taskAdjustments, request],
      tasks: current.tasks.map((task) => (task.id === id
        ? { ...task, adjustmentStatus: 'submitted' }
        : task)),
    }
  })
  return {
    request: state.taskAdjustments.find((item) => item.id === request.id),
    task: state.tasks.find((task) => task.id === id),
  }
}
export const createTask = async (task) => {
  if (!isMockMode) return http.post('/api/tasks', task)
  assertTask(task)
  const state = await repository.update((current) => {
    if (current.tasks.some((item) => item.id === task.id)) throw duplicate('Task', task.id)
    return { ...current, tasks: [...current.tasks, task] }
  })
  return { task: state.tasks.find((item) => item.id === task.id) }
}

// ---------- Exercise sets ----------
export const getExerciseSet = async (taskId) => {
  if (!isNonemptyString(taskId)) throw invalid('Task id is required')
  if (!isMockMode) return http.get(`/api/exercise-sets/${encodeURIComponent(taskId)}`)
  const set = await repository.read((current) => Object.values(current.exerciseSets)
    .find((exerciseSet) => exerciseSet.taskId === taskId))
  if (!set) throw notFound('Exercise set for task', taskId)
  return set
}

export const getBankExerciseSet = async (setId) => {
  if (!isNonemptyString(setId)) throw invalid('Bank exercise set id is required')
  if (!isMockMode) return http.get(`/api/bank/exercise/${encodeURIComponent(setId)}`)
  const set = await repository.read((current) => current.bankExerciseSets[setId])
  if (!set) throw notFound('Bank exercise set', setId)
  return set
}

// ---------- Error book ----------
export const addErrors = async (items) => {
  if (!isMockMode) return http.post('/api/errors/batch', { items })
  return persistFreshErrorBatch(items)
}

export const upsertErrors = async (items) => {
  if (!isMockMode) return http.post('/api/errors/batch', { items })
  return persistFreshErrorBatch(items)
}

export const markErrorMastered = async (id) => {
  if (!isMockMode) return http.patch(`/api/errors/${encodeURIComponent(id)}`, { status: 'mastered' })
  return {
    error: await updateError(id, (error) => {
      if (!canMarkMastered(error)) throw masteryGateNotMet()
      return { ...error, status: 'mastered' }
    }),
  }
}
export const submitRedo = async (id, attempt) => {
  if (!isMockMode) return http.post(`/api/errors/${encodeURIComponent(id)}/redo`, attempt)
  assertRedoAttempt(attempt)
  return {
    error: await updateError(id, (error) => {
      try {
        return applyRedoAttempt(error, attempt)
      } catch (transitionError) {
        if (transitionError instanceof TypeError || transitionError instanceof RedoChronologyError) {
          throw invalid(transitionError.message)
        }
        throw transitionError
      }
    }),
  }
}

export const scheduleErrorVariant = async (id) => {
  if (!isMockMode) return http.post(`/api/errors/${encodeURIComponent(id)}/variant`)
  if (!hasId({ id })) throw invalid('Error id is required')

  let scheduled
  await repository.update((current) => {
    const error = current.errors.find((item) => item.id === id)
    if (!error) throw notFound('Error', id)
    if (error.verificationVariantId) throw invalid('A verification variant is already scheduled')
    if (attachVerificationVariant(error, 'verification-gate-probe').verificationVariantId !== 'verification-gate-probe') {
      throw invalid('Complete a correct redo before scheduling an independent variant')
    }
    const sourceQuestion = questionFromError(current, error)
    const generated = buildVariant(current, sourceQuestion, id)
    const linkedError = attachVerificationVariant(error, generated.exerciseSet.id)
    if (linkedError.verificationVariantId !== generated.exerciseSet.id) {
      throw invalid('Complete a correct redo before scheduling an independent variant')
    }
    scheduled = { ...generated, error: linkedError }
    return {
      ...current,
      exerciseSets: { ...current.exerciseSets, [generated.exerciseSet.id]: generated.exerciseSet },
      tasks: [...current.tasks, generated.task],
      errors: current.errors.map((item) => (item.id === id ? linkedError : item)),
    }
  })
  return structuredClone(scheduled)
}

export const verifyErrorVariant = async (id, result) => {
  if (!isMockMode) return http.post(`/api/errors/${encodeURIComponent(id)}/verification`, result)
  if (!hasId({ id })) throw invalid('Error id is required')
  if (!isVerificationResult(result)) throw invalid('Variant verification is invalid')

  const state = await repository.update((current) => {
    const error = current.errors.find((item) => item.id === id)
    if (!error) throw notFound('Error', id)
    if (result.variantId !== error.verificationVariantId) {
      throw invalid('Verification result does not match the linked variant')
    }
    const exerciseSet = current.exerciseSets[result.variantId]
    const linkedTasks = isNonemptyString(exerciseSet?.taskId)
      ? current.tasks.filter((task) => task.id === exerciseSet.taskId)
      : []
    const linkedTask = linkedTasks[0]
    const hasExactTask = linkedTasks.length === 1
      && linkedTask.id === exerciseSet.taskId
      && linkedTask.exerciseSetId === exerciseSet.id
      && linkedTask.sourceQuestionId === error.questionId
      && linkedTask.verificationForErrorId === id
    const hasExactSet = isNonemptyString(exerciseSet?.id)
      && exerciseSet.id === result.variantId
      && exerciseSet.sourceQuestionId === error.questionId
      && Array.isArray(exerciseSet.questions)
      && exerciseSet.questions.length === 1
      && exerciseSet.questions.every((question) => question.variantOf === error.questionId)
    if (!hasExactTask || !hasExactSet) throw invalid('Verification variant provenance is invalid')

    const verified = recordVariantVerification(error, result)
    const transitionWasApplied = verified.status !== error.status
      || verified.variantVerifiedAt !== error.variantVerifiedAt
      || JSON.stringify(verified.variantVerification ?? null) !== JSON.stringify(error.variantVerification ?? null)
    if (!transitionWasApplied
      || verified.variantVerification?.variantId !== result.variantId
      || verified.variantVerification?.isCorrect !== result.isCorrect
      || verified.variantVerification?.verifiedAt !== result.verifiedAt) {
      throw invalid('Verification result is invalid or out of order')
    }
    return {
      ...current,
      errors: current.errors.map((item) => (item.id === id ? verified : item)),
    }
  })
  return { error: state.errors.find((error) => error.id === id) }
}

// ---------- Notes ----------
export const listNotes = async () => {
  if (!isMockMode) return http.get('/api/notes')
  const state = await persistMaterialMigration()
  return { notes: state.notes }
}

export const createNote = async (note) => {
  if (!isMockMode) return http.post('/api/notes', note)
  assertNote(note)
  const persistedNote = normalizeLegacyNote(note)
  const state = await repository.update((current) => {
    const materialState = normalizeMaterialState(current)
    if (materialState.notes.some((item) => item.id === persistedNote.id)) throw duplicate('Note', persistedNote.id)
    return { ...materialState, notes: [persistedNote, ...materialState.notes] }
  })
  return { note: state.notes.find((item) => item.id === persistedNote.id) }
}
export const updateNote = async (id, patch, options = {}) => {
  if (!isMockMode) return http.patch(`/api/notes/${encodeURIComponent(id)}`, patch)
  const command = snapshotNoteCommand(patch, options)
  return {
    note: await updateVersionedNote(id, (note) => applyNotePatch(note, command.patch, command.metadata)),
  }
}

export const organizeNote = async (id, suggestionIds, options = {}) => {
  if (!isMockMode) return http.post(`/api/notes/${encodeURIComponent(id)}/organize`, { suggestionIds })
  if (!isPlainRecord(options)) throw invalidNotePatchError()
  const selectedIds = cloneCommand(suggestionIds, invalidNotePatchError)
  const changedAt = options.changedAt !== undefined
    ? options.changedAt
    : new Date().toISOString()
  return {
    note: await updateVersionedNote(id, (note) => applyNoteOrganization(note, selectedIds, changedAt)),
  }
}

export const undoNote = async (id, options = {}) => {
  if (!isMockMode) return http.post(`/api/notes/${encodeURIComponent(id)}/undo`)
  if (!isPlainRecord(options)) throw invalidNotePatchError()
  const changedAt = options.changedAt !== undefined
    ? options.changedAt
    : new Date().toISOString()
  return {
    note: await updateVersionedNote(id, (note) => undoLastNoteVersion(note, changedAt)),
  }
}

// ---------- Material uploads ----------
export const createUploadJob = async (metadata, options = {}) => {
  if (!isMockMode) return http.post('/api/material-uploads', metadata)
  if (options?.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
  const job = snapshotUploadMetadata(metadata)
  const state = await repository.update((current) => {
    const materialState = normalizeMaterialState(current)
    if (materialState.uploadJobs.some((item) => item.id === job.id)) throw duplicate('Upload job', job.id)
    return { ...materialState, uploadJobs: [job, ...materialState.uploadJobs] }
  })
  if (options?.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
  return { job: state.uploadJobs.find((item) => item.id === job.id) }
}

export const processUploadJob = async (id, options = {}) => {
  if (!isMockMode) return http.post(`/api/material-uploads/${encodeURIComponent(id)}/process`)
  assertUploadId(id)
  if (options?.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
  if (cancelledUploadIds.has(id)) throw uploadCancelled()

  let processingJob
  try {
    await repository.update((current) => {
      const materialState = normalizeMaterialState(current)
      const job = findUploadJob(materialState, id)
      if (!job) throw notFound('Upload job', id)
      throwTerminalUploadState(job)
      if (!['queued', 'failed'].includes(job.status)) {
        throw invalidUploadState('Only queued or failed uploads can be processed')
      }
      const { failure: _previousFailure, ...retryableJob } = job
      processingJob = {
        ...retryableJob,
        status: 'processing',
        progress: Math.max(1, job.progress || 0),
      }
      return replaceUploadJob(materialState, processingJob)
    })

    if (cancelledUploadIds.has(id)) throw uploadCancelled()
    const fixtureKey = selectMaterialFixture(processingJob)
    const processed = adaptProcessedJob(
      processingJob,
      processMaterialJob(processingJob, { fixtureKey }),
    )
    const state = await repository.update((current) => {
      const materialState = normalizeMaterialState(current)
      const currentJob = findUploadJob(materialState, id)
      if (!currentJob) throw notFound('Upload job', id)
      throwTerminalUploadState(currentJob)
      if (currentJob.status !== 'processing') throw invalidUploadState('Only processing uploads can finish classification')
      return replaceUploadJob(materialState, processed)
    })
    if (options?.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
    return { job: findUploadJob(state, id) }
  } catch (error) {
    if (!processingJob) mapMaterialDomainError(error)
    if (error?.name === 'AbortError') {
      await repository.update((current) => {
        const materialState = normalizeMaterialState(current)
        const currentJob = findUploadJob(materialState, id)
        if (!currentJob || currentJob.status !== 'processing' || cancelledUploadIds.has(id)) return materialState
        return replaceUploadJob(materialState, { ...currentJob, status: 'queued', progress: 0 })
      })
      throw error
    }
    if (error instanceof ApiError && error.code === 'UPLOAD_CANCELLED') throw error

    const apiError = toUploadProcessingApiError(error)
    let failedJob
    await repository.update((current) => {
      const materialState = normalizeMaterialState(current)
      const currentJob = findUploadJob(materialState, id)
      if (!currentJob || currentJob.status !== 'processing' || cancelledUploadIds.has(id)) return materialState
      failedJob = {
        ...currentJob,
        status: 'failed',
        progress: Math.max(1, currentJob.progress || 0),
        failure: {
          code: apiError.code,
          message: apiError.message,
        },
      }
      return replaceUploadJob(materialState, failedJob)
    })
    if (failedJob) apiError.job = structuredClone(failedJob)
    throw apiError
  }
}

export const confirmUploadJob = async (id, patch, options = {}) => {
  if (!isMockMode) return http.post(`/api/material-uploads/${encodeURIComponent(id)}/confirm`, patch)
  assertUploadId(id)
  if (options?.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
  const confirmationPatch = cloneCommand(patch, () => invalid('Classification patch must be serializable'))
  try {
    let confirmed
    await repository.update((current) => {
      const materialState = normalizeMaterialState(current)
      const job = findUploadJob(materialState, id)
      if (!job) throw notFound('Upload job', id)
      throwTerminalUploadState(job)
      if (job.status !== 'needs_confirmation') {
        throw invalidUploadState('Only uploads awaiting confirmation can be confirmed')
      }
      confirmed = confirmMaterialClassification(job, confirmationPatch)
      if (materialState.notes.some((note) => note.id === confirmed.note.id)) {
        throw duplicate('Note', confirmed.note.id)
      }
      return {
        ...replaceUploadJob(materialState, confirmed.job),
        notes: [confirmed.note, ...materialState.notes],
      }
    })
    if (options?.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
    return structuredClone(confirmed)
  } catch (error) {
    mapMaterialDomainError(error)
  }
}

export const cancelUploadJob = async (id, options = {}) => {
  if (!isMockMode) return http.post(`/api/material-uploads/${encodeURIComponent(id)}/cancel`)
  assertUploadId(id)
  if (options?.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
  cancelledUploadIds.add(id)
  try {
    const state = await repository.update((current) => {
      const materialState = normalizeMaterialState(current)
      const job = findUploadJob(materialState, id)
      if (!job) throw notFound('Upload job', id)
      if (job.status === 'completed') throw uploadAlreadyCompleted()
      if (job.status === 'cancelled') return materialState
      const { failure: _failedOnlyDiagnostic, ...cancellableJob } = job
      return replaceUploadJob(materialState, { ...cancellableJob, status: 'cancelled' })
    })
    return { job: findUploadJob(state, id) }
  } catch (error) {
    cancelledUploadIds.delete(id)
    mapMaterialDomainError(error)
  }
}

// ---------- Exercise session ----------
export const submitSession = async (session) => {
  if (!isMockMode) return http.post('/api/sessions', session)
  assertSession(session)
  await repository.update((current) => {
    if (hasOwn(current.sessions, session.sessionId)) throw duplicate('Session', session.sessionId)
    return { ...current, sessions: { ...current.sessions, [session.sessionId]: session } }
  })
  return { sessionId: session.sessionId }
}

export const getSessionSummary = async (sessionId) => {
  if (!isNonemptyString(sessionId)) throw invalid('Session id is required')
  if (!isMockMode) return http.get(`/api/summary/${encodeURIComponent(sessionId)}`)
  const session = await repository.read((current) => current.sessions[sessionId])
  if (!session || session.sessionId !== sessionId) throw notFound('Session', sessionId)
  return summarizeSession(session)
}

export const generateVariant = async (sourceQuestionId) => {
  if (!isNonemptyString(sourceQuestionId)) throw invalid('Source question id is required')
  if (!isMockMode) return http.post(`/api/questions/${encodeURIComponent(sourceQuestionId)}/variant`)

  let generated
  await repository.update((current) => {
    const allSets = [...Object.values(current.exerciseSets), ...Object.values(current.bankExerciseSets)]
    const sourceQuestion = allSets
      .flatMap((exerciseSet) => exerciseSet.questions || [])
      .find((question) => question.id === sourceQuestionId)
    if (!sourceQuestion) throw notFound('Question', sourceQuestionId)

    const templates = VARIANT_TEMPLATES[sourceQuestion.topic]
    if (!Array.isArray(templates) || templates.length === 0) {
      throw invalid(`No variant templates are available for ${sourceQuestion.topic}`)
    }
    const distinctTemplateIndexes = templates
      .map((template, index) => ({ index, content: normalizeVariantContent(template?.content) }))
      .filter(({ content }) => content !== normalizeVariantContent(sourceQuestion.content))
      .map(({ index }) => index)
    if (distinctTemplateIndexes.length === 0) {
      throw invalid(`No distinct variant template is available for ${sourceQuestion.topic}`)
    }
    const persistedVariantCount = Object.values(current.exerciseSets)
      .filter((exerciseSet) => exerciseSet.sourceQuestionId === sourceQuestionId)
      .length
    let ordinal = persistedVariantCount + 1
    let variantId = `variant-${sourceQuestionId}-${ordinal}`
    let taskId = `task-variant-${sourceQuestionId}-${ordinal}`
    while (hasOwn(current.exerciseSets, variantId) || current.tasks.some((task) => task.id === taskId)) {
      ordinal += 1
      variantId = `variant-${sourceQuestionId}-${ordinal}`
      taskId = `task-variant-${sourceQuestionId}-${ordinal}`
    }

    generated = createVariantExercise({
      sourceQuestion,
      templateIndex: distinctTemplateIndexes[persistedVariantCount % distinctTemplateIndexes.length],
      variantId,
      taskId,
      createdAt: new Date().toISOString(),
    })
    return {
      ...current,
      exerciseSets: { ...current.exerciseSets, [generated.exerciseSet.id]: generated.exerciseSet },
      tasks: [...current.tasks, generated.task],
    }
  })
  return structuredClone(generated)
}

// ---------- Settings ----------
export const updateSettings = async (patch) => {
  if (!isMockMode) return http.patch('/api/student/settings', patch)
  assertSettingsPatch(patch)
  const state = await repository.update((current) => ({ ...current, settings: { ...current.settings, ...patch } }))
  return { settings: state.settings }
}
