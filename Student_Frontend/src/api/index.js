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

const repository = createMockRepository({ seedFactory: createSeedState })

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const hasId = (value, field = 'id') => typeof value?.[field] === 'string' && value[field].trim().length > 0
const invalid = (message) => new ApiError(message, { status: 400, code: 'INVALID_INPUT' })
const notFound = (entity, id) => new ApiError(`${entity} ${id} was not found`, { status: 404, code: 'NOT_FOUND' })
const duplicate = (entity, id) => new ApiError(`${entity} ${id} already exists`, { status: 409, code: 'DUPLICATE_ID' })

const assertEntity = (value, entity, idField = 'id') => {
  if (!isRecord(value) || !hasId(value, idField)) throw invalid(`${entity} requires a nonempty ${idField}`)
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
  if (!isRecord(patch)) throw invalid('Note patch must be an object')
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
  return { task: await updateTask(id, { status: 'completed' }) }
}
export const reportTaskAdjustment = async (id) => {
  if (!isMockMode) return http.post(`/api/tasks/${id}/adjustment-request`, {})
  return { task: await updateTask(id, { status: 'adjustment_requested' }) }
}
export const createTask = async (task) => {
  if (!isMockMode) return http.post('/api/tasks', task)
  assertEntity(task, 'Task')
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
    assertEntity(item, 'Error')
    if (!hasId(item, 'questionId')) throw invalid('Error requires a nonempty questionId')
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
  if (!isRecord(attempt) || typeof attempt.isCorrect !== 'boolean') throw invalid('Redo attempt is invalid')
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
  assertEntity(note, 'Note')
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
  assertEntity(session, 'Session', 'sessionId')
  await repository.update((current) => {
    if (current.sessions.some((item) => item.sessionId === session.sessionId)) throw duplicate('Session', session.sessionId)
    return { ...current, sessions: [...current.sessions, session] }
  })
  return { sessionId: session.sessionId }
}

// ---------- Settings ----------
export const updateSettings = async (patch) => {
  if (!isMockMode) return http.patch('/api/student/settings', patch)
  if (!isRecord(patch)) throw invalid('Settings patch must be an object')
  const state = await repository.update((current) => ({ ...current, settings: { ...current.settings, ...patch } }))
  return { settings: state.settings }
}
