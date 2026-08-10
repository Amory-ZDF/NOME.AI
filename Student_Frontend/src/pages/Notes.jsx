import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useApp } from '../store/AppStore'
import { Icon, Badge, Modal, ProgressBar } from '../components/ui'
import ClassificationForm from '../features/materials/ClassificationForm'
import VersionHistory from '../features/materials/VersionHistory'
import { MATERIAL_TYPES, validateStudyFile } from '../features/materials/materialRules'
import { normalizeNoteSuggestions } from '../features/materials/noteVersions'

const SOURCE_META = {
  typed: { label: 'Typed', icon: 'keyboard' },
  handwritten: { label: 'Handwritten', icon: 'stylus' },
  photo: { label: 'Photo', icon: 'photo_camera' },
  ai_organized: { label: 'AI Organized', icon: 'auto_awesome' },
}

const SOURCE_FALLBACK = { label: 'Note', icon: 'description' }
const DEMO_FILE = Object.freeze({
  name: 'handwritten-notes-ch7.jpg',
  type: 'image/jpeg',
  size: 512 * 1024,
})
const CANCELLABLE_UPLOAD_STATES = new Set([
  'queued', 'processing', 'failed', 'needs_confirmation',
])

const MATERIAL_TYPE_LABELS = {
  class_note: 'Class note',
  teacher_material: 'Teacher material',
  homework: 'Homework',
  past_paper: 'Past paper',
  mock_paper: 'Mock paper',
  mark_scheme: 'Mark Scheme',
  ielts_passage: 'IELTS passage',
  writing_speaking: 'Writing / speaking material',
  handwritten_draft: 'Handwritten draft',
  error_photo: 'Error photo',
}

const uploadProgress = ({ job, creating, processing, confirming }) => {
  if (confirming || job?.status === 'completed') return 100
  if (job?.status === 'needs_confirmation') return 75
  if (processing || ['processing', 'failed'].includes(job?.status)) return 35
  if (creating || job?.status === 'queued') return 0
  return 0
}

const uploadStageLabel = ({ job, creating, processing, confirming }) => {
  if (confirming || job?.status === 'completed') return 'Saving note'
  if (job?.status === 'needs_confirmation') return 'Review classification'
  if (processing || job?.status === 'processing') return 'Recognising content'
  if (job?.status === 'failed') return 'Recognition failed'
  if (creating || job?.status === 'queued') return 'Queued for recognition'
  return 'Ready to upload'
}

const classificationFromJob = (job) => ({
  materialType: job.result.materialType,
  examBoard: job.result.examBoard,
  subject: job.result.subject,
  chapter: job.result.chapter,
  folderId: job.result.folderId,
  folderPath: job.result.folderPath,
})

// ---------- Upload flow (PRD §5.4) ----------
function UploadModal({ open, onClose, onCreated, folders }) {
  const {
    uploadJobs,
    reserveMaterialUploadId,
    startMaterialUpload,
    processMaterialUpload,
    confirmMaterialUpload,
    cancelMaterialUpload,
    showToast,
    isActionPending,
  } = useApp()
  const [materialType, setMaterialType] = useState('handwritten_draft')
  const [fileMetadata, setFileMetadata] = useState(null)
  const [jobId, setJobId] = useState(null)
  const [validationError, setValidationError] = useState('')
  const [operationError, setOperationError] = useState('')
  const [classification, setClassification] = useState(null)
  const [operationPhase, setOperationPhase] = useState('idle')
  const mountedRef = useRef(true)
  const processControllerRef = useRef(null)
  const flowPromiseRef = useRef(null)
  const cancelPromiseRef = useRef(null)
  const choosingAnotherRef = useRef(false)
  const reservedJobIdRef = useRef(null)
  const cancellationRequestedRef = useRef(false)
  const cancelledRef = useRef(false)
  const cancelAttemptedRef = useRef(false)
  const phaseRef = useRef('idle')
  const jobRef = useRef(null)
  const cancelRef = useRef(cancelMaterialUpload)
  const loadedClassificationRef = useRef(null)
  const statusRef = useRef(null)

  const job = uploadJobs.find((item) => item.id === jobId) || null
  const creating = operationPhase === 'creating' || (isActionPending('upload:create') && Boolean(fileMetadata))
  const processing = operationPhase === 'processing' || (Boolean(jobId) && isActionPending(`upload:process:${jobId}`))
  const confirming = operationPhase === 'confirming' || (Boolean(jobId) && isActionPending(`upload:confirm:${jobId}`))
  const cancelling = operationPhase === 'cancelling' || (Boolean(jobId) && isActionPending(`upload:cancel:${jobId}`))
  const progress = uploadProgress({ job, creating, processing, confirming })
  const stageLabel = operationPhase === 'create_error' ? 'Upload failed'
    : operationPhase === 'process_error' ? 'Recognition failed'
      : operationPhase === 'cancelling' ? 'Cancelling upload'
        : operationPhase === 'cancel_error' ? 'Cancellation failed'
          : uploadStageLabel({ job, creating, processing, confirming })

  jobRef.current = job
  cancelRef.current = cancelMaterialUpload

  const changePhase = (nextPhase) => {
    phaseRef.current = nextPhase
    if (mountedRef.current) setOperationPhase(nextPhase)
  }

  const abortRecognition = () => {
    processControllerRef.current?.abort()
    processControllerRef.current = null
  }

  const reset = () => {
    abortRecognition()
    setFileMetadata(null)
    setJobId(null)
    setValidationError('')
    setOperationError('')
    setClassification(null)
    setOperationPhase('idle')
    loadedClassificationRef.current = null
    jobRef.current = null
    reservedJobIdRef.current = null
    cancellationRequestedRef.current = false
    cancelledRef.current = false
    cancelAttemptedRef.current = false
    phaseRef.current = 'idle'
    flowPromiseRef.current = null
    cancelPromiseRef.current = null
    choosingAnotherRef.current = false
  }

  const finishClose = () => {
    if (!mountedRef.current) return
    onClose()
    reset()
  }

  const ensureCancelled = (id = jobRef.current?.id || reservedJobIdRef.current) => {
    if (!id || cancelledRef.current) return Promise.resolve()
    if (cancelPromiseRef.current) return cancelPromiseRef.current
    changePhase('cancelling')
    cancelAttemptedRef.current = true
    const cancellation = cancelRef.current(id, { allowMissing: true })
      .then((result) => {
        cancelledRef.current = true
        if (result?.job) jobRef.current = result.job
        return result
      })
      .finally(() => {
        if (cancelPromiseRef.current === cancellation) cancelPromiseRef.current = null
      })
    cancelPromiseRef.current = cancellation
    return cancellation
  }

  const requestClose = async () => {
    if (phaseRef.current === 'confirming' || cancelPromiseRef.current) return
    if (!fileMetadata && !jobRef.current && !flowPromiseRef.current) {
      finishClose()
      return
    }
    cancellationRequestedRef.current = true
    abortRecognition()
    setOperationError('')
    changePhase('cancelling')
    try {
      await flowPromiseRef.current?.catch((error) => {
        if (error?.name !== 'AbortError') throw error
      })
      await ensureCancelled()
      finishClose()
    } catch (error) {
      cancellationRequestedRef.current = false
      if (mountedRef.current) {
        changePhase('cancel_error')
        setOperationError(error.message || 'Unable to cancel this upload. Try again.')
      }
    }
  }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (phaseRef.current === 'confirming') return
      cancellationRequestedRef.current = true
      abortRecognition()
      const pending = flowPromiseRef.current
      if (pending) {
        pending.catch(() => undefined).then(() => ensureCancelled()).catch(() => undefined)
      } else if (jobRef.current && CANCELLABLE_UPLOAD_STATES.has(jobRef.current.status)) {
        ensureCancelled(jobRef.current.id).catch(() => undefined)
      }
    }
  }, [])

  useEffect(() => {
    if (job?.status !== 'needs_confirmation' || loadedClassificationRef.current === job.id) return
    loadedClassificationRef.current = job.id
    setClassification(classificationFromJob(job))
  }, [job])

  useEffect(() => {
    if (!open || (!fileMetadata && !job)) return
    statusRef.current?.focus()
  }, [Boolean(classification), job?.status, open, operationError, operationPhase])

  const processJob = async (id) => {
    abortRecognition()
    const controller = new AbortController()
    processControllerRef.current = controller
    changePhase('processing')
    setOperationError('')
    try {
      await processMaterialUpload(id, { signal: controller.signal })
      if (mountedRef.current && !cancellationRequestedRef.current) changePhase('idle')
    } catch (error) {
      if (mountedRef.current && error?.name !== 'AbortError') {
        changePhase('process_error')
        setOperationError(error.message || 'Unable to recognise this file. Try again.')
      }
    } finally {
      if (processControllerRef.current === controller) processControllerRef.current = null
    }
  }

  const runUploadFlow = async (safeMetadata) => {
    changePhase('creating')
    const id = reservedJobIdRef.current || reserveMaterialUploadId()
    reservedJobIdRef.current = id
    const result = await startMaterialUpload({
        fileName: safeMetadata.name,
        mimeType: safeMetadata.type,
        size: safeMetadata.size,
        materialType,
        id,
      })
    jobRef.current = result.job
    if (mountedRef.current) {
      setJobId(id)
    }
    if (cancellationRequestedRef.current || !mountedRef.current) {
      await ensureCancelled(id)
      return
    }
    await processJob(id)
    if (cancellationRequestedRef.current || !mountedRef.current) await ensureCancelled(id)
  }

  const launchUploadFlow = (safeMetadata) => {
    if (flowPromiseRef.current) return flowPromiseRef.current
    setValidationError('')
    setOperationError('')
    cancelledRef.current = false
    cancellationRequestedRef.current = false
    const flow = runUploadFlow(safeMetadata)
      .catch(async (error) => {
        if ((cancellationRequestedRef.current || !mountedRef.current) && !cancelAttemptedRef.current) {
          await ensureCancelled(reservedJobIdRef.current)
          return
        }
        if (mountedRef.current && error?.name !== 'AbortError') {
          changePhase('create_error')
          setOperationError(error.message || 'Unable to start this upload. Try again.')
        }
        throw error
      })
      .finally(() => {
        if (flowPromiseRef.current === flow) flowPromiseRef.current = null
      })
    flowPromiseRef.current = flow
    flow.catch(() => undefined)
    return flow
  }

  const startUpload = (file) => {
    const validation = validateStudyFile(file)
    if (!validation.valid) {
      setValidationError(validation.message)
      setOperationError('')
      return
    }
    const safeMetadata = { name: file.name, type: file.type, size: file.size }
    setFileMetadata(safeMetadata)
    launchUploadFlow(safeMetadata)
  }

  const retryRecognition = () => {
    if (!job?.id || flowPromiseRef.current) return
    const flow = processJob(job.id)
      .then(() => (cancellationRequestedRef.current ? ensureCancelled(job.id) : undefined))
      .finally(() => {
        if (flowPromiseRef.current === flow) flowPromiseRef.current = null
      })
    flowPromiseRef.current = flow
    flow.catch(() => undefined)
  }

  const chooseAnotherFile = async () => {
    if (phaseRef.current !== 'create_error' || choosingAnotherRef.current) return
    choosingAnotherRef.current = true
    setOperationError('')
    const id = reservedJobIdRef.current
    try {
      if (id) await ensureCancelled(id)
      reservedJobIdRef.current = null
      cancelledRef.current = false
      cancelAttemptedRef.current = false
      cancellationRequestedRef.current = false
      jobRef.current = null
      setJobId(null)
      setFileMetadata(null)
      setClassification(null)
      loadedClassificationRef.current = null
      changePhase('idle')
    } catch (error) {
      changePhase('create_error')
      setOperationError(error.message || 'Unable to cancel this upload. Try again.')
    } finally {
      choosingAnotherRef.current = false
    }
  }

  const confirm = async () => {
    if (!job || !classification || phaseRef.current === 'confirming') return
    const patch = Object.fromEntries(Object.entries(classification).map(([field, value]) => (
      [field, typeof value === 'string' ? value.trim() : value]
    )))
    if (Object.values(patch).some((value) => typeof value !== 'string' || value.length === 0)) {
      setOperationError('Complete every classification field before confirming')
      return
    }

    changePhase('confirming')
    setOperationError('')
    const confirmation = confirmMaterialUpload(job.id, patch)
    flowPromiseRef.current = confirmation
    try {
      const result = await confirmation
      if (!mountedRef.current) return
      onCreated(result.note)
      showToast('Note created and classified', 'success')
      finishClose()
    } catch (error) {
      if (mountedRef.current && error?.name !== 'AbortError') {
        changePhase('idle')
        setOperationError(error.message || 'Unable to create the note. Try again.')
      }
    } finally {
      if (flowPromiseRef.current === confirmation) flowPromiseRef.current = null
    }
  }

  const showIdle = !fileMetadata && !job
  const showClassification = job?.status === 'needs_confirmation'
  const showFailure = job?.status === 'failed' || operationPhase === 'process_error'
  const showLifecycle = !showIdle && !showClassification && !showFailure

  return (
    <Modal open={open} onClose={requestClose} title="Upload note file">
      {showIdle && (
        <div>
          <label className="block text-xs font-medium text-warm-stone mb-3">
            Material type
            <select
              className="zb-input mt-1"
              value={materialType}
              onChange={(event) => setMaterialType(event.target.value)}
            >
              {MATERIAL_TYPES.map((value) => (
                <option key={value} value={value}>{MATERIAL_TYPE_LABELS[value]}</option>
              ))}
            </select>
          </label>
          <label className="border-2 border-dashed border-warm-stone/30 rounded-card p-10 flex flex-col items-center gap-2 cursor-pointer hover:border-deep-teal hover:bg-teal-tint/40 transition-colors">
            <Icon name="cloud_upload" size={36} className="text-deep-teal" />
            <p className="text-sm font-medium">Click to select or drag a file here</p>
            <p className="text-xs text-warm-stone">Supported: photos (handwritten notes) / PDF / screenshots · up to 20 MB</p>
            <input
              aria-label="Select a note file"
              type="file"
              className="hidden"
              accept=".pdf,image/jpeg,image/png,image/webp,image/heic"
              onChange={(event) => {
                const selected = event.target.files?.[0]
                if (selected) startUpload(selected)
                event.target.value = ''
              }}
            />
          </label>
          {validationError && <p role="alert" className="text-xs text-error-red mt-2">{validationError}</p>}
          <button type="button" className="zb-btn-ghost w-full mt-3" onClick={() => startUpload(DEMO_FILE)}>
            Use handwritten demo
          </button>
        </div>
      )}

      {showLifecycle && (
        <div
          ref={statusRef}
          role="status"
          aria-live="polite"
          aria-label="Upload status"
          tabIndex={-1}
          className="py-8 text-center focus:outline-none"
        >
          <p className="text-sm text-warm-stone mb-1">{stageLabel}</p>
          <p className="text-sm font-medium mb-3">{fileMetadata?.name || job?.fileName}</p>
          <ProgressBar value={progress} className="max-w-xs mx-auto" />
          <p className="font-mono text-xs text-warm-stone mt-2">{progress}%</p>
          <p className="text-xs text-warm-stone mt-4">OCR recognition → subject detection → chapter classification</p>
          {operationError && <p role="alert" className="text-xs text-error-red mt-3">{operationError}</p>}
          {operationPhase === 'create_error' && (
            <div className="flex gap-2 mt-4">
              <button type="button" className="zb-btn-primary flex-1" onClick={() => launchUploadFlow(fileMetadata)} disabled={creating || cancelling}>Retry upload</button>
              <button type="button" className="zb-btn-ghost flex-1" onClick={chooseAnotherFile} disabled={creating || cancelling}>Choose another file</button>
            </div>
          )}
          {(fileMetadata || (job && CANCELLABLE_UPLOAD_STATES.has(job.status))) && (
            <button type="button" className="zb-btn-ghost mt-4" onClick={requestClose} disabled={cancelling}>Cancel upload</button>
          )}
        </div>
      )}

      {showFailure && (
        <div
          ref={statusRef}
          role="status"
          aria-live="polite"
          aria-label="Upload status"
          tabIndex={-1}
          className="py-5 focus:outline-none"
        >
          <div className="bg-red-50 border border-error-red/30 rounded-comp p-4">
            <p className="text-sm font-medium text-error-red">Recognition failed</p>
            <p role="alert" className="text-xs text-warm-stone mt-1">{operationError || job?.failure?.message}</p>
          </div>
          <ProgressBar value={progress} className="mt-4" />
          <p className="font-mono text-xs text-warm-stone text-center mt-2">{progress}%</p>
          <div className="flex gap-2 mt-4">
            <button type="button" className="zb-btn-primary flex-1" onClick={retryRecognition} disabled={processing || cancelling}>Retry recognition</button>
            <button type="button" className="zb-btn-ghost flex-1" onClick={requestClose} disabled={cancelling}>Cancel upload</button>
          </div>
        </div>
      )}

      {showClassification && classification && (
        <div>
          <div
            ref={statusRef}
            role="status"
            aria-live="polite"
            aria-label="Upload status"
            tabIndex={-1}
            className="bg-teal-tint border border-deep-teal/30 rounded-comp p-4 mb-4 focus:outline-none"
          >
            <p className="text-sm font-medium text-deep-teal flex items-center gap-1.5 mb-2">
              <Icon name="check_circle" size={16} /> Recognition complete
            </p>
            <ProgressBar value={progress} />
            <p className="font-mono text-xs text-warm-stone text-right mt-1">{progress}%</p>
          </div>
          <ClassificationForm
            value={classification}
            folders={folders}
            onChange={setClassification}
            disabled={confirming || cancelling}
          />
          {operationError && <p role="alert" className="text-xs text-error-red mt-3">{operationError}</p>}
          <div className="flex gap-2 mt-4">
            <button type="button" className="zb-btn-primary flex-1" onClick={confirm} disabled={confirming || cancelling}>
              Confirm and create note
            </button>
            <button type="button" className="zb-btn-ghost flex-1" onClick={requestClose} disabled={confirming || cancelling}>
              Cancel upload
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

const editableBlockLabel = (block, index) => {
  if (block.t === 'h') return `Edit heading ${index + 1}`
  if (block.t === 'formula') return `Edit formula ${index + 1}`
  if (block.t === 'list') return `Edit list ${index + 1}`
  if (block.t === 'highlight') return `Edit highlight ${index + 1}`
  return `Edit paragraph ${index + 1}`
}

const blockClassName = (block) => {
  if (block.t === 'h') return 'font-semibold mt-4 mb-2'
  if (block.t === 'formula') return 'bg-warm-paper border border-whisper-line rounded-comp px-4 py-3 my-3 math text-[15px]'
  if (block.t === 'list') return 'text-sm leading-7 text-deep-ink mb-2.5 pl-5 border-l-2 border-deep-teal/30'
  if (block.t === 'highlight') return 'text-sm leading-7 text-deep-ink mb-2.5 bg-alert-amber/10 rounded-comp px-2'
  return 'text-sm leading-7 text-deep-ink mb-2.5'
}

// ---------- Note detail ----------
function NoteDetail({ note, errors }) {
  const {
    updateNote,
    organizeNote,
    undoNote,
    showToast,
    isActionPending,
  } = useApp()
  const [title, setTitle] = useState(note.title)
  const [tagsText, setTagsText] = useState(note.tags.join(', '))
  const [content, setContent] = useState(() => cloneContent(note.content))
  const [activeBlockIndex, setActiveBlockIndex] = useState(null)
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState([])
  const [workflowPending, setWorkflowPending] = useState(false)
  const noteRef = useRef(note)
  const draftRef = useRef({
    title: note.title,
    tagsText: note.tags.join(', '),
    content: cloneContent(note.content),
  })
  const savedDraftRef = useRef(cloneContentDraft(draftRef.current))
  const flushPromiseRef = useRef(null)
  const workflowRef = useRef(false)
  const latestPersistedNoteRef = useRef(note)
  const suggestions = useMemo(() => {
    try {
      return normalizeNoteSuggestions(note)
    } catch {
      return []
    }
  }, [note])
  const suggestionIdentity = suggestions.map(({ id }) => id).join('|')
  const linkedErrors = errors.filter((error) => note.linkedErrors.includes(error.id))
  const noteUpdatePending = isActionPending(`note:update:${note.id}`)
  const organizePending = isActionPending(`note:organize:${note.id}`)
  const undoPending = isActionPending(`note:undo:${note.id}`)
  const noteWritePending = noteUpdatePending || organizePending || undoPending || workflowPending
  const sourceMeta = SOURCE_META[note.source] || SOURCE_FALLBACK
  const versions = Array.isArray(note.versions) ? note.versions : []
  const currentVersion = Number.isInteger(note.version) && note.version > 0 ? note.version : 1

  noteRef.current = note
  latestPersistedNoteRef.current = note

  useEffect(() => {
    setTitle(note.title)
    draftRef.current.title = note.title
    savedDraftRef.current.title = note.title
  }, [note.id, note.title])
  useEffect(() => {
    const nextTagsText = note.tags.join(', ')
    setTagsText(nextTagsText)
    draftRef.current.tagsText = nextTagsText
    savedDraftRef.current.tagsText = nextTagsText
  }, [note.id, note.tags])
  useEffect(() => {
    const nextContent = cloneContent(note.content)
    setContent(nextContent)
    draftRef.current.content = nextContent
    savedDraftRef.current.content = cloneContent(nextContent)
  }, [note.id, note.content])
  useEffect(() => {
    setSelectedSuggestionIds(suggestions.map(({ id }) => id))
  }, [note.id, suggestionIdentity])

  const flushDraft = async (overrides = {}) => {
    if (flushPromiseRef.current) {
      const precedingSucceeded = await flushPromiseRef.current
      if (!precedingSucceeded) return false
    }
    const draft = {
      title: (overrides.title ?? draftRef.current.title).trim(),
      tagsText: overrides.tagsText ?? draftRef.current.tagsText,
      content: cloneContent(overrides.content ?? draftRef.current.content),
    }
    if (!draft.title) return false
    const nextTags = [...new Set(draft.tagsText.split(',').map((tag) => tag.trim()).filter(Boolean))]
    const normalizedTagsText = nextTags.join(', ')
    const baseline = cloneContentDraft(savedDraftRef.current)
    const patch = {}
    if (draft.title !== baseline.title) patch.title = draft.title
    if (normalizedTagsText !== baseline.tagsText) patch.tags = nextTags
    if (JSON.stringify(draft.content) !== JSON.stringify(baseline.content)) patch.content = draft.content
    if (Object.keys(patch).length === 0) return true

    const update = updateNote(note.id, patch)
      .then((result) => {
        if (result?.note) latestPersistedNoteRef.current = result.note
        savedDraftRef.current = {
          title: draft.title,
          tagsText: normalizedTagsText,
          content: cloneContent(draft.content),
        }
        return true
      })
      .catch(() => {
        setTitle(baseline.title)
        setTagsText(baseline.tagsText)
        setContent(cloneContent(baseline.content))
        draftRef.current = cloneContentDraft(baseline)
        return false
      })
      .finally(() => {
        if (flushPromiseRef.current === update) flushPromiseRef.current = null
      })
    flushPromiseRef.current = update
    return update
  }

  const saveTitle = () => {
    const nextTitle = draftRef.current.title.trim()
    if (!nextTitle) {
      setTitle(note.title)
      draftRef.current.title = note.title
      return
    }
    setTitle(nextTitle)
    draftRef.current.title = nextTitle
    void flushDraft()
  }

  const saveTags = () => {
    const nextTagsText = [...new Set(draftRef.current.tagsText.split(',').map((tag) => tag.trim()).filter(Boolean))].join(', ')
    setTagsText(nextTagsText)
    draftRef.current.tagsText = nextTagsText
    void flushDraft()
  }

  const updateContentValue = (index, value) => {
    const nextContent = draftRef.current.content.map((block, blockIndex) => (
      blockIndex === index ? { ...block, v: value } : block
    ))
    draftRef.current.content = nextContent
    setContent(nextContent)
  }

  const saveContent = (nextContent = draftRef.current.content) => {
    draftRef.current.content = cloneContent(nextContent)
    void flushDraft({ content: nextContent })
  }

  const selectedOrLastBlock = () => {
    const draftContent = draftRef.current.content
    if (Number.isInteger(activeBlockIndex) && draftContent[activeBlockIndex]?.t !== 'image') return activeBlockIndex
    for (let index = draftContent.length - 1; index >= 0; index -= 1) {
      if (draftContent[index].t === 'p') return index
    }
    for (let index = draftContent.length - 1; index >= 0; index -= 1) {
      if (draftContent[index].t !== 'image') return index
    }
    return -1
  }

  const applyToolbar = (action) => {
    if (organizePending || undoPending || workflowRef.current) return
    const draftContent = draftRef.current.content
    if (action === 'Image') {
      const imageNumber = draftContent.filter((block) => block.t === 'image').length + 1
      const imageBlock = {
        t: 'image',
        v: 'Study image',
        reference: `object://note/${encodeURIComponent(note.id)}/image-${currentVersion}-${imageNumber}`,
        alt: 'Study image',
      }
      const next = [...draftContent, imageBlock]
      draftRef.current.content = next
      setContent(next)
      setActiveBlockIndex(next.length - 1)
      saveContent(next)
      return
    }

    const index = selectedOrLastBlock()
    if (index < 0) return
    const currentBlock = draftContent[index]
    let replacement = currentBlock
    if (action === 'Bold') replacement = { ...currentBlock, v: `**${currentBlock.v}**` }
    if (action === 'Italic') replacement = { ...currentBlock, v: `*${currentBlock.v}*` }
    if (action === 'List') replacement = { ...currentBlock, t: 'list' }
    if (action === 'Formula') replacement = { ...currentBlock, t: 'formula' }
    if (action === 'Highlight') replacement = { ...currentBlock, t: 'highlight' }
    const next = draftContent.map((block, blockIndex) => (blockIndex === index ? replacement : block))
    draftRef.current.content = next
    setContent(next)
    saveContent(next)
  }

  const organize = async () => {
    if (workflowRef.current) return
    workflowRef.current = true
    setWorkflowPending(true)
    try {
      if (!await flushDraft()) return
      await organizeNote(note.id, selectedSuggestionIds)
      showToast('AI organisation complete: selected suggestions applied', 'success')
    } catch {
      // AppStore rolls back and reports the recoverable write failure.
    } finally {
      workflowRef.current = false
      setWorkflowPending(false)
    }
  }

  const undo = async () => {
    if (workflowRef.current) return
    workflowRef.current = true
    setWorkflowPending(true)
    try {
      if (!await flushDraft()) return
      const restoredVersion = latestPersistedNoteRef.current?.versions?.at(-1)?.version
      if (!restoredVersion) return
      await undoNote(note.id)
      showToast(`Restored version ${restoredVersion}`, 'success')
    } catch {
      // AppStore rolls back and reports the recoverable write failure.
    } finally {
      workflowRef.current = false
      setWorkflowPending(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <input
        aria-label="Note title"
        className="text-xl font-bold tracking-tight w-full bg-transparent focus:outline-none mb-1"
        value={title}
        disabled={noteWritePending}
        onChange={(event) => {
          draftRef.current.title = event.target.value
          setTitle(event.target.value)
        }}
        onBlur={saveTitle}
      />
      <div className="flex items-center gap-2 text-xs text-warm-stone mb-4 flex-wrap">
        <span>{note.folderPath}</span>
        <span>·</span>
        <span className="font-mono">{note.createdAt} created · {note.updatedAt} edited</span>
        <span className="zb-badge bg-warm-stone/10 text-warm-stone gap-1">
          <Icon name={sourceMeta.icon} size={12} /> {sourceMeta.label}
        </span>
      </div>

      <label className="block text-xs text-warm-stone mb-3">
        Tags
        <input
          aria-label="Tags"
          className="zb-input mt-1 !h-8"
          value={tagsText}
          disabled={noteWritePending}
          onChange={(event) => {
            draftRef.current.tagsText = event.target.value
            setTagsText(event.target.value)
          }}
          onBlur={saveTags}
          placeholder="Comma-separated tags"
        />
      </label>

      {/* Toolbar */}
      <div className="flex items-center gap-1 pb-3 mb-4 border-b border-whisper-line">
        {[
          ['format_bold', 'Bold'],
          ['format_italic', 'Italic'],
          ['format_list_bulleted', 'List'],
          ['image', 'Image'],
          ['functions', 'Formula'],
          ['highlight', 'Highlight'],
        ].map(([icon, label]) => (
          <button
            key={icon}
            type="button"
            aria-label={label}
            title={label}
            className="p-2 rounded-comp text-warm-stone hover:text-deep-ink hover:bg-teal-tint"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => applyToolbar(label)}
            disabled={organizePending || undoPending || workflowPending}
          >
            <Icon name={icon} size={18} />
          </button>
        ))}
      </div>

      <div className="pb-4">
        {content.map((block, index) => (
          block.t === 'image' ? (
            <figure key={`${block.reference}-${index}`} className="bg-warm-paper border border-whisper-line rounded-comp px-4 py-3 my-3">
              <p className="text-sm font-medium flex items-center gap-1.5"><Icon name="image" size={16} /> {block.alt}</p>
              <figcaption className="font-mono text-[10px] text-warm-stone mt-1 break-all">{block.reference}</figcaption>
            </figure>
          ) : (
            <textarea
              key={`${note.id}-${index}`}
              aria-label={editableBlockLabel(block, index)}
              className={`block w-full resize-none bg-transparent focus:outline-none focus:ring-1 focus:ring-deep-teal/20 ${blockClassName(block)}`}
              rows={Math.max(1, Math.ceil(block.v.length / 72))}
              value={block.v}
              disabled={noteWritePending}
              onFocus={() => setActiveBlockIndex(index)}
              onChange={(event) => updateContentValue(index, event.target.value)}
              onBlur={() => saveContent()}
            />
          )
        ))}
      </div>

      {/* Linked errors */}
      {linkedErrors.length > 0 && (
        <div className="border-t border-whisper-line pt-4 mb-4">
          <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <Icon name="bookmarks" size={16} className="text-alert-amber" /> Linked errors ({linkedErrors.length})
          </p>
          <div className="flex flex-col gap-2">
            {linkedErrors.map((error) => (
              <div key={error.id} className="flex items-center justify-between bg-warm-paper rounded-comp px-3 py-2 text-sm">
                <span className="truncate text-warm-stone">{error.questionSummary}</span>
                <Badge tone="amber">{error.status === 'pending_review' ? 'To Review' : error.status === 'mastered' ? 'Mastered' : 'Reviewing'}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI organisation suggestions */}
      {suggestions.length > 0 && (
        <div className="border-t border-whisper-line pt-4">
          <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <Icon name="auto_awesome" size={16} className="text-deep-teal" /> AI Organisation Suggestions
          </p>
          <div className="flex flex-col gap-2 mb-3">
            {suggestions.map((suggestion) => (
              <label key={suggestion.id} className="bg-teal-tint/70 rounded-comp px-3 py-2.5 text-sm text-warm-stone leading-6 flex gap-2 items-start">
                <input
                  type="checkbox"
                  className="mt-1 accent-deep-teal"
                  checked={selectedSuggestionIds.includes(suggestion.id)}
                  disabled={noteWritePending}
                  onChange={(event) => setSelectedSuggestionIds((current) => (
                    event.target.checked
                      ? [...current, suggestion.id]
                      : current.filter((id) => id !== suggestion.id)
                  ))}
                />
                <span>{suggestion.message}</span>
              </label>
            ))}
          </div>
          <button
            className="zb-btn-primary !h-9"
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={organize}
            disabled={noteWritePending || selectedSuggestionIds.length === 0}
          >
            {organizePending ? 'Organising…' : (<><Icon name="magic_button" size={16} /> One-click organise</>)}
          </button>
        </div>
      )}

      {versions.length > 0 && (
        <div className="border-t border-whisper-line pt-3 mt-4">
          <button type="button" className="zb-btn-ghost !h-9" onMouseDown={(event) => event.preventDefault()} onClick={undo} disabled={noteWritePending}>
            <Icon name="undo" size={16} /> {undoPending ? 'Restoring…' : 'Undo last change'}
          </button>
        </div>
      )}

      <VersionHistory versions={versions} currentVersion={currentVersion} />
    </div>
  )
}

function cloneContent(content) {
  return content.map((block) => ({ ...block }))
}

function cloneContentDraft(draft) {
  return {
    title: draft.title,
    tagsText: draft.tagsText,
    content: cloneContent(draft.content),
  }
}

const normalizeSearchText = (value) => value.toLocaleLowerCase().replace(/[_/\s]+/g, ' ').trim()

const noteSearchText = (note) => normalizeSearchText([
  note.title,
  ...(note.tags || []),
  ...(note.content || []).flatMap((block) => [block.v, block.alt, block.reference]),
  note.materialType,
  MATERIAL_TYPE_LABELS[note.materialType],
  note.examBoard,
  note.subject,
  note.chapter,
].filter((value) => typeof value === 'string').join('\n'))

// ---------- Notes page ----------
export default function Notes() {
  const { booted, notes, noteFolders, errors, addNote, showToast, isActionPending } = useApp()
  const { id: routeNoteId } = useParams()
  const navigate = useNavigate()
  const [activeFolder, setActiveFolder] = useState('all')
  const [search, setSearch] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [activeId, setActiveId] = useState(routeNoteId || null)
  const [allowOutsideFilter, setAllowOutsideFilter] = useState(false)
  const routeSyncRef = useRef(Boolean(routeNoteId))
  const temporaryOutsideRouteRef = useRef(null)
  const routeNoteExists = !routeNoteId || notes.some((note) => note.id === routeNoteId)
  const invalidRoute = booted && Boolean(routeNoteId) && !routeNoteExists

  useEffect(() => {
    if (!booted || !routeNoteId) return
    if (!routeNoteExists) {
      routeSyncRef.current = false
      temporaryOutsideRouteRef.current = null
      setAllowOutsideFilter(false)
      setActiveId(null)
      navigate('/notes', { replace: true })
      return
    }
    routeSyncRef.current = true
    const allowTemporaryOutside = temporaryOutsideRouteRef.current === routeNoteId
    temporaryOutsideRouteRef.current = null
    setAllowOutsideFilter(allowTemporaryOutside)
    setActiveId(routeNoteId)
  }, [booted, navigate, routeNoteExists, routeNoteId])

  const filteredNotes = useMemo(() => {
    let list = notes
    if (activeFolder === 'recent') list = [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5)
    else if (activeFolder !== 'all') list = list.filter((note) => note.folderId === activeFolder)
    const normalizedSearch = normalizeSearchText(search)
    if (normalizedSearch) list = list.filter((note) => noteSearchText(note).includes(normalizedSearch))
    return list
  }, [notes, activeFolder, search])

  const filteredActiveNote = filteredNotes.find((note) => note.id === activeId)
  const activeNote = invalidRoute ? null : filteredActiveNote
    || (allowOutsideFilter ? notes.find((note) => note.id === activeId) : null)
    || filteredNotes[0]
    || null

  useEffect(() => {
    if (!booted || allowOutsideFilter) return
    const nextId = activeNote?.id || null
    if (activeId !== nextId) setActiveId(nextId)
    if (!routeSyncRef.current) return
    const nextPath = nextId ? `/notes/${nextId}` : '/notes'
    const currentPath = routeNoteId ? `/notes/${routeNoteId}` : '/notes'
    if (nextPath !== currentPath) navigate(nextPath, { replace: true })
  }, [activeId, activeNote?.id, allowOutsideFilter, booted, navigate, routeNoteId])

  const selectNote = (id) => {
    setAllowOutsideFilter(false)
    setActiveId(id)
    if (routeNoteId) navigate(`/notes/${id}`, { replace: true })
  }

  const createNote = async () => {
    try {
      const result = await addNote({
        title: 'Untitled note',
        folderId: 'f-math',
        folderPath: 'A-Level Math',
        tags: [],
        linkedTopics: [],
        linkedErrors: [],
        source: 'typed',
        content: [{ t: 'p', v: 'Start writing…' }],
        aiSuggestions: [],
        versions: [],
        version: 1,
      })
      setAllowOutsideFilter(true)
      setActiveId(result.note.id)
      if (routeSyncRef.current) {
        temporaryOutsideRouteRef.current = result.note.id
        navigate(`/notes/${result.note.id}`, { replace: true })
      }
      showToast('New note created', 'success')
    } catch {
      // AppStore already displays the recoverable write error.
    }
  }

  const handleCreatedNote = (note) => {
    setAllowOutsideFilter(true)
    setActiveId(note.id)
    if (routeSyncRef.current) {
      temporaryOutsideRouteRef.current = note.id
      navigate(`/notes/${note.id}`, { replace: true })
    }
  }

  const FolderItem = ({ folder, depth = 0 }) => (
    <>
      <button
        type="button"
        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-comp text-sm transition-colors ${activeFolder === folder.id ? 'bg-teal-tint text-deep-teal font-medium' : 'text-deep-ink hover:bg-warm-paper'}`}
        style={{ paddingLeft: `${10 + depth * 14}px` }}
        onClick={() => {
          setAllowOutsideFilter(false)
          setActiveFolder(folder.id)
        }}
      >
        <span className="flex items-center gap-1.5 truncate">
          {depth === 0 && <Icon name="folder" size={15} className="text-warm-stone" />}
          {folder.name}
        </span>
        <span className="font-mono text-xs text-warm-stone">{folder.noteCount}</span>
      </button>
      {folder.children?.map((child) => <FolderItem key={child.id} folder={child} depth={depth + 1} />)}
    </>
  )

  return (
    <div className="max-w-max-width mx-auto px-4 lg:px-6 py-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Notes</h1>
          <p className="text-xs text-warm-stone mt-0.5">{notes.length} notes · AI auto-classification & linking</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Icon name="search" size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-warm-stone" />
            <input
              className="zb-input !w-52 !pl-8"
              placeholder="Search notes…"
              value={search}
              onChange={(event) => {
                setAllowOutsideFilter(false)
                setSearch(event.target.value)
              }}
            />
          </div>
          <button type="button" className="zb-btn-ghost" onClick={() => setUploadOpen(true)}><Icon name="cloud_upload" size={16} /> Upload</button>
          <button type="button" className="zb-btn-primary" onClick={createNote} disabled={isActionPending('addNote')}><Icon name="add" size={16} /> New note</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[200px_280px_1fr] gap-4 items-start">
        {/* Left: folder tree */}
        <div className="zb-card !p-3 lg:sticky lg:top-20">
          <p className="text-xs font-semibold text-warm-stone uppercase tracking-wide px-2 mb-1.5">Library</p>
          <button type="button" className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-comp text-sm mb-0.5 ${activeFolder === 'all' ? 'bg-teal-tint text-deep-teal font-medium' : 'hover:bg-warm-paper'}`} onClick={() => { setAllowOutsideFilter(false); setActiveFolder('all') }}>
            <span className="flex items-center gap-1.5"><Icon name="description" size={15} className="text-warm-stone" />All notes</span>
            <span className="font-mono text-xs text-warm-stone">{notes.length}</span>
          </button>
          <button type="button" className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-comp text-sm mb-2 ${activeFolder === 'recent' ? 'bg-teal-tint text-deep-teal font-medium' : 'hover:bg-warm-paper'}`} onClick={() => { setAllowOutsideFilter(false); setActiveFolder('recent') }}>
            <span className="flex items-center gap-1.5"><Icon name="schedule" size={15} className="text-warm-stone" />Recently edited</span>
            <span className="font-mono text-xs text-warm-stone">5</span>
          </button>
          <p className="text-xs font-semibold text-warm-stone uppercase tracking-wide px-2 mb-1.5 mt-3">Subjects</p>
          {noteFolders.map((folder) => <FolderItem key={folder.id} folder={folder} />)}
          <button type="button" className="w-full flex items-center gap-1.5 px-2.5 py-1.5 mt-2 rounded-comp text-sm text-warm-stone border border-dashed border-warm-stone/30 hover:border-deep-teal hover:text-deep-teal transition-colors" onClick={() => showToast('The AI creates folders automatically based on note content', 'info')}>
            <Icon name="add" size={15} /> New folder
          </button>
        </div>

        {/* Middle: note list */}
        <div className="zb-card !p-2 lg:sticky lg:top-20 max-h-[75vh] overflow-y-auto">
          <AnimatePresence>
            {filteredNotes.map((note) => (
              <motion.button
                type="button"
                key={note.id}
                layout
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className={`w-full text-left px-3 py-3 rounded-comp mb-1 transition-colors ${activeNote?.id === note.id ? 'bg-teal-tint' : 'hover:bg-warm-paper'}`}
                onClick={() => selectNote(note.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-sm truncate">{note.title}</p>
                  {note.linkedErrors.length > 0 && <Badge tone="amber">{note.linkedErrors.length} errors</Badge>}
                </div>
                <p className="text-xs text-warm-stone mt-1 line-clamp-2 leading-5">
                  {note.content.find((block) => block.t === 'p')?.v || note.content[0]?.v}
                </p>
                <p className="text-[10px] text-warm-stone/70 font-mono mt-1.5">{note.updatedAt} · {note.folderPath}</p>
              </motion.button>
            ))}
          </AnimatePresence>
          {filteredNotes.length === 0 && <p className="text-sm text-warm-stone text-center py-8">No matching notes</p>}
        </div>

        {/* Right: detail */}
        <div className="zb-card min-h-[60vh] flex flex-col max-h-[80vh]">
          {activeNote ? (
            <NoteDetail key={activeNote.id} note={activeNote} errors={errors} />
          ) : (
            <p className="text-warm-stone text-sm m-auto">Select a note to view its content</p>
          )}
        </div>
      </div>

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onCreated={handleCreatedNote}
        folders={noteFolders}
      />
    </div>
  )
}
