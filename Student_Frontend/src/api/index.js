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
import {
  student, initialTasks, initialErrors, initialNotes, initialNoteFolders,
  defaultSettings, greetingData, moduleStats, learningSummary,
} from '../data/mockData'

// Simulated network latency for the mock adapter only
const mock = (data, ms = 60) => new Promise((resolve) => setTimeout(() => resolve(data), ms))

// ---------- Bootstrap (GET /api/student/bootstrap) ----------
export function bootstrap() {
  if (!isMockMode) return http.get('/api/student/bootstrap')
  return mock({
    student,
    tasks: initialTasks,
    errors: initialErrors,
    notes: initialNotes,
    noteFolders: initialNoteFolders,
    settings: defaultSettings,
    greeting: greetingData,
    moduleStats,
    learningSummary,
  })
}

// ---------- Tasks ----------
export const completeTask = (id) => (isMockMode ? mock({ ok: true }) : http.patch(`/api/tasks/${id}`, { status: 'completed' }))
export const reportTaskAdjustment = (id) => (isMockMode ? mock({ ok: true }) : http.post(`/api/tasks/${id}/adjustment-request`, {}))
export const createTask = (task) => (isMockMode ? mock({ ok: true }) : http.post('/api/tasks', task))

// ---------- Error book ----------
export const addErrors = (items) => (isMockMode ? mock({ ok: true }) : http.post('/api/errors/batch', { items }))
export const markErrorMastered = (id) => (isMockMode ? mock({ ok: true }) : http.patch(`/api/errors/${id}`, { status: 'mastered' }))
export const submitRedo = (id, attempt) => (isMockMode ? mock({ ok: true }) : http.post(`/api/errors/${id}/redo`, attempt))

// ---------- Notes ----------
export const createNote = (note) => (isMockMode ? mock({ id: note.id }) : http.post('/api/notes', note))
export const updateNote = (id, patch) => (isMockMode ? mock({ ok: true }) : http.patch(`/api/notes/${id}`, patch))

// ---------- Exercise session ----------
export const submitSession = (session) => (isMockMode ? mock({ sessionId: session.sessionId }) : http.post('/api/sessions', session))

// ---------- Settings ----------
export const updateSettings = (patch) => (isMockMode ? mock({ ok: true }) : http.patch('/api/student/settings', patch))
