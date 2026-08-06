// ============================================================
// NOME.AI Student — API endpoint layer
//
// Every function below maps 1:1 to a backend REST endpoint
// documented in API_INTERFACE.md (aligned with PRD §8).
// - Real backend: set VITE_API_BASE_URL → requests go over HTTP.
// - Frontend-only stage: unset → served by the local mock adapter.
// Either way the UI/store code stays identical.
// ============================================================

import { http, isMockMode } from './client'
import { createSeedState } from '../data/mockData'
import { createMockRepository } from './mockRepository'

const repository = createMockRepository({ seedFactory: createSeedState })

const updateTask = async (id, patch) => {
  const state = await repository.update((current) => ({
    ...current,
    tasks: current.tasks.map((task) => (task.id === id ? { ...task, ...patch } : task)),
  }))
  return state.tasks.find((task) => task.id === id)
}

const updateError = async (id, recipe) => {
  const state = await repository.update((current) => ({
    ...current,
    errors: current.errors.map((error) => (error.id === id ? recipe(error) : error)),
  }))
  return state.errors.find((error) => error.id === id)
}

const updateStoredNote = async (id, patch) => {
  const state = await repository.update((current) => ({
    ...current,
    notes: current.notes.map((note) => (note.id === id ? { ...note, ...patch } : note)),
  }))
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
  const state = await repository.update((current) => ({ ...current, tasks: [...current.tasks, task] }))
  return { task: state.tasks.find((item) => item.id === task.id) }
}

// ---------- Error book ----------
export const addErrors = async (items) => {
  if (!isMockMode) return http.post('/api/errors/batch', { items })
  const state = await repository.update((current) => {
    const questionIds = new Set(current.errors.map((error) => error.questionId))
    const errors = items.filter((item) => !questionIds.has(item.questionId))
    return { ...current, errors: [...errors, ...current.errors] }
  })
  return { errors: state.errors.filter((error) => items.some((item) => item.id === error.id)) }
}
export const markErrorMastered = async (id) => {
  if (!isMockMode) return http.patch(`/api/errors/${id}`, { status: 'mastered' })
  return { error: await updateError(id, (error) => ({ ...error, status: 'mastered' })) }
}
export const submitRedo = async (id, attempt) => {
  if (!isMockMode) return http.post(`/api/errors/${id}/redo`, attempt)
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
  const state = await repository.update((current) => ({ ...current, notes: [note, ...current.notes] }))
  return { note: state.notes.find((item) => item.id === note.id) }
}
export const updateNote = async (id, patch) => {
  if (!isMockMode) return http.patch(`/api/notes/${id}`, patch)
  return { note: await updateStoredNote(id, patch) }
}

// ---------- Exercise session ----------
export const submitSession = async (session) => {
  if (!isMockMode) return http.post('/api/sessions', session)
  await repository.update((current) => ({ ...current, sessions: [...(current.sessions || []), session] }))
  return { sessionId: session.sessionId }
}

// ---------- Settings ----------
export const updateSettings = async (patch) => {
  if (!isMockMode) return http.patch('/api/student/settings', patch)
  const state = await repository.update((current) => ({ ...current, settings: { ...current.settings, ...patch } }))
  return { settings: state.settings }
}
