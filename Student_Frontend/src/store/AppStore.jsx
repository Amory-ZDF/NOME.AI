import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { runRecoverableAction } from './actionRunner'
import { defaultAppServices } from './services'

const AppContext = createContext(null)

const dateOnly = (now) => now.toISOString().slice(0, 10)

export function AppProvider({ children, services = defaultAppServices }) {
  const [bootStatus, setBootStatus] = useState('loading')
  const [bootError, setBootError] = useState(null)
  const [tasks, setTasks] = useState([])
  const [errors, setErrors] = useState([])
  const [notes, setNotes] = useState([])
  const [noteFolders, setNoteFolders] = useState([])
  const [settings, setSettings] = useState(null)
  const [lastSession, setLastSession] = useState(null)
  const [toast, setToast] = useState(null)
  const [pendingActions, setPendingActions] = useState(() => new Set())
  const toastTimer = useRef(null)
  const mounted = useRef(true)
  const bootRequest = useRef(0)
  const actionCounts = useRef(new Map())
  const tasksRef = useRef([])
  const errorsRef = useRef([])
  const notesRef = useRef([])
  const settingsRef = useRef(null)
  const lastSessionRef = useRef(null)

  const replaceTasks = useCallback((next) => {
    tasksRef.current = next
    setTasks(next)
  }, [])
  const replaceErrors = useCallback((next) => {
    errorsRef.current = next
    setErrors(next)
  }, [])
  const replaceNotes = useCallback((next) => {
    notesRef.current = next
    setNotes(next)
  }, [])
  const replaceSettings = useCallback((next) => {
    settingsRef.current = next
    setSettings(next)
  }, [])
  const replaceLastSession = useCallback((next) => {
    lastSessionRef.current = next
    setLastSession(next)
  }, [])

  const showToast = useCallback((message, type = 'info') => {
    clearTimeout(toastTimer.current)
    setToast({ message, type, key: services.now().getTime() })
    toastTimer.current = setTimeout(() => {
      if (mounted.current) setToast(null)
    }, 2800)
  }, [services])

  const retryBootstrap = useCallback(async () => {
    const requestId = ++bootRequest.current
    setBootStatus('loading')
    setBootError(null)
    try {
      const data = await services.api.bootstrap()
      if (!mounted.current || requestId !== bootRequest.current) return data
      replaceTasks(data.tasks)
      replaceErrors(data.errors)
      replaceNotes(data.notes)
      setNoteFolders(data.noteFolders)
      replaceSettings(data.settings)
      setBootStatus('ready')
      return data
    } catch (error) {
      if (mounted.current && requestId === bootRequest.current) {
        setBootError(error)
        setBootStatus('error')
      }
      return undefined
    }
  }, [replaceErrors, replaceNotes, replaceSettings, replaceTasks, services])

  useEffect(() => {
    mounted.current = true
    retryBootstrap()
    return () => {
      mounted.current = false
      bootRequest.current += 1
      clearTimeout(toastTimer.current)
    }
  }, [retryBootstrap])

  const runAction = useCallback((key, options) => {
    const count = actionCounts.current.get(key) || 0
    actionCounts.current.set(key, count + 1)
    setPendingActions((current) => {
      const next = new Set(current)
      next.add(key)
      return next
    })

    return runRecoverableAction({
      ...options,
      onError: (error) => {
        options.onError?.(error)
        showToast(error.message || 'Unable to save your changes. Please try again.', 'error')
      },
    }).finally(() => {
      const remaining = (actionCounts.current.get(key) || 1) - 1
      if (remaining > 0) {
        actionCounts.current.set(key, remaining)
        return
      }
      actionCounts.current.delete(key)
      if (mounted.current) {
        setPendingActions((current) => {
          const next = new Set(current)
          next.delete(key)
          return next
        })
      }
    })
  }, [showToast])

  const completeTask = useCallback((id) => runAction(`completeTask:${id}`, {
    snapshot: tasksRef.current,
    optimistic: () => replaceTasks(tasksRef.current.map((task) => (task.id === id ? { ...task, status: 'completed' } : task))),
    request: () => services.api.completeTask(id),
    commit: () => {},
    rollback: replaceTasks,
  }), [replaceTasks, runAction, services])

  const removeTask = useCallback((id) => runAction(`removeTask:${id}`, {
    snapshot: tasksRef.current,
    optimistic: () => replaceTasks(tasksRef.current.filter((task) => task.id !== id)),
    request: () => Promise.resolve({ id }),
    commit: () => {},
    rollback: replaceTasks,
  }), [replaceTasks, runAction])

  const cannotCompleteTask = useCallback((id) => runAction(`cannotCompleteTask:${id}`, {
    snapshot: tasksRef.current,
    optimistic: () => replaceTasks(tasksRef.current.filter((task) => task.id !== id)),
    request: () => services.api.reportTaskAdjustment(id),
    commit: () => showToast('Feedback sent to your teacher 鈥?the task plan will be adjusted to fit you', 'success'),
    rollback: replaceTasks,
  }), [replaceTasks, runAction, services, showToast])

  const addTask = useCallback((task) => {
    const createdTask = task.id ? task : { ...task, id: services.createId() }
    return runAction(`addTask:${createdTask.id}`, {
      snapshot: tasksRef.current,
      optimistic: () => replaceTasks([...tasksRef.current, createdTask]),
      request: () => services.api.createTask(createdTask),
      commit: () => {},
      rollback: replaceTasks,
    })
  }, [replaceTasks, runAction, services])

  const addErrors = useCallback((items) => runAction('addErrors', {
    snapshot: errorsRef.current,
    optimistic: () => replaceErrors((() => {
      const existingQuestionIds = new Set(errorsRef.current.map((error) => error.questionId))
      const fresh = items.filter((item) => !existingQuestionIds.has(item.questionId))
      return [...fresh, ...errorsRef.current]
    })()),
    request: () => services.api.addErrors(items),
    commit: () => {},
    rollback: replaceErrors,
  }), [replaceErrors, runAction, services])

  const markErrorMastered = useCallback((id) => runAction(`markErrorMastered:${id}`, {
    snapshot: errorsRef.current,
    optimistic: () => replaceErrors(errorsRef.current.map((error) => (error.id === id ? { ...error, status: 'mastered' } : error))),
    request: () => services.api.markErrorMastered(id),
    commit: () => showToast('Marked as mastered 鈥?keep it up!', 'success'),
    rollback: replaceErrors,
  }), [replaceErrors, runAction, services, showToast])

  const recordRedo = useCallback((id, attempt) => {
    const recordedAttempt = attempt.attemptedAt ? attempt : { ...attempt, attemptedAt: services.now().toISOString() }
    return runAction(`recordRedo:${id}`, {
      snapshot: errorsRef.current,
      optimistic: () => replaceErrors(errorsRef.current.map((error) => (error.id === id
        ? {
            ...error,
            redoHistory: [...error.redoHistory, recordedAttempt],
            repeatCount: recordedAttempt.isCorrect ? error.repeatCount : error.repeatCount + 1,
            lastOccurredAt: recordedAttempt.isCorrect ? error.lastOccurredAt : dateOnly(services.now()),
            status: recordedAttempt.isCorrect ? (error.status === 'pending_review' ? 'reviewing' : error.status) : 'pending_review',
          }
        : error))),
      request: () => services.api.submitRedo(id, recordedAttempt),
      commit: () => {},
      rollback: replaceErrors,
    })
  }, [replaceErrors, runAction, services])

  const addNote = useCallback((note) => {
    const today = dateOnly(services.now())
    const createdNote = {
      ...note,
      id: note.id || services.createId(),
      createdAt: note.createdAt || today,
      updatedAt: note.updatedAt || today,
    }
    return runAction(`addNote:${createdNote.id}`, {
      snapshot: notesRef.current,
      optimistic: () => replaceNotes([createdNote, ...notesRef.current]),
      request: () => services.api.createNote(createdNote),
      commit: () => {},
      rollback: replaceNotes,
    })
  }, [replaceNotes, runAction, services])

  const updateNote = useCallback((id, patch) => {
    const updatedPatch = { ...patch, updatedAt: dateOnly(services.now()) }
    return runAction(`updateNote:${id}`, {
      snapshot: notesRef.current,
      optimistic: () => replaceNotes(notesRef.current.map((note) => (note.id === id ? { ...note, ...updatedPatch } : note))),
      request: () => services.api.updateNote(id, updatedPatch),
      commit: () => {},
      rollback: replaceNotes,
    })
  }, [replaceNotes, runAction, services])

  const saveSession = useCallback((session) => {
    const savedSession = {
      ...session,
      sessionId: session.sessionId || services.createId(),
      completedAt: session.completedAt || services.now().toISOString(),
    }
    return runAction(`saveSession:${savedSession.sessionId}`, {
      snapshot: lastSessionRef.current,
      optimistic: () => replaceLastSession(savedSession),
      request: () => services.api.submitSession(savedSession),
      commit: () => {},
      rollback: replaceLastSession,
    })
  }, [replaceLastSession, runAction, services])

  const updateSettings = useCallback((patch) => runAction('updateSettings', {
    snapshot: settingsRef.current,
    optimistic: () => replaceSettings({ ...settingsRef.current, ...patch }),
    request: () => services.api.updateSettings(patch),
    commit: () => {},
    rollback: replaceSettings,
  }), [replaceSettings, runAction, services])

  const isActionPending = useCallback((key) => pendingActions.has(key), [pendingActions])

  return (
    <AppContext.Provider value={{
      booted: bootStatus === 'ready', bootStatus, bootError, pendingActions, retryBootstrap, isActionPending,
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
