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

const repository = createMockRepository({ seedFactory: createSeedState })

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const hasId = (value, field = 'id') => typeof value?.[field] === 'string' && value[field].trim().length > 0
const invalid = (message) => new ApiError(message, { status: 400, code: 'INVALID_INPUT' })
const notFound = (entity, id) => new ApiError(`${entity} ${id} was not found`, { status: 404, code: 'NOT_FOUND' })
const duplicate = (entity, id) => new ApiError(`${entity} ${id} already exists`, { status: 409, code: 'DUPLICATE_ID' })
const hasOwn = (value, field) => Object.prototype.hasOwnProperty.call(value, field)
const isNonemptyString = (value) => typeof value === 'string' && value.trim().length > 0
const isString = (value) => typeof value === 'string'
const isNullableString = (value) => value === null || typeof value === 'string'
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value)
const isNonnegativeNumber = (value) => isNumber(value) && value >= 0
const isStringArray = (value) => Array.isArray(value) && value.every(isString)
const isOneOf = (...values) => (value) => values.includes(value)
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
  && isNonemptyString(attempt.attemptedAt)
  && isString(attempt.answer)
  && typeof attempt.isCorrect === 'boolean'
  && isNonnegativeNumber(attempt.timeSpent)

const isSessionAttempt = (attempt) => isRecord(attempt)
  && isString(attempt.answer)
  && isNonemptyString(attempt.submittedAt)
  && typeof attempt.isCorrect === 'boolean'

const isNoteBlock = (block) => isRecord(block)
  && isOneOf('p', 'h', 'formula')(block.t)
  && isString(block.v)

const isAiSuggestion = (suggestion) => isRecord(suggestion)
  && isOneOf('split_note', 'link_topic', 'related_content')(suggestion.type)
  && isString(suggestion.message)

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
}

const noteFieldValidators = Object.freeze({
  title: isNonemptyString,
  folderId: isNonemptyString,
  folderPath: isNonemptyString,
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

const assertNotePatch = (patch) => {
  if (!isRecord(patch)) throw invalid('Note patch must be an object')
  if (hasOwn(patch, 'id')) throw invalid('Note.id is immutable')
  Object.entries(patch).forEach(([field, value]) => {
    const validate = noteFieldValidators[field]
    if (!validate || !validate(value)) throw invalid(`Note.${field} is invalid`)
  })
}

const assertRedoAttempt = (attempt) => {
  if (!isRedoAttempt(attempt)) throw invalid('Redo attempt is invalid')
}

const assertError = (error) => {
  assertFields(error, 'Error', {
    id: isNonemptyString,
    questionId: isNonemptyString,
    subject: isNonemptyString,
    errorType: isOneOf('calculation', 'method', 'knowledge', 'reading', 'execution'),
    questionSummary: isString,
    questionContent: isString,
    errorDescription: isString,
    relatedTopic: isNonemptyString,
    topicId: isNonemptyString,
    firstOccurredAt: isNonemptyString,
    lastOccurredAt: isNonemptyString,
    repeatCount: isNonnegativeNumber,
    status: isOneOf('pending_review', 'reviewing', 'mastered'),
    studentAnswer: isString,
    correctAnswer: isString,
    analysis: isString,
    acceptKeywords: isStringArray,
    redoHistory: (value) => Array.isArray(value) && value.every(isRedoAttempt),
  })
  if (error.options !== undefined && !isStringArray(error.options)) throw invalid('Error.options is invalid')
  if (error.correctIndex !== undefined && !isNonnegativeNumber(error.correctIndex)) throw invalid('Error.correctIndex is invalid')
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
  && isOneOf('calculation', 'method', 'knowledge', 'reading', 'execution')(question.errorType)
  && Array.isArray(question.hints)
  && question.hints.every(isHint)
  && isRecord(question.result)
  && isOneOf('correct', 'wrong', 'unanswered')(question.result.status)
  && Array.isArray(question.result.attempts)
  && question.result.attempts.every(isSessionAttempt)
  && isNonnegativeNumber(question.result.hintsUsed)
  && (question.result.solvedAtHintLevel === null || isNonnegativeNumber(question.result.solvedAtHintLevel))

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

const updateStoredNote = async (id, patch) => {
  if (!hasId({ id })) throw invalid('Note id is required')
  assertNotePatch(patch)
  const state = await repository.update((current) => {
    if (!current.notes.some((note) => note.id === id)) throw notFound('Note', id)
    return {
      ...current,
      notes: current.notes.map((note) => (note.id === id ? { ...note, ...patch } : note)),
    }
  })
  return state.notes.find((note) => note.id === id)
}

// ---------- Bootstrap (GET /api/student/bootstrap) ----------
export function bootstrap() {
  if (!isMockMode) return http.get('/api/student/bootstrap')
  return repository.bootstrap()
}

export function resetMockState() {
  return repository.reset()
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

// ---------- Error book ----------
export const addErrors = async (items) => {
  if (!isMockMode) return http.post('/api/errors/batch', { items })
  if (!Array.isArray(items)) throw invalid('Error batch must be an array')
  items.forEach((item) => {
    assertError(item)
  })
  let added = []
  await repository.update((current) => {
    const entityIds = new Set(current.errors.map((error) => error.id))
    items.forEach((item) => {
      if (entityIds.has(item.id)) throw duplicate('Error', item.id)
      entityIds.add(item.id)
    })
    const questionIds = new Set(current.errors.map((error) => error.questionId))
    added = items.filter((item) => {
      if (questionIds.has(item.questionId)) return false
      questionIds.add(item.questionId)
      return true
    })
    return { ...current, errors: [...added, ...current.errors] }
  })
  return { errors: added }
}
export const markErrorMastered = async (id) => {
  if (!isMockMode) return http.patch(`/api/errors/${id}`, { status: 'mastered' })
  return { error: await updateError(id, (error) => ({ ...error, status: 'mastered' })) }
}
export const submitRedo = async (id, attempt) => {
  if (!isMockMode) return http.post(`/api/errors/${id}/redo`, attempt)
  assertRedoAttempt(attempt)
  return {
    error: await updateError(id, (error) => ({
      ...error,
      redoHistory: [...error.redoHistory, attempt],
      repeatCount: attempt.isCorrect ? error.repeatCount : error.repeatCount + 1,
      lastOccurredAt: attempt.isCorrect ? error.lastOccurredAt : attempt.attemptedAt,
      status: attempt.isCorrect ? (error.status === 'pending_review' ? 'reviewing' : error.status) : 'pending_review',
    })),
  }
}

// ---------- Notes ----------
export const createNote = async (note) => {
  if (!isMockMode) return http.post('/api/notes', note)
  assertNote(note)
  const state = await repository.update((current) => {
    if (current.notes.some((item) => item.id === note.id)) throw duplicate('Note', note.id)
    return { ...current, notes: [note, ...current.notes] }
  })
  return { note: state.notes.find((item) => item.id === note.id) }
}
export const updateNote = async (id, patch) => {
  if (!isMockMode) return http.patch(`/api/notes/${id}`, patch)
  return { note: await updateStoredNote(id, patch) }
}

// ---------- Exercise session ----------
export const submitSession = async (session) => {
  if (!isMockMode) return http.post('/api/sessions', session)
  assertSession(session)
  await repository.update((current) => {
    if (current.sessions.some((item) => item.sessionId === session.sessionId)) throw duplicate('Session', session.sessionId)
    return { ...current, sessions: [...current.sessions, session] }
  })
  return { sessionId: session.sessionId }
}

// ---------- Settings ----------
export const updateSettings = async (patch) => {
  if (!isMockMode) return http.patch('/api/student/settings', patch)
  assertSettingsPatch(patch)
  const state = await repository.update((current) => ({ ...current, settings: { ...current.settings, ...patch } }))
  return { settings: state.settings }
}
