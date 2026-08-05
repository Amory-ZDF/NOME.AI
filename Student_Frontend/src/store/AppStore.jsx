import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import * as api from '../api'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [booted, setBooted] = useState(false)
  const [tasks, setTasks] = useState([])
  const [errors, setErrors] = useState([])
  const [notes, setNotes] = useState([])
  const [noteFolders, setNoteFolders] = useState([])
  const [settings, setSettings] = useState(null)
  const [lastSession, setLastSession] = useState(null)
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)

  // Bootstrap all initial data through the API layer (mock or real backend)
  useEffect(() => {
    api.bootstrap().then((data) => {
      setTasks(data.tasks)
      setErrors(data.errors)
      setNotes(data.notes)
      setNoteFolders(data.noteFolders)
      setSettings(data.settings)
      setBooted(true)
    })
  }, [])

  const showToast = useCallback((message, type = 'info') => {
    clearTimeout(toastTimer.current)
    setToast({ message, type, key: Date.now() })
    toastTimer.current = setTimeout(() => setToast(null), 2800)
  }, [])

  // ---------- Tasks ----------
  const completeTask = useCallback((id) => {
    api.completeTask(id)
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, status: 'completed' } : t)))
  }, [])

  const removeTask = useCallback((id) => {
    setTasks((ts) => ts.filter((t) => t.id !== id))
  }, [])

  const cannotCompleteTask = useCallback((id) => {
    // PRD: the system sends an adjustment suggestion to the teacher
    api.reportTaskAdjustment(id)
    setTasks((ts) => ts.filter((t) => t.id !== id))
    showToast('Feedback sent to your teacher — the task plan will be adjusted to fit you', 'success')
  }, [showToast])

  const addTask = useCallback((task) => {
    api.createTask(task)
    setTasks((ts) => [...ts, task])
  }, [])

  // ---------- Error book ----------
  const addErrors = useCallback((items) => {
    api.addErrors(items)
    setErrors((es) => {
      const existIds = new Set(es.map((e) => e.questionId))
      const fresh = items.filter((it) => !existIds.has(it.questionId))
      return [...fresh, ...es]
    })
  }, [])

  const markErrorMastered = useCallback((id) => {
    api.markErrorMastered(id)
    setErrors((es) => es.map((e) => (e.id === id ? { ...e, status: 'mastered' } : e)))
    showToast('Marked as mastered — keep it up!', 'success')
  }, [showToast])

  const recordRedo = useCallback((id, attempt) => {
    api.submitRedo(id, attempt)
    setErrors((es) => es.map((e) => (e.id === id
      ? {
          ...e,
          redoHistory: [...e.redoHistory, attempt],
          repeatCount: attempt.isCorrect ? e.repeatCount : e.repeatCount + 1,
          lastOccurredAt: attempt.isCorrect ? e.lastOccurredAt : new Date().toISOString().slice(0, 10),
          status: attempt.isCorrect ? (e.status === 'pending_review' ? 'reviewing' : e.status) : 'pending_review',
        }
      : e)))
  }, [])

  // ---------- Notes ----------
  const addNote = useCallback((note) => {
    api.createNote(note)
    setNotes((ns) => [note, ...ns])
    return note.id
  }, [])

  const updateNote = useCallback((id, patch) => {
    api.updateNote(id, patch)
    setNotes((ns) => ns.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: new Date().toISOString().slice(0, 10) } : n)))
  }, [])

  // ---------- Session ----------
  const saveSession = useCallback((session) => {
    api.submitSession(session)
    setLastSession(session)
  }, [])

  const updateSettings = useCallback((patch) => {
    api.updateSettings(patch)
    setSettings((s) => ({ ...s, ...patch }))
  }, [])

  return (
    <AppContext.Provider value={{
      booted,
      tasks, errors, notes, noteFolders, settings, lastSession, toast,
      showToast, completeTask, removeTask, cannotCompleteTask, addTask,
      addErrors, markErrorMastered, recordRedo,
      addNote, updateNote, saveSession, updateSettings,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  return useContext(AppContext)
}
