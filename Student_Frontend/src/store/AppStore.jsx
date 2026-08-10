import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { runRecoverableAction } from './actionRunner'
import { defaultAppServices } from './services'
import { buildAdjustmentRequest } from '../features/tasks/adjustmentRules'
import { isTaskAdjustmentEligible } from '../features/tasks/taskRules'
import { isCompleteVariantResult, isRenderableExerciseSet } from '../features/exercise/exerciseContracts'
import { mergeErrorCards } from '../features/errors/errorCards'
import { applyRedoAttempt, canMarkMastered, recordVariantVerification } from '../features/errors/masteryRules'
import {
  applyNoteOrganization,
  applyNotePatch,
  normalizeNoteSuggestions,
  sanitizePersistedNote,
  undoLastNoteVersion,
} from '../features/materials/noteVersions'
import {
  MaterialContractError,
  sanitizeUploadJob,
  sanitizeUploadJobs,
} from '../features/materials/materialContracts'

const AppContext = createContext(null)

const dateOnly = (now) => now.toISOString().slice(0, 10)
const invalidUploadResponse = () => Object.assign(
  new Error('Material API response is invalid'),
  { code: 'INVALID_UPLOAD_RESPONSE' },
)
const safeUploadJob = (job, expectedId) => {
  try {
    return sanitizeUploadJob(job, { expectedId })
  } catch (error) {
    if (error instanceof MaterialContractError) return null
    throw error
  }
}
const strictUploadJob = (job, expectedId, expectedStatus) => {
  const sanitized = safeUploadJob(job, expectedId)
  if (!sanitized || sanitized.status !== expectedStatus) throw invalidUploadResponse()
  return sanitized
}
const requireUploadTransition = (items, id, allowedStatuses) => {
  const current = items.find((job) => job.id === id)
  if (!current || !allowedStatuses.includes(current.status)) throw invalidUploadResponse()
  return current
}
const invalidNoteResponse = () => Object.assign(
  new Error('Note API response is invalid'),
  { code: 'INVALID_NOTE_RESPONSE' },
)
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key)
const sameJsonValue = (left, right) => {
  if (Object.is(left, right)) return true
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false
  if (Array.isArray(left) !== Array.isArray(right)) return false
  if (Array.isArray(left)) {
    return left.length === right.length && left.every((value, index) => sameJsonValue(value, right[index]))
  }
  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && sameJsonValue(left[key], right[key]))
}
const sameOwnJsonField = (left, right, field) => (
  hasOwn(left, field) === hasOwn(right, field)
  && (!hasOwn(left, field) || sameJsonValue(left[field], right[field]))
)
const immutableNoteFields = [
  'sourceJobId',
  'materialType',
  'examBoard',
  'subject',
  'chapter',
  'questionBlocks',
  'answerBlocks',
  'aiSuggestions',
  'createdAt',
]
const mutableNoteOutcomeFields = [
  'title',
  'folderId',
  'folderPath',
  'tags',
  'content',
  'linkedTopics',
  'linkedErrors',
  'source',
]
const strictNoteMutationResult = (items, id, response, expectedValue) => {
  const currentValue = items.find((note) => note.id === id)
  if (!currentValue) throw invalidNoteResponse()
  const current = sanitizePersistedNote(currentValue, { expectedId: id })
  const candidate = sanitizePersistedNote(response?.note, { expectedId: id })
  const expected = sanitizePersistedNote(expectedValue, { expectedId: id })
  if (!immutableNoteFields.every((field) => sameOwnJsonField(candidate, current, field))) {
    throw invalidNoteResponse()
  }
  if (candidate.version === current.version) {
    if (!sameJsonValue(candidate, current) || !sameJsonValue(candidate, expected)) {
      throw invalidNoteResponse()
    }
    return candidate
  }
  if (candidate.version !== current.version + 1
    || candidate.version !== expected.version
    || candidate.versions.length !== current.versions.length + 1
    || !candidate.versions.slice(0, -1).every((snapshot, index) => (
      sameJsonValue(snapshot, current.versions[index])
    ))) throw invalidNoteResponse()
  const prior = candidate.versions[candidate.versions.length - 1]
  const snapshotFields = ['version', 'title', 'folderId', 'folderPath', 'tags', 'content', 'linkedTopics', 'linkedErrors', 'source']
  if (!snapshotFields.every((field) => sameJsonValue(prior[field], current[field]))) {
    throw invalidNoteResponse()
  }
  const expectedPrior = expected.versions[expected.versions.length - 1]
  if (!expectedPrior
    || prior.reason !== expectedPrior.reason
    || !sameOwnJsonField(prior, expectedPrior, 'changedAt')
    || !sameOwnJsonField(candidate, expected, 'updatedAt')
    || candidate.updatedAt !== prior.changedAt
    || !mutableNoteOutcomeFields.every((field) => sameOwnJsonField(candidate, expected, field))) {
    throw invalidNoteResponse()
  }
  return candidate
}
const upsertById = (items, replacement, { prepend = false } = {}) => {
  const index = items.findIndex((item) => item.id === replacement.id)
  if (index < 0) return prepend ? [replacement, ...items] : [...items, replacement]
  return items.map((item, itemIndex) => (itemIndex === index ? replacement : item))
}

export function AppProvider({ children, services = defaultAppServices }) {
  const [bootStatus, setBootStatus] = useState('loading')
  const [bootError, setBootError] = useState(null)
  const [tasks, setTasks] = useState([])
  const [taskAdjustments, setTaskAdjustments] = useState([])
  const [greeting, setGreeting] = useState(null)
  const [moduleStats, setModuleStats] = useState(null)
  const [learningSummary, setLearningSummary] = useState(null)
  const [errors, setErrors] = useState([])
  const [notes, setNotes] = useState([])
  const [uploadJobs, setUploadJobs] = useState([])
  const [noteFolders, setNoteFolders] = useState([])
  const [settings, setSettings] = useState(null)
  const [exerciseCache, setExerciseCache] = useState({})
  const [sessions, setSessions] = useState({})
  const [sessionSummaries, setSessionSummaries] = useState({})
  const [lastSession, setLastSession] = useState(null)
  const [toast, setToast] = useState(null)
  const [pendingActions, setPendingActions] = useState(() => new Set())
  const toastTimer = useRef(null)
  const mounted = useRef(true)
  const bootRequest = useRef(0)
  const actionGeneration = useRef(0)
  const actionCounts = useRef(new Map())
  const pendingActionCounts = useRef(new Map())
  const collectionQueues = useRef(new Map())
  const exerciseLoads = useRef(new Map())
  const persistedSessionIds = useRef(new Set())
  const canonicalSessionIds = useRef(new Map())
  const tasksRef = useRef([])
  const taskAdjustmentsRef = useRef([])
  const errorsRef = useRef([])
  const notesRef = useRef([])
  const uploadJobsRef = useRef([])
  const settingsRef = useRef(null)
  const exerciseCacheRef = useRef({})
  const sessionsRef = useRef({})
  const sessionSummariesRef = useRef({})
  const lastSessionRef = useRef(null)

  const replaceTasks = useCallback((next) => {
    tasksRef.current = next
    setTasks(next)
  }, [])
  const replaceTaskAdjustments = useCallback((next) => {
    taskAdjustmentsRef.current = next
    setTaskAdjustments(next)
  }, [])
  const replaceErrors = useCallback((next) => {
    errorsRef.current = next
    setErrors(next)
  }, [])
  const replaceNotes = useCallback((next) => {
    notesRef.current = next
    setNotes(next)
  }, [])
  const replaceUploadJobs = useCallback((next) => {
    const metadataOnly = sanitizeUploadJobs(next)
    uploadJobsRef.current = metadataOnly
    setUploadJobs(metadataOnly)
  }, [])
  const replaceSettings = useCallback((next) => {
    settingsRef.current = next
    setSettings(next)
  }, [])
  const replaceExerciseCache = useCallback((next) => {
    exerciseCacheRef.current = next
    setExerciseCache(next)
  }, [])
  const replaceSessions = useCallback((next) => {
    sessionsRef.current = next
    setSessions(next)
  }, [])
  const replaceSessionSummaries = useCallback((next) => {
    sessionSummariesRef.current = next
    setSessionSummaries(next)
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
      replaceTaskAdjustments(data.taskAdjustments || [])
      setGreeting(data.greeting || null)
      setModuleStats(data.moduleStats || null)
      setLearningSummary(data.learningSummary || null)
      replaceErrors(data.errors)
      replaceNotes(data.notes)
      replaceUploadJobs(data.uploadJobs || [])
      setNoteFolders(data.noteFolders)
      replaceSettings(data.settings)
      replaceExerciseCache({})
      const bootSessions = data.sessions || {}
      replaceSessions(bootSessions)
      replaceSessionSummaries({})
      const persistedIds = Object.keys(bootSessions)
      persistedSessionIds.current = new Set(persistedIds)
      canonicalSessionIds.current = new Map(persistedIds.map((id) => [id, id]))
      setBootStatus('ready')
      return data
    } catch (error) {
      if (mounted.current && requestId === bootRequest.current) {
        setBootError(error)
        setBootStatus('error')
      }
      return undefined
    }
  }, [replaceErrors, replaceExerciseCache, replaceNotes, replaceSessionSummaries, replaceSessions, replaceSettings, replaceTaskAdjustments, replaceTasks, replaceUploadJobs, services])

  useEffect(() => {
    mounted.current = true
    retryBootstrap()
    return () => {
      mounted.current = false
      bootRequest.current += 1
      actionGeneration.current += 1
      exerciseLoads.current.clear()
      clearTimeout(toastTimer.current)
    }
  }, [retryBootstrap])

  const runAction = useCallback((key, collection, createOptions, actionOptions = {}) => {
    const operationKey = actionOptions.operationKey || key
    const pendingKey = actionOptions.pendingKey || key
    const signal = actionOptions.signal
    if (actionCounts.current.has(operationKey)) {
      const error = new Error('This task action is already in progress.')
      showToast(error.message, 'error')
      return Promise.reject(error)
    }
    const generation = actionGeneration.current
    const count = actionCounts.current.get(operationKey) || 0
    actionCounts.current.set(operationKey, count + 1)
    pendingActionCounts.current.set(pendingKey, (pendingActionCounts.current.get(pendingKey) || 0) + 1)
    setPendingActions((current) => {
      const next = new Set(current)
      next.add(pendingKey)
      return next
    })

    const start = () => {
      const options = createOptions()
      return runRecoverableAction({
        ...options,
        isActive: () => mounted.current
          && generation === actionGeneration.current
          && !signal?.aborted,
        onError: (error) => {
          options.onError?.(error)
          showToast(error.message || 'Unable to save your changes. Please try again.', 'error')
        },
      })
    }
    const collections = [...new Set(Array.isArray(collection) ? collection : [collection])]
    const previous = collections
      .map((name) => collectionQueues.current.get(name))
      .filter(Boolean)
    const operation = previous.length > 0
      ? Promise.all(previous.map((queuedOperation) => queuedOperation.catch(() => undefined))).then(start)
      : start()
    let queued
    queued = operation.finally(() => {
      const remaining = (actionCounts.current.get(operationKey) || 1) - 1
      if (remaining > 0) {
        actionCounts.current.set(operationKey, remaining)
      } else {
        actionCounts.current.delete(operationKey)
      }
      const pendingRemaining = (pendingActionCounts.current.get(pendingKey) || 1) - 1
      if (pendingRemaining > 0) {
        pendingActionCounts.current.set(pendingKey, pendingRemaining)
      } else {
        pendingActionCounts.current.delete(pendingKey)
        if (mounted.current) {
          setPendingActions((current) => {
            const next = new Set(current)
            next.delete(pendingKey)
            return next
          })
        }
      }
      collections.forEach((name) => {
        if (collectionQueues.current.get(name) === queued) collectionQueues.current.delete(name)
      })
    })
    collections.forEach((name) => collectionQueues.current.set(name, queued))
    return queued
  }, [showToast])

  const completeTask = useCallback((id) => runAction(`task:complete:${id}`, 'tasks', () => ({
    snapshot: tasksRef.current,
    optimistic: () => replaceTasks(tasksRef.current.map((task) => (task.id === id ? { ...task, status: 'completed' } : task))),
    request: () => services.api.completeTask(id),
    commit: (result) => {
      if (!result?.task) return
      replaceTasks(tasksRef.current.map((task) => (task.id === id ? { ...task, ...result.task } : task)))
      showToast('Task marked complete — nice work!', 'success')
    },
    rollback: replaceTasks,
  })), [replaceTasks, runAction, services, showToast])

  const requestTaskAdjustment = useCallback((task, draft) => {
    const actionKey = `task:adjust:${task.id}`
    if (actionCounts.current.has(actionKey)) {
      const error = new Error('This task action is already in progress.')
      showToast(error.message, 'error')
      return Promise.reject(error)
    }
    const currentTask = tasksRef.current.find((item) => item.id === task.id)
    if (!isTaskAdjustmentEligible(currentTask, taskAdjustmentsRef.current)) {
      return Promise.reject(new Error('Adjustment requests are only available for a pending teacher-assigned task without a submitted adjustment.'))
    }
    const request = buildAdjustmentRequest({
      task: currentTask,
      draft,
      now: services.now(),
      id: services.createId(),
    })
    return runAction(actionKey, 'tasks', () => ({
      snapshot: { tasks: tasksRef.current, taskAdjustments: taskAdjustmentsRef.current },
      optimistic: () => {
        replaceTasks(tasksRef.current.map((item) => (item.id === currentTask.id
          ? { ...item, adjustmentStatus: 'submitted' }
          : item)))
        replaceTaskAdjustments([...taskAdjustmentsRef.current, request])
      },
      request: () => services.api.reportTaskAdjustment(currentTask.id, request),
      commit: (result) => {
        if (result?.task) {
          replaceTasks(tasksRef.current.map((item) => (item.id === currentTask.id ? { ...item, ...result.task } : item)))
        }
        if (result?.request) {
          replaceTaskAdjustments(taskAdjustmentsRef.current.map((item) => (item.id === request.id ? { ...item, ...result.request } : item)))
        }
        showToast('Adjustment request sent to your teacher.', 'success')
      },
      rollback: (snapshot) => {
        replaceTasks(snapshot.tasks)
        replaceTaskAdjustments(snapshot.taskAdjustments)
      },
    }))
  }, [replaceTaskAdjustments, replaceTasks, runAction, services, showToast])

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
      optimistic: () => replaceErrors(mergeErrorCards(errorsRef.current, authoredItems)),
      request: () => services.api.addErrors(authoredItems),
      commit: (result) => {
        if (Array.isArray(result?.errors)) replaceErrors(result.errors)
      },
      rollback: replaceErrors,
    }))
  }, [replaceErrors, runAction, services])

  const addSessionErrors = useCallback((items) => {
    const actionNow = services.now()
    const occurredAt = actionNow.toISOString()
    const authoredItems = items.map((item) => ({
      ...item,
      id: item.id || services.createId(),
      firstOccurredAt: item.firstOccurredAt || occurredAt,
      lastOccurredAt: item.lastOccurredAt || occurredAt,
    }))
    return runAction('errors:add', 'errors', () => ({
      snapshot: errorsRef.current,
      optimistic: () => replaceErrors(mergeErrorCards(errorsRef.current, authoredItems)),
      request: () => services.api.upsertErrors(authoredItems),
      commit: (result) => {
        if (Array.isArray(result?.errors)) replaceErrors(result.errors)
      },
      rollback: replaceErrors,
    }))
  }, [replaceErrors, runAction, services])

  const markErrorMastered = useCallback((id) => {
    const error = errorsRef.current.find((item) => item.id === id)
    if (!canMarkMastered(error)) {
      const gateError = new Error('Complete the independent variant before marking this mastered')
      showToast(gateError.message, 'error')
      return Promise.reject(gateError)
    }
    return runAction(`error:master:${id}`, 'errors', () => ({
    snapshot: errorsRef.current,
    optimistic: () => replaceErrors(errorsRef.current.map((error) => (error.id === id ? { ...error, status: 'mastered' } : error))),
    request: () => services.api.markErrorMastered(id),
    commit: () => showToast('Marked as mastered 鈥?keep it up!', 'success'),
    rollback: replaceErrors,
    }))
  }, [replaceErrors, runAction, services, showToast])

  const recordRedo = useCallback((id, attempt) => {
    const actionNow = services.now()
    const recordedAttempt = attempt.attemptedAt ? attempt : { ...attempt, attemptedAt: actionNow.toISOString() }
    return runAction(`error:redo:${id}`, 'errors', () => ({
      snapshot: errorsRef.current,
      optimistic: () => replaceErrors(errorsRef.current.map((error) => (error.id === id
        ? applyRedoAttempt(error, recordedAttempt)
        : error))),
      request: () => services.api.submitRedo(id, recordedAttempt),
      commit: (result) => {
        if (result?.error?.id === id) {
          replaceErrors(errorsRef.current.map((error) => (error.id === id ? result.error : error)))
        }
      },
      rollback: replaceErrors,
    }))
  }, [replaceErrors, runAction, services])

  const scheduleErrorVariant = useCallback((id) => {
    const sourceError = errorsRef.current.find((error) => error.id === id)
    if (!sourceError) return Promise.reject(new Error('Error item was not found.'))
    return runAction(`error:variant:${id}`, ['errors', 'tasks'], () => ({
      snapshot: null,
      optimistic: () => {},
      request: async () => {
        const result = await services.api.scheduleErrorVariant(id)
        if (mounted.current && (
          !isCompleteVariantResult(result, sourceError.questionId)
          || result.exerciseSet.taskId !== result.task.id
          || result.exerciseSet.questions.length !== 1
          || result.task.verificationForErrorId !== id
          || result.error?.id !== id
          || result.error.questionId !== sourceError.questionId
          || result.error.verificationVariantId !== result.exerciseSet.id
        )) {
          throw new Error('The generated verification variant is incomplete. Please try again.')
        }
        return result
      },
      commit: (result) => {
        replaceErrors(errorsRef.current.map((error) => (error.id === id ? result.error : error)))
        replaceExerciseCache({
          ...exerciseCacheRef.current,
          [`set:${result.exerciseSet.id}`]: result.exerciseSet,
        })
        if (!tasksRef.current.some((task) => task.id === result.task.id)) {
          replaceTasks([...tasksRef.current, result.task])
        }
      },
      rollback: () => {},
    }))
  }, [replaceErrors, replaceExerciseCache, replaceTasks, runAction, services])

  const verifyErrorVariant = useCallback((id, result) => {
    const actionNow = services.now()
    const verification = result.verifiedAt
      ? result
      : { ...result, verifiedAt: actionNow.toISOString() }
    return runAction(`error:variant:${id}`, 'errors', () => ({
      snapshot: errorsRef.current,
      optimistic: () => replaceErrors(errorsRef.current.map((error) => (
        error.id === id ? recordVariantVerification(error, verification) : error
      ))),
      request: () => services.api.verifyErrorVariant(id, verification),
      commit: (response) => {
        if (response?.error?.id === id) {
          replaceErrors(errorsRef.current.map((error) => (error.id === id ? response.error : error)))
        }
      },
      rollback: replaceErrors,
    }))
  }, [replaceErrors, runAction, services])

  const loadSessionSummary = useCallback((sessionId) => {
    const cached = sessionSummariesRef.current[sessionId]
    if (cached) return Promise.resolve(cached)
    const actionKey = `summary:${sessionId}`
    return runAction(actionKey, 'sessionSummaries', () => ({
      snapshot: sessionSummariesRef.current,
      optimistic: () => {},
      request: () => services.api.getSessionSummary(sessionId),
      commit: (summary) => replaceSessionSummaries({
        ...sessionSummariesRef.current,
        [sessionId]: summary,
      }),
      rollback: replaceSessionSummaries,
    }))
  }, [replaceSessionSummaries, runAction, services])

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

  const startMaterialUpload = useCallback((metadata, actionOptions = {}) => {
    const actionNow = services.now()
    const authoredMetadata = {
      ...metadata,
      id: metadata.id || services.createId(),
      createdAt: metadata.createdAt || actionNow.toISOString(),
    }
    return runAction('upload:create', 'uploads:create', () => ({
      snapshot: uploadJobsRef.current,
      optimistic: () => {},
      request: () => services.api.createUploadJob(authoredMetadata, actionOptions),
      commit: (result) => {
        if (uploadJobsRef.current.some(({ id }) => id === authoredMetadata.id)) throw invalidUploadResponse()
        const job = strictUploadJob(result?.job, authoredMetadata.id, 'queued')
        replaceUploadJobs(upsertById(uploadJobsRef.current, job, { prepend: true }))
      },
      rollback: () => {},
    }), { signal: actionOptions.signal })
  }, [replaceUploadJobs, runAction, services])

  const processMaterialUpload = useCallback((id, actionOptions = {}) => runAction(
    `upload:process:${id}`,
    `uploads:process:${id}`,
    () => ({
      snapshot: uploadJobsRef.current,
      optimistic: () => {},
      request: () => services.api.processUploadJob(id, actionOptions),
      commit: (result) => {
        requireUploadTransition(uploadJobsRef.current, id, ['queued', 'failed'])
        const job = strictUploadJob(result?.job, id, 'needs_confirmation')
        replaceUploadJobs(upsertById(uploadJobsRef.current, job))
      },
      rollback: () => {},
      onError: (error) => {
        const current = uploadJobsRef.current.find((job) => job.id === id)
        if (!current || !['queued', 'processing', 'failed'].includes(current.status)) return
        const failedJob = safeUploadJob(error?.job, id)
        if (!failedJob || failedJob.status !== 'failed') return
        replaceUploadJobs(upsertById(uploadJobsRef.current, failedJob))
      },
    }),
    { signal: actionOptions.signal },
  ), [replaceUploadJobs, runAction, services])

  const confirmMaterialUpload = useCallback((id, patch, actionOptions = {}) => runAction(
    `upload:confirm:${id}`,
    [`uploads:confirm:${id}`, 'notes'],
    () => ({
      snapshot: { uploadJobs: uploadJobsRef.current, notes: notesRef.current },
      optimistic: () => {},
      request: () => services.api.confirmUploadJob(id, patch, actionOptions),
      commit: (result) => {
        requireUploadTransition(uploadJobsRef.current, id, ['needs_confirmation'])
        const job = strictUploadJob(result?.job, id, 'completed')
        const note = sanitizePersistedNote(result?.note, {
          expectedId: `note-${id}`,
          expectedSourceJobId: id,
        })
        if (notesRef.current.some(({ id: noteId }) => noteId === note.id)) throw invalidUploadResponse()
        replaceUploadJobs(upsertById(uploadJobsRef.current, job))
        replaceNotes(upsertById(notesRef.current, note, { prepend: true }))
      },
      rollback: () => {},
    }),
    { signal: actionOptions.signal },
  ), [replaceNotes, replaceUploadJobs, runAction, services])

  const cancelMaterialUpload = useCallback((id, actionOptions = {}) => runAction(
    `upload:cancel:${id}`,
    `uploads:cancel:${id}`,
    () => ({
      snapshot: uploadJobsRef.current,
      optimistic: () => {},
      request: () => services.api.cancelUploadJob(id, actionOptions),
      commit: (result) => {
        requireUploadTransition(
          uploadJobsRef.current,
          id,
          ['queued', 'processing', 'failed', 'needs_confirmation', 'cancelled'],
        )
        const job = strictUploadJob(result?.job, id, 'cancelled')
        replaceUploadJobs(upsertById(uploadJobsRef.current, job))
      },
      rollback: () => {},
    }),
    { signal: actionOptions.signal },
  ), [replaceUploadJobs, runAction, services])

  const loadExerciseSet = useCallback(({ taskId, bankSetId } = {}) => {
    const id = taskId || bankSetId
    if (typeof id !== 'string' || id.trim().length === 0 || (taskId && bankSetId)) {
      return Promise.reject(new Error('Provide exactly one exercise set identifier.'))
    }
    const source = taskId ? 'task' : 'bank'
    const cacheKey = `${source}:${id}`
    const publicActionKey = `exercise:load:${id}`
    const operationKey = `${publicActionKey}:${source}`
    const cached = exerciseCacheRef.current[cacheKey]
    if (cached) return Promise.resolve(cached)
    const activeLoad = exerciseLoads.current.get(cacheKey)
    if (activeLoad) return activeLoad

    let load
    load = runAction(publicActionKey, `exerciseCache:${cacheKey}`, () => ({
      snapshot: null,
      optimistic: () => {},
      request: async () => {
        const exerciseSet = await (taskId
          ? services.api.getExerciseSet(taskId)
          : services.api.getBankExerciseSet(bankSetId))
        if (mounted.current && (!isRenderableExerciseSet(exerciseSet)
          || (taskId && exerciseSet.taskId !== taskId))) {
          throw new Error('Exercise data is incomplete or invalid.')
        }
        return exerciseSet
      },
      commit: (exerciseSet) => {
        replaceExerciseCache({ ...exerciseCacheRef.current, [cacheKey]: exerciseSet })
      },
      rollback: () => {},
    }), { operationKey, pendingKey: publicActionKey }).finally(() => {
      if (exerciseLoads.current.get(cacheKey) === load) exerciseLoads.current.delete(cacheKey)
    })
    exerciseLoads.current.set(cacheKey, load)
    return load
  }, [replaceExerciseCache, runAction, services])

  const updateNote = useCallback((id, patch) => {
    const actionNow = services.now()
    const changedAt = actionNow.toISOString()
    const metadata = { changedAt, reason: 'edit' }
    const legacyOrganization = patch !== null
      && typeof patch === 'object'
      && !Array.isArray(patch)
      && patch.source === 'ai_organized'
      && Object.keys(patch).every((field) => ['source', 'tags'].includes(field))
    if (legacyOrganization) {
      const sourceNote = notesRef.current.find((note) => note.id === id)
      const suggestionIds = sourceNote
        ? normalizeNoteSuggestions(sourceNote).map(({ id: suggestionId }) => suggestionId)
        : []
      return runAction(`note:update:${id}`, 'notes', () => {
        const currentNotes = notesRef.current
        const currentNote = currentNotes.find((note) => note.id === id)
        const expectedNote = currentNote
          ? applyNoteOrganization(currentNote, suggestionIds, changedAt)
          : null
        return {
          snapshot: currentNotes,
          optimistic: () => replaceNotes(currentNotes.map((note) => (
            note.id === id ? expectedNote : note
          ))),
          request: () => services.api.organizeNote(id, suggestionIds, { changedAt }),
          commit: (result) => {
            const persistedNote = strictNoteMutationResult(currentNotes, id, result, expectedNote)
            replaceNotes(currentNotes.map((note) => (
              note.id === id ? persistedNote : note
            )))
          },
          rollback: replaceNotes,
        }
      })
    }
    return runAction(`note:update:${id}`, 'notes', () => {
      const currentNotes = notesRef.current
      const currentNote = currentNotes.find((note) => note.id === id)
      const expectedNote = currentNote ? applyNotePatch(currentNote, patch, metadata) : null
      return {
        snapshot: currentNotes,
        optimistic: () => replaceNotes(currentNotes.map((note) => (
          note.id === id ? expectedNote : note
        ))),
        request: () => services.api.updateNote(id, { ...patch, ...metadata }),
        commit: (result) => {
          const persistedNote = strictNoteMutationResult(currentNotes, id, result, expectedNote)
          replaceNotes(currentNotes.map((note) => (
            note.id === id ? persistedNote : note
          )))
        },
        rollback: replaceNotes,
      }
    })
  }, [replaceNotes, runAction, services])

  const organizeNote = useCallback((id, suggestionIds) => {
    const changedAt = services.now().toISOString()
    return runAction(`note:organize:${id}`, 'notes', () => {
      const currentNotes = notesRef.current
      const currentNote = currentNotes.find((note) => note.id === id)
      const expectedNote = currentNote
        ? applyNoteOrganization(currentNote, suggestionIds, changedAt)
        : null
      return {
        snapshot: currentNotes,
        optimistic: () => replaceNotes(currentNotes.map((note) => (
          note.id === id ? expectedNote : note
        ))),
        request: () => services.api.organizeNote(id, suggestionIds, { changedAt }),
        commit: (result) => {
          const note = strictNoteMutationResult(currentNotes, id, result, expectedNote)
          replaceNotes(upsertById(currentNotes, note))
        },
        rollback: replaceNotes,
      }
    })
  }, [replaceNotes, runAction, services])

  const undoNote = useCallback((id) => {
    const changedAt = services.now().toISOString()
    return runAction(`note:undo:${id}`, 'notes', () => {
      const currentNotes = notesRef.current
      const currentNote = currentNotes.find((note) => note.id === id)
      const expectedNote = currentNote ? undoLastNoteVersion(currentNote, changedAt) : null
      return {
        snapshot: currentNotes,
        optimistic: () => replaceNotes(currentNotes.map((note) => (
          note.id === id ? expectedNote : note
        ))),
        request: () => services.api.undoNote(id, { changedAt }),
        commit: (result) => {
          const note = strictNoteMutationResult(currentNotes, id, result, expectedNote)
          replaceNotes(upsertById(currentNotes, note))
        },
        rollback: replaceNotes,
      }
    })
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
    return runAction(`exercise:submit:${savedSession.sessionId}`, 'tasks', () => ({
      snapshot: lastSessionRef.current,
      optimistic: () => replaceLastSession(savedSession),
      request: async () => {
        let sessionResult = {
          sessionId: canonicalSessionIds.current.get(savedSession.sessionId) || savedSession.sessionId,
        }
        if (!persistedSessionIds.current.has(savedSession.sessionId)) {
          const submitted = await services.api.submitSession(savedSession)
          const returnedId = typeof submitted?.sessionId === 'string' ? submitted.sessionId.trim() : ''
          const canonicalId = returnedId
            && (returnedId === savedSession.sessionId || !persistedSessionIds.current.has(returnedId))
            ? returnedId
            : savedSession.sessionId
          persistedSessionIds.current.add(savedSession.sessionId)
          persistedSessionIds.current.add(canonicalId)
          canonicalSessionIds.current.set(savedSession.sessionId, canonicalId)
          canonicalSessionIds.current.set(canonicalId, canonicalId)
          sessionResult = {
            ...(submitted !== null && typeof submitted === 'object' && !Array.isArray(submitted) ? submitted : {}),
            sessionId: canonicalId,
          }
        }

        if (!savedSession.taskId) return { ...sessionResult, completionPending: false }
        try {
          const completion = await services.api.completeTask(savedSession.taskId)
          const completedTask = completion?.task
          if (completedTask?.id !== savedSession.taskId || completedTask.status !== 'completed') {
            return { ...sessionResult, completionPending: true }
          }
          return { ...sessionResult, task: completedTask, completionPending: false }
        } catch (completionError) {
          return { ...sessionResult, completionError, completionPending: true }
        }
      },
      commit: (result) => {
        const committedSession = { ...savedSession, sessionId: result.sessionId }
        replaceLastSession(committedSession)
        replaceSessions({ ...sessionsRef.current, [committedSession.sessionId]: committedSession })
        if (result?.task) {
          replaceTasks(tasksRef.current.map((task) => (
            task.id === result.task.id ? { ...task, ...result.task } : task
          )))
        }
        if (result?.completionPending) showToast('Session saved; task completion will retry', 'error')
      },
      rollback: replaceLastSession,
    }))
  }, [replaceLastSession, replaceSessions, replaceTasks, runAction, services, showToast])

  const generateVariant = useCallback((sourceQuestion) => {
    const questionId = sourceQuestion?.id
    if (typeof questionId !== 'string' || questionId.trim().length === 0) {
      return Promise.reject(new Error('A source question is required.'))
    }
    return runAction(`exercise:variant:${questionId}`, 'tasks', () => ({
      snapshot: null,
      optimistic: () => {},
      request: async () => {
        const result = await services.api.generateVariant(questionId)
        if (mounted.current && !isCompleteVariantResult(result, questionId)) {
          throw new Error('The generated variant is incomplete. Please try again.')
        }
        return result
      },
      commit: (result) => {
        if (result?.exerciseSet?.id) {
          replaceExerciseCache({
            ...exerciseCacheRef.current,
            [`set:${result.exerciseSet.id}`]: result.exerciseSet,
          })
        }
        if (result?.task && !tasksRef.current.some((task) => task.id === result.task.id)) {
          replaceTasks([...tasksRef.current, result.task])
        }
      },
      rollback: () => {},
    }))
  }, [replaceExerciseCache, replaceTasks, runAction, services])

  const updateSettings = useCallback((patch) => runAction('updateSettings', 'settings', () => ({
    snapshot: settingsRef.current,
    optimistic: () => replaceSettings({ ...settingsRef.current, ...patch }),
    request: () => services.api.updateSettings(patch),
    commit: () => {},
    rollback: replaceSettings,
  })), [replaceSettings, runAction, services])

  const isActionPending = useCallback((key) => {
    if (pendingActions.has(key)) return true
    if (key.startsWith('updateNote:')) {
      return pendingActions.has(`note:update:${key.slice('updateNote:'.length)}`)
    }
    return false
  }, [pendingActions])

  return (
    <AppContext.Provider value={{
      booted: bootStatus === 'ready', bootStatus, bootError, pendingActions, retryBootstrap, isActionPending,
      tasks, taskAdjustments, greeting, moduleStats, learningSummary, errors, notes, uploadJobs, noteFolders, settings, exerciseCache, sessions, sessionSummaries, lastSession, toast,
      showToast, completeTask, requestTaskAdjustment, addTask,
      addErrors, addSessionErrors, markErrorMastered, recordRedo, scheduleErrorVariant, verifyErrorVariant, loadSessionSummary,
      addNote, startMaterialUpload, processMaterialUpload, confirmMaterialUpload, cancelMaterialUpload,
      updateNote, organizeNote, undoNote, loadExerciseSet, saveSession, generateVariant, updateSettings,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  return useContext(AppContext)
}
