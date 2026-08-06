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
  const actionGeneration = useRef(0)
  const actionCounts = useRef(new Map())
  const collectionQueues = useRef(new Map())
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
    if (!mounted.current) return
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
      actionGeneration.current += 1
      clearTimeout(toastTimer.current)
    }
  }, [retryBootstrap])

  const runAction = useCallback((key, collection, createOptions) => {
    const generation = actionGeneration.current
    const count = actionCounts.current.get(key) || 0
    actionCounts.current.set(key, count + 1)
    setPendingActions((current) => {
      const next = new Set(current)
      next.add(key)
      return next
    })

    const start = () => {
      const options = createOptions()
      return runRecoverableAction({
        ...options,
        isActive: () => mounted.current && generation === actionGeneration.current,
        onError: (error) => {
          options.onError?.(error)
          showToast(error.message || 'Unable to save your changes. Please try again.', 'error')
        },
      })
    }
    const previous = collectionQueues.current.get(collection)
    const operation = previous ? previous.catch(() => undefined).then(start) : start()
    let queued
    queued = operation.finally(() => {
      const remaining = (actionCounts.current.get(key) || 1) - 1
      if (remaining > 0) {
        actionCounts.current.set(key, remaining)
      } else {
        actionCounts.current.delete(key)
        if (mounted.current) {
          setPendingActions((current) => {
            const next = new Set(current)
            next.delete(key)
            return next
          })
        }
      }
      if (collectionQueues.current.get(collection) === queued) collectionQueues.current.delete(collection)
    })
    collectionQueues.current.set(collection, queued)
    return queued
  }, [showToast])

  const completeTask = useCallback((id) => runAction(`completeTask:${id}`, 'tasks', () => ({
    snapshot: tasksRef.current,
    optimistic: () => replaceTasks(tasksRef.current.map((task) => (task.id === id ? { ...task, status: 'completed' } : task))),
    request: () => services.api.completeTask(id),
    commit: () => {},
    rollback: replaceTasks,
  })), [replaceTasks, runAction, services])

  const removeTask = useCallback((id) => runAction(`removeTask:${id}`, 'tasks', () => ({
    snapshot: tasksRef.current,
    optimistic: () => replaceTasks(tasksRef.current.filter((task) => task.id !== id)),
    request: () => Promise.resolve({ id }),
    commit: () => {},
    rollback: replaceTasks,
  })), [replaceTasks, runAction])

  const cannotCompleteTask = useCallback((id) => runAction(`cannotCompleteTask:${id}`, 'tasks', () => ({
    snapshot: tasksRef.current,
    optimistic: () => replaceTasks(tasksRef.current.filter((task) => task.id !== id)),
    request: () => services.api.reportTaskAdjustment(id),
    commit: () => showToast('Feedback sent to your teacher 鈥?the task plan will be adjusted to fit you', 'success'),
    rollback: replaceTasks,
  })), [replaceTasks, runAction, services, showToast])

  const addTask = useCallback((task) => {
    const createdTask = task.id ? task : { ...task, id: services.createId() }
    return runAction('addTask', 'tasks', () => ({
      snapshot: tasksRef.current,
      optimistic: () => replaceTasks([...tasksRef.current, createdTask]),
      request: () => services.api.createTask(createdTask),
      commit: () => {},
      rollback: replaceTasks,
    }))
  }, [replaceTasks, runAction, services])

  const addErrors = useCallback((items) => {
    const actionNow = services.now()
    const occurredAt = dateOnly(actionNow)
    const authoredItems = items.map((item) => ({
      ...item,
      id: item.id || services.createId(),
      firstOccurredAt: item.firstOccurredAt || occurredAt,
      lastOccurredAt: item.lastOccurredAt || occurredAt,
    }))
    return runAction('addErrors', 'errors', () => ({
      snapshot: errorsRef.current,
      optimistic: () => replaceErrors((() => {
        const questionIds = new Set(errorsRef.current.map((error) => error.questionId))
        const fresh = authoredItems.filter((item) => {
          if (questionIds.has(item.questionId)) return false
          questionIds.add(item.questionId)
          return true
        })
        return [...fresh, ...errorsRef.current]
      })()),
      request: () => services.api.addErrors(authoredItems),
      commit: () => {},
      rollback: replaceErrors,
    }))
  }, [replaceErrors, runAction, services])

  const markErrorMastered = useCallback((id) => runAction(`markErrorMastered:${id}`, 'errors', () => ({
    snapshot: errorsRef.current,
    optimistic: () => replaceErrors(errorsRef.current.map((error) => (error.id === id ? { ...error, status: 'mastered' } : error))),
    request: () => services.api.markErrorMastered(id),
    commit: () => showToast('Marked as mastered 鈥?keep it up!', 'success'),
    rollback: replaceErrors,
  })), [replaceErrors, runAction, services, showToast])

  const recordRedo = useCallback((id, attempt) => {
    const actionNow = services.now()
    const recordedAttempt = attempt.attemptedAt ? attempt : { ...attempt, attemptedAt: actionNow.toISOString() }
    return runAction(`recordRedo:${id}`, 'errors', () => ({
      snapshot: errorsRef.current,
      optimistic: () => replaceErrors(errorsRef.current.map((error) => (error.id === id
        ? {
            ...error,
            redoHistory: [...error.redoHistory, recordedAttempt],
            repeatCount: recordedAttempt.isCorrect ? error.repeatCount : error.repeatCount + 1,
            lastOccurredAt: recordedAttempt.isCorrect ? error.lastOccurredAt : dateOnly(actionNow),
            status: recordedAttempt.isCorrect ? (error.status === 'pending_review' ? 'reviewing' : error.status) : 'pending_review',
          }
        : error))),
      request: () => services.api.submitRedo(id, recordedAttempt),
      commit: () => {},
      rollback: replaceErrors,
    }))
  }, [replaceErrors, runAction, services])

  const addNote = useCallback((note) => {
    const actionNow = services.now()
    const today = dateOnly(actionNow)
    const createdNote = {
      ...note,
      id: note.id || services.createId(),
      createdAt: note.createdAt || today,
      updatedAt: note.updatedAt || today,
    }
    return runAction('addNote', 'notes', () => ({
      snapshot: notesRef.current,
      optimistic: () => replaceNotes([createdNote, ...notesRef.current]),
      request: () => services.api.createNote(createdNote),
      commit: (result) => {
        const persistedNote = result?.note
        if (!persistedNote) return
        replaceNotes(notesRef.current.map((existingNote) => (
          existingNote.id === createdNote.id
            ? { ...createdNote, ...persistedNote }
            : existingNote
        )))
      },
      rollback: replaceNotes,
    }))
  }, [replaceNotes, runAction, services])

  const updateNote = useCallback((id, patch) => {
    const actionNow = services.now()
    const updatedPatch = { ...patch, updatedAt: dateOnly(actionNow) }
    return runAction(`updateNote:${id}`, 'notes', () => ({
      snapshot: notesRef.current,
      optimistic: () => replaceNotes(notesRef.current.map((note) => (note.id === id ? { ...note, ...updatedPatch } : note))),
      request: () => services.api.updateNote(id, updatedPatch),
      commit: () => {},
      rollback: replaceNotes,
    }))
  }, [replaceNotes, runAction, services])

  const saveSession = useCallback((session) => {
    const actionNow = services.now()
    const completedAt = actionNow.toISOString()
    const savedSession = {
      ...session,
      sessionId: session.sessionId || services.createId(),
      completedAt: session.completedAt || completedAt,
      questions: session.questions?.map((question) => ({
        ...question,
        result: {
          ...question.result,
          attempts: question.result?.attempts?.map((attempt) => ({
            ...attempt,
            submittedAt: attempt.submittedAt || completedAt,
          })) || [],
        },
      })) || [],
    }
    return runAction('saveSession', 'session', () => ({
      snapshot: lastSessionRef.current,
      optimistic: () => replaceLastSession(savedSession),
      request: () => services.api.submitSession(savedSession),
      commit: (result) => {
        if (result?.sessionId && result.sessionId !== savedSession.sessionId) {
          replaceLastSession({ ...savedSession, sessionId: result.sessionId })
        }
      },
      rollback: replaceLastSession,
    }))
  }, [replaceLastSession, runAction, services])

  const updateSettings = useCallback((patch) => runAction('updateSettings', 'settings', () => ({
    snapshot: settingsRef.current,
    optimistic: () => replaceSettings({ ...settingsRef.current, ...patch }),
    request: () => services.api.updateSettings(patch),
    commit: () => {},
    rollback: replaceSettings,
  })), [replaceSettings, runAction, services])

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
