import { useState } from 'react'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { Route, Routes, useLocation } from 'react-router-dom'
import App from '../App'
import Notes from './Notes'
import ClassificationForm from '../features/materials/ClassificationForm'
import { buildUploadJob } from '../features/materials/materialRules'
import {
  confirmMaterialClassification,
  processMaterialJob,
} from '../features/materials/mockMaterialProcessor'
import {
  applyNoteOrganization,
  applyNotePatch,
  undoLastNoteVersion,
} from '../features/materials/noteVersions'
import { createAppServices } from '../store/services'
import { AppProvider, useApp } from '../store/AppStore'
import { ApiError } from '../api/client'
import { renderStudentApp } from '../test/renderApp'

const clone = (value) => structuredClone(value)

const ABORT_ERROR = () => new DOMException('The operation was aborted.', 'AbortError')

const createDeferred = () => {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const waitForGate = (gate, signal) => {
  if (!gate) return Promise.resolve()
  if (signal?.aborted) return Promise.reject(ABORT_ERROR())
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(ABORT_ERROR())
    signal?.addEventListener('abort', onAbort, { once: true })
    gate.promise.then(resolve, reject).finally(() => signal?.removeEventListener('abort', onAbort))
  })
}

const makeNote = (overrides = {}) => ({
  id: 'n1',
  title: 'Calculus Workspace',
  materialType: 'class_note',
  examBoard: 'Cambridge International',
  subject: 'A-Level Math',
  chapter: 'Calculus',
  folderId: 'f-math-ch7',
  folderPath: 'A-Level Math / Ch7 Calculus',
  tags: ['calculus'],
  linkedTopics: ['calculus-extrema'],
  linkedErrors: ['e1'],
  source: 'typed',
  createdAt: '2026-08-01T08:00:00.000Z',
  updatedAt: '2026-08-01T08:00:00.000Z',
  content: [
    { t: 'p', v: 'Differentiate before finding stationary points.' },
    { t: 'p', v: 'Check every endpoint.' },
  ],
  aiSuggestions: [
    { id: 'suggest-tag', type: 'add_tag', tag: 'exam-ready', message: 'Add the exam-ready tag.' },
    { id: 'suggest-error', type: 'link_error', errorId: 'e2', message: 'Link the related sign error.' },
  ],
  versions: [],
  version: 1,
  ...overrides,
})

const errors = [
  { id: 'e1', questionSummary: 'Differentiate f(x) before finding extrema', status: 'pending_review' },
  { id: 'e2', questionSummary: 'Keep the negative sign in the derivative', status: 'reviewing' },
]

const noteFolders = [
  {
    id: 'f-math', name: 'A-Level Math', noteCount: 1,
    children: [{ id: 'f-math-ch7', name: 'Ch7 Calculus', parentId: 'f-math', noteCount: 1 }],
  },
  {
    id: 'f-ielts', name: 'IELTS', noteCount: 0,
    children: [{ id: 'f-ielts-read', name: 'Reading', parentId: 'f-ielts', noteCount: 0 }],
  },
]

const replaceById = (items, replacement) => items.map((item) => (
  item.id === replacement.id ? replacement : item
))

function createNotesApi({
  notes = [makeNote()],
  bootstrapGate,
  createGate,
  processGate,
  confirmGate,
  cancelGate,
  processFailures = 0,
  createFailures = 0,
  createDurableFailures = 0,
  processPlainFailures = 0,
  cancelFailures = 0,
  cancelNotFoundFailures = 0,
  cancelNonHttpNotFoundFailures = 0,
  updateFailures = 0,
  createIgnoresAbort = false,
  confirmIgnoresAbort = false,
  createNoteImpl,
  fixtureKey = 'alevel_handwritten_calculus_note',
} = {}) {
  const state = {
    notes: clone(notes),
    uploadJobs: [],
  }
  let failuresRemaining = processFailures
  let createFailuresRemaining = createFailures
  let createDurableFailuresRemaining = createDurableFailures
  let plainProcessFailuresRemaining = processPlainFailures
  let cancelFailuresRemaining = cancelFailures
  let cancelNotFoundFailuresRemaining = cancelNotFoundFailures
  let cancelNonHttpNotFoundFailuresRemaining = cancelNonHttpNotFoundFailures
  let updateFailuresRemaining = updateFailures

  const api = {
    state,
    bootstrap: vi.fn(async () => {
      await bootstrapGate?.promise
      return {
        tasks: [], taskAdjustments: [], errors: clone(errors), notes: clone(state.notes),
        uploadJobs: clone(state.uploadJobs), noteFolders: clone(noteFolders), settings: {}, sessions: {},
      }
    }),
    createNote: vi.fn(async (note) => {
      if (createNoteImpl) return createNoteImpl(note, state)
      state.notes = [clone(note), ...state.notes]
      return { note: clone(note) }
    }),
    createUploadJob: vi.fn(async (metadata, options = {}) => {
      if (createIgnoresAbort) await createGate?.promise
      else await waitForGate(createGate, options.signal)
      if (!createIgnoresAbort && options.signal?.aborted) throw ABORT_ERROR()
      if (createFailuresRemaining > 0) {
        createFailuresRemaining -= 1
        throw new Error('Upload network unavailable')
      }
      const job = buildUploadJob({
        file: { name: metadata.fileName, type: metadata.mimeType, size: metadata.size },
        materialType: metadata.materialType,
        examBoard: metadata.examBoard,
        subject: metadata.subject,
        chapter: metadata.chapter,
        id: metadata.id,
        createdAt: metadata.createdAt,
      })
      state.uploadJobs = [job, ...state.uploadJobs]
      if (createDurableFailuresRemaining > 0) {
        createDurableFailuresRemaining -= 1
        throw new Error('Upload response was lost')
      }
      return { job: clone(job) }
    }),
    processUploadJob: vi.fn(async (id, options = {}) => {
      const index = state.uploadJobs.findIndex((job) => job.id === id)
      if (index < 0) throw new Error('Upload not found')
      if (plainProcessFailuresRemaining > 0) {
        plainProcessFailuresRemaining -= 1
        throw new Error('Recognition network unavailable')
      }
      const current = state.uploadJobs[index]
      const { failure: _previousFailure, ...retryable } = current
      const processing = {
        ...retryable,
        status: 'processing',
        progress: 35,
      }
      state.uploadJobs = replaceById(state.uploadJobs, processing)
      await waitForGate(processGate, options.signal)
      if (options.signal?.aborted) throw ABORT_ERROR()
      if (state.uploadJobs.find((job) => job.id === id)?.status === 'cancelled') {
        const error = new Error('This upload was cancelled')
        error.code = 'UPLOAD_CANCELLED'
        throw error
      }
      if (failuresRemaining > 0) {
        failuresRemaining -= 1
        const failed = {
          ...processing,
          status: 'failed',
          failure: { code: 'OCR_FAILED', message: 'OCR failed. Try again.' },
        }
        state.uploadJobs = replaceById(state.uploadJobs, failed)
        const error = new Error(failed.failure.message)
        error.code = failed.failure.code
        error.job = clone(failed)
        throw error
      }
      const classified = processMaterialJob(processing, {
        fixtureKey,
      })
      state.uploadJobs = replaceById(state.uploadJobs, classified)
      return { job: clone(classified) }
    }),
    confirmUploadJob: vi.fn(async (id, patch, options = {}) => {
      if (confirmIgnoresAbort) await confirmGate?.promise
      else await waitForGate(confirmGate, options.signal)
      if (!confirmIgnoresAbort && options.signal?.aborted) throw ABORT_ERROR()
      const job = state.uploadJobs.find((item) => item.id === id)
      const confirmed = confirmMaterialClassification(job, patch)
      state.uploadJobs = replaceById(state.uploadJobs, confirmed.job)
      state.notes = [confirmed.note, ...state.notes]
      return clone(confirmed)
    }),
    cancelUploadJob: vi.fn(async (id) => {
      await cancelGate?.promise
      if (cancelFailuresRemaining > 0) {
        cancelFailuresRemaining -= 1
        throw new Error('Cancellation failed. Try again.')
      }
      if (cancelNotFoundFailuresRemaining > 0) {
        cancelNotFoundFailuresRemaining -= 1
        throw new ApiError('Upload not found', { status: 404, code: 'NOT_FOUND' })
      }
      if (cancelNonHttpNotFoundFailuresRemaining > 0) {
        cancelNonHttpNotFoundFailuresRemaining -= 1
        throw new ApiError('Upload not found', { status: 0, code: 'NOT_FOUND' })
      }
      const job = state.uploadJobs.find((item) => item.id === id)
      if (!job) throw new Error('Upload not found')
      const { result: _result, failure: _failure, ...metadata } = job
      const cancelled = { ...metadata, status: 'cancelled' }
      state.uploadJobs = replaceById(state.uploadJobs, cancelled)
      return { job: clone(cancelled) }
    }),
    updateNote: vi.fn(async (id, command) => {
      if (updateFailuresRemaining > 0) {
        updateFailuresRemaining -= 1
        throw new Error('Note update failed')
      }
      const { changedAt, reason, ...patch } = command
      const note = state.notes.find((item) => item.id === id)
      const updated = applyNotePatch(note, patch, { changedAt, reason })
      state.notes = replaceById(state.notes, updated)
      return { note: clone(updated) }
    }),
    organizeNote: vi.fn(async (id, suggestionIds, options = {}) => {
      const note = state.notes.find((item) => item.id === id)
      const updated = applyNoteOrganization(note, suggestionIds, options.changedAt)
      state.notes = replaceById(state.notes, updated)
      return { note: clone(updated) }
    }),
    undoNote: vi.fn(async (id, options = {}) => {
      const note = state.notes.find((item) => item.id === id)
      const updated = undoLastNoteVersion(note, options.changedAt)
      state.notes = replaceById(state.notes, updated)
      return { note: clone(updated) }
    }),
  }
  return api
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="current-route">{location.pathname}</div>
}

function renderNotes(api = createNotesApi(), route = '/notes') {
  let nextId = 0
  const services = createAppServices({
    apiClient: api,
    now: () => new Date('2026-08-06T10:00:00.000Z'),
    createId: () => `ui-id-${++nextId}`,
  })
  return {
    api,
    ...renderStudentApp(<><App services={services} /><LocationProbe /></>, { route }),
  }
}

function UploadJobsProbe() {
  const { uploadJobs } = useApp()
  return <output data-testid="upload-job-ids">{JSON.stringify(uploadJobs.map(({ id }) => id))}</output>
}

function renderNotesWithUploadProbe(api = createNotesApi(), route = '/notes') {
  let nextId = 0
  const services = createAppServices({
    apiClient: api,
    now: () => new Date('2026-08-06T10:00:00.000Z'),
    createId: () => `ui-id-${++nextId}`,
  })
  return renderStudentApp(
    <AppProvider services={services}>
      <Routes>
        <Route path="/notes" element={<><Notes /><LocationProbe /><UploadJobsProbe /></>} />
        <Route path="/notes/:id" element={<><Notes /><LocationProbe /><UploadJobsProbe /></>} />
      </Routes>
    </AppProvider>,
    { route },
  )
}

async function dismissUploadModal(method, user) {
  if (method === 'close button') {
    await user.click(screen.getByRole('button', { name: 'close' }))
  } else if (method === 'backdrop') {
    fireEvent.click(screen.getByRole('dialog').parentElement.firstElementChild)
  } else {
    fireEvent.keyDown(document, { key: 'Escape' })
  }
}

test('rejects oversized and unsupported files before creating an upload job', async () => {
  const api = createNotesApi()
  const user = userEvent.setup()
  renderNotes(api)

  await user.click(await screen.findByRole('button', { name: /Upload/i }))
  const input = screen.getByLabelText(/Select a note file/i)
  const oversized = new File(['x'], 'large.pdf', { type: 'application/pdf' })
  Object.defineProperty(oversized, 'size', { value: 20 * 1024 * 1024 + 1 })
  await user.upload(input, oversized)
  expect(screen.getByRole('alert')).toHaveTextContent('File must be 20 MB or smaller')

  const unsupported = new File(['payload'], 'notes.exe', { type: 'application/x-msdownload' })
  fireEvent.change(input, { target: { files: [unsupported] } })
  expect(screen.getByRole('alert')).toHaveTextContent('Upload a PDF or image file')
  expect(api.createUploadJob).not.toHaveBeenCalled()
})

test('runs the handwritten demo with metadata only and persists edited classification', async () => {
  const api = createNotesApi()
  const user = userEvent.setup()
  renderNotes(api)

  await user.click(await screen.findByRole('button', { name: /Upload/i }))
  await user.selectOptions(screen.getByLabelText('Material type'), 'handwritten_draft')
  await user.click(screen.getByRole('button', { name: /Use handwritten demo/i }))

  expect(await screen.findByLabelText('Subject')).toHaveValue('A-Level Math')
  const [metadata] = api.createUploadJob.mock.calls[0]
  expect(metadata).toMatchObject({
    fileName: 'handwritten-notes-ch7.jpg',
    mimeType: 'image/jpeg',
    size: 524288,
    materialType: 'handwritten_draft',
  })
  expect(Object.keys(metadata).sort()).toEqual([
    'createdAt', 'fileName', 'id', 'materialType', 'mimeType', 'size',
  ])
  expect(JSON.stringify(metadata)).not.toMatch(/data:|base64|rawBytes|payload/i)

  await user.clear(screen.getByLabelText('Subject'))
  await user.type(screen.getByLabelText('Subject'), 'Advanced Mathematics')
  await user.clear(screen.getByLabelText('Chapter'))
  await user.type(screen.getByLabelText('Chapter'), 'Applications of Calculus')
  await user.selectOptions(screen.getByLabelText('Folder'), 'f-ielts-read')
  await user.click(screen.getByRole('button', { name: /Confirm and create note/i }))

  expect(await screen.findByText('Note created and classified')).toBeInTheDocument()
  expect(await screen.findByDisplayValue('Differentiation and Stationary Points')).toBeInTheDocument()
  expect(api.state.notes[0]).toMatchObject({
    subject: 'Advanced Mathematics',
    chapter: 'Applications of Calculus',
    folderId: 'f-ielts-read',
    folderPath: 'IELTS / Reading',
    sourceJobId: 'ui-id-1',
  })
  expect(JSON.stringify(api.state)).not.toMatch(/data:|base64|rawBytes/i)
})

test('shows a prefilled classification folder even when it is not in the current folder tree', async () => {
  const api = createNotesApi({ fixtureKey: 'ielts_reading_passage' })
  const user = userEvent.setup()
  renderNotes(api)

  await user.click(await screen.findByRole('button', { name: /Upload/i }))
  await user.selectOptions(screen.getByLabelText('Material type'), 'ielts_passage')
  await user.click(screen.getByRole('button', { name: /Use handwritten demo/i }))

  expect(await screen.findByLabelText('Folder')).toHaveValue('f-ielts-reading')
  expect(screen.getByRole('option', { name: 'IELTS / Reading (suggested)' })).toBeInTheDocument()
})

test('renders deterministic 0, 35, 75, and 100 upload stages only when lifecycle promises advance', async () => {
  const createGate = createDeferred()
  const processGate = createDeferred()
  const confirmGate = createDeferred()
  const api = createNotesApi({ createGate, processGate, confirmGate })
  const user = userEvent.setup()
  renderNotes(api)

  await user.click(await screen.findByRole('button', { name: /Upload/i }))
  await user.click(screen.getByRole('button', { name: /Use handwritten demo/i }))
  expect(screen.getByText('0%')).toBeInTheDocument()

  await act(async () => createGate.resolve())
  expect(await screen.findByText('35%')).toBeInTheDocument()
  expect(screen.queryByText('75%')).not.toBeInTheDocument()

  await act(async () => processGate.resolve())
  expect(await screen.findByText('75%')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /Confirm and create note/i }))
  expect(await screen.findByText('100%')).toBeInTheDocument()

  await act(async () => confirmGate.resolve())
  expect(await screen.findByText('Note created and classified')).toBeInTheDocument()
})

test('cancels an in-flight upload when the student closes the modal', async () => {
  const processGate = createDeferred()
  const api = createNotesApi({ processGate })
  const user = userEvent.setup()
  renderNotes(api)

  await user.click(await screen.findByRole('button', { name: /Upload/i }))
  await user.click(screen.getByRole('button', { name: /Use handwritten demo/i }))
  expect(await screen.findByText('35%')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /Cancel upload/i }))

  await waitFor(() => expect(api.cancelUploadJob).toHaveBeenCalledWith('ui-id-1', expect.anything()))
  expect(api.state.uploadJobs[0].status).toBe('cancelled')
  expect(api.state.notes).toHaveLength(1)
})

test('retries a failed classification job without creating a second job', async () => {
  const api = createNotesApi({ processFailures: 1 })
  const user = userEvent.setup()
  renderNotes(api)

  await user.click(await screen.findByRole('button', { name: /Upload/i }))
  await user.click(screen.getByRole('button', { name: /Use handwritten demo/i }))
  expect(await screen.findByRole('alert')).toHaveTextContent('OCR failed. Try again.')
  expect(api.state.uploadJobs[0].status).toBe('failed')

  await user.click(screen.getByRole('button', { name: /Retry/i }))
  expect(await screen.findByLabelText('Subject')).toHaveValue('A-Level Math')
  expect(api.createUploadJob).toHaveBeenCalledTimes(1)
  expect(api.processUploadJob).toHaveBeenCalledTimes(2)
})

test('aborts an in-flight upload and durably cancels its job when Notes unmounts', async () => {
  const processGate = createDeferred()
  const api = createNotesApi({ processGate })
  const user = userEvent.setup()
  const view = renderNotes(api)

  await user.click(await screen.findByRole('button', { name: /Upload/i }))
  await user.click(screen.getByRole('button', { name: /Use handwritten demo/i }))
  await waitFor(() => expect(api.processUploadJob).toHaveBeenCalledTimes(1))
  const signal = api.processUploadJob.mock.calls[0][1].signal
  view.unmount()

  expect(signal.aborted).toBe(true)
  await waitFor(() => expect(api.cancelUploadJob).toHaveBeenCalled())
  expect(api.state.uploadJobs[0].status).toBe('cancelled')
})

test('persists title, tags, content, and working toolbar transformations', async () => {
  const api = createNotesApi()
  const user = userEvent.setup()
  renderNotes(api, '/notes/n1')

  const title = await screen.findByLabelText('Note title')
  await user.clear(title)
  await user.type(title, 'Revised Calculus Workspace')
  await user.tab()
  await waitFor(() => expect(api.state.notes[0].title).toBe('Revised Calculus Workspace'))

  const tags = screen.getByLabelText('Tags')
  await user.clear(tags)
  await user.type(tags, 'revision, derivatives')
  await user.tab()
  await waitFor(() => expect(api.state.notes[0].tags).toEqual(['revision', 'derivatives']))

  const paragraph = screen.getByLabelText('Edit paragraph 1')
  await user.clear(paragraph)
  await user.type(paragraph, 'Use the second derivative test.')
  await user.tab()
  await waitFor(() => expect(api.state.notes[0].content[0].v).toBe('Use the second derivative test.'))

  await waitFor(() => expect(screen.getByRole('button', { name: 'Bold' })).toBeEnabled())
  await user.click(screen.getByLabelText('Edit paragraph 1'))
  await user.click(screen.getByRole('button', { name: 'Bold' }))
  await waitFor(() => expect(api.state.notes[0].content[0].v).toBe('**Use the second derivative test.**'))
  await waitFor(() => expect(screen.getByRole('button', { name: 'List' })).toBeEnabled())
  await user.click(screen.getByRole('button', { name: 'List' }))
  await waitFor(() => expect(api.state.notes[0].content[0].t).toBe('list'))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Formula' })).toBeEnabled())
  await user.click(screen.getByRole('button', { name: 'Formula' }))
  await waitFor(() => expect(api.state.notes[0].content[0].t).toBe('formula'))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Highlight' })).toBeEnabled())
  await user.click(screen.getByRole('button', { name: 'Highlight' }))
  await waitFor(() => expect(api.state.notes[0].content[0].t).toBe('highlight'))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Image' })).toBeEnabled())
  await user.click(screen.getByRole('button', { name: 'Image' }))
  await waitFor(() => expect(api.state.notes[0].content.at(-1)).toMatchObject({
    t: 'image', alt: 'Study image', reference: expect.stringMatching(/^object:\/\//),
  }))
  expect(JSON.stringify(api.state.notes[0])).not.toMatch(/data:|base64/i)
})

test('targets the last paragraph when no content block has been selected', async () => {
  const api = createNotesApi({
    notes: [makeNote({
      content: [
        { t: 'p', v: 'Paragraph target' },
        { t: 'formula', v: 'f(x) = x²' },
      ],
    })],
  })
  const user = userEvent.setup()
  renderNotes(api, '/notes/n1')

  await user.click(await screen.findByRole('button', { name: 'Bold' }))
  await waitFor(() => expect(api.state.notes[0].content[0].v).toBe('**Paragraph target**'))
  expect(api.state.notes[0].content[1]).toEqual({ t: 'formula', v: 'f(x) = x²' })
})

test('organizes only selected stable suggestions, undoes, shows history, and survives reload', async () => {
  const api = createNotesApi()
  const user = userEvent.setup()
  const firstView = renderNotes(api, '/notes/n1')

  const tagSuggestion = await screen.findByRole('checkbox', { name: /Add the exam-ready tag/i })
  const errorSuggestion = screen.getByRole('checkbox', { name: /Link the related sign error/i })
  expect(tagSuggestion).toBeChecked()
  expect(errorSuggestion).toBeChecked()
  await user.click(errorSuggestion)
  await user.click(screen.getByRole('button', { name: /One-click organise/i }))

  await waitFor(() => expect(api.state.notes[0].tags).toContain('exam-ready'))
  expect(api.state.notes[0].linkedErrors).not.toContain('e2')
  expect(api.organizeNote).toHaveBeenCalledWith('n1', ['suggest-tag'], expect.anything())
  expect(screen.getByText(/Version history \(1\)/i)).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: /Undo last change/i }))
  expect(await screen.findByText('Restored version 1')).toBeInTheDocument()
  await waitFor(() => expect(api.state.notes[0].tags).toEqual(['calculus']))
  expect(api.state.notes[0]).toMatchObject({ version: 3 })
  expect(api.state.notes[0].versions).toHaveLength(2)

  firstView.unmount()
  renderNotes(api, '/notes/n1')
  expect(await screen.findByLabelText('Tags')).toHaveValue('calculus')
  expect(screen.getByText(/Version history \(2\)/i)).toBeInTheDocument()
})

test('keeps undo available for ordinary edits when a note has no AI suggestions', async () => {
  const api = createNotesApi({ notes: [makeNote({ aiSuggestions: [] })] })
  const user = userEvent.setup()
  renderNotes(api, '/notes/n1')

  const title = await screen.findByLabelText('Note title')
  await user.clear(title)
  await user.type(title, 'Temporary title')
  await user.tab()
  await waitFor(() => expect(api.state.notes[0].title).toBe('Temporary title'))

  await user.click(await screen.findByRole('button', { name: /Undo last change/i }))
  expect(await screen.findByText('Restored version 1')).toBeInTheDocument()
  await waitFor(() => expect(screen.getByLabelText('Note title')).toHaveValue('Calculus Workspace'))
})

test('searches case-insensitively across title, tags, content, material type, exam board, and chapter', async () => {
  const notes = [
    makeNote({ id: 'title-note', title: 'Unique Title Match' }),
    makeNote({ id: 'tag-note', title: 'Tag result', tags: ['RareTag'] }),
    makeNote({ id: 'content-note', title: 'Content result', content: [{ t: 'p', v: 'Hidden searchable phrase' }] }),
    makeNote({ id: 'type-note', title: 'Type result', materialType: 'mark_scheme' }),
    makeNote({ id: 'board-note', title: 'Board result', examBoard: 'Pearson Edexcel' }),
    makeNote({ id: 'chapter-note', title: 'Chapter result', chapter: 'Integration Techniques' }),
  ]
  const user = userEvent.setup()
  renderNotes(createNotesApi({ notes }))
  const search = await screen.findByPlaceholderText(/Search notes/i)

  const cases = [
    ['unique title', 'Unique Title Match'],
    ['raretag', 'Tag result'],
    ['SEARCHABLE PHRASE', 'Content result'],
    ['MARK_SCHEME', 'Type result'],
    ['Mark Scheme', 'Type result'],
    ['edexcel', 'Board result'],
    ['integration techniques', 'Chapter result'],
  ]
  for (const [query, title] of cases) {
    await user.clear(search)
    await user.type(search, query)
    expect(screen.getByRole('button', { name: new RegExp(title, 'i') })).toBeInTheDocument()
  }
})

test('normalizes material type display labels and underscore-space variants to one unique search result', async () => {
  const api = createNotesApi({ notes: [
    makeNote({ id: 'scheme-note', title: 'Unique scheme result', materialType: 'mark_scheme' }),
    makeNote({ id: 'other-note', title: 'Unrelated result', materialType: 'class_note' }),
  ] })
  const user = userEvent.setup()
  renderNotes(api)
  const search = await screen.findByPlaceholderText(/Search notes/i)

  await user.type(search, 'Mark Scheme')
  expect(screen.getByRole('button', { name: /Unique scheme result/i })).toBeInTheDocument()
  await waitFor(() => expect(screen.queryByRole('button', { name: /Unrelated result/i })).not.toBeInTheDocument())
  await user.clear(search)
  await user.type(search, 'mark_scheme')
  expect(screen.getByRole('button', { name: /Unique scheme result/i })).toBeInTheDocument()
  await waitFor(() => expect(screen.queryByRole('button', { name: /Unrelated result/i })).not.toBeInTheDocument())
})

test('shows linked error records from the AppStore', async () => {
  renderNotes(createNotesApi(), '/notes/n1')
  expect(await screen.findByText('Differentiate f(x) before finding extrema')).toBeInTheDocument()
  expect(screen.getByText(/Linked errors \(1\)/i)).toBeInTheDocument()
})

test('selects a newly created note after its asynchronous id resolves outside the active filter', async () => {
  const createGate = createDeferred()
  const api = createNotesApi({
    notes: [makeNote({ id: 'existing-note', title: 'Existing note', folderId: 'f-ielts-read', folderPath: 'IELTS / Reading' })],
    createNoteImpl: async (note, state) => {
      await createGate.promise
      const persisted = { ...note, id: 'server-note', title: 'Persisted note' }
      state.notes = [persisted, ...state.notes.filter((item) => item.id !== note.id)]
      return { note: persisted }
    },
  })
  const user = userEvent.setup()
  renderNotes(api, '/notes/existing-note')
  expect(await screen.findByDisplayValue('Existing note')).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: /^Reading\s+0$/i }))
  await user.click(screen.getByRole('button', { name: /New note/i }))
  expect(screen.getByDisplayValue('Existing note')).toBeInTheDocument()

  await act(async () => createGate.resolve())
  expect(await screen.findByDisplayValue('Persisted note')).toBeInTheDocument()
  expect(screen.getByTestId('current-route')).toHaveTextContent('/notes/server-note')
})

test('temporarily displays an uploaded note outside the active folder on a parameterized route', async () => {
  const api = createNotesApi({
    notes: [makeNote({
      id: 'reading-note',
      title: 'Existing reading note',
      folderId: 'f-ielts-read',
      folderPath: 'IELTS / Reading',
    })],
  })
  const user = userEvent.setup()
  renderNotes(api, '/notes/reading-note')

  await user.click(await screen.findByRole('button', { name: /^Reading\s+0$/i }))
  await user.click(screen.getByRole('button', { name: /Upload/i }))
  await user.click(screen.getByRole('button', { name: /Use handwritten demo/i }))
  await screen.findByLabelText('Subject')
  await user.click(screen.getByRole('button', { name: /Confirm and create note/i }))

  expect(await screen.findByDisplayValue('Differentiation and Stationary Points')).toBeInTheDocument()
  const uploaded = api.state.notes.find(({ sourceJobId }) => sourceJobId === 'ui-id-1')
  expect(uploaded).toBeDefined()
  expect(screen.getByTestId('current-route')).toHaveTextContent(`/notes/${uploaded.id}`)
  expect(screen.queryByRole('button', { name: /Differentiation and Stationary Points/i })).not.toBeInTheDocument()
})

test('keeps the detail pane and parameterized route inside the user-selected folder and search result', async () => {
  const notes = [
    makeNote({ id: 'math-note', title: 'Math route note' }),
    makeNote({
      id: 'reading-note',
      title: 'Reading route note',
      folderId: 'f-ielts-read',
      folderPath: 'IELTS / Reading',
      subject: 'IELTS',
    }),
  ]
  const user = userEvent.setup()
  renderNotes(createNotesApi({ notes }), '/notes/math-note')
  expect(await screen.findByDisplayValue('Math route note')).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: /^Reading\s+0$/i }))
  expect(await screen.findByDisplayValue('Reading route note')).toBeInTheDocument()
  expect(screen.getByTestId('current-route')).toHaveTextContent('/notes/reading-note')

  await user.type(screen.getByPlaceholderText(/Search notes/i), 'no result in reading')
  expect(await screen.findByText('No matching notes')).toBeInTheDocument()
  expect(screen.getByText('Select a note to view its content')).toBeInTheDocument()
  expect(screen.getByTestId('current-route')).toHaveTextContent('/notes')
})

test('normalizes an unknown parameterized note route instead of showing another note under it', async () => {
  renderNotes(createNotesApi({
    notes: [makeNote({ id: 'known-note', title: 'Known route note' })],
  }), '/notes/missing-note')

  await waitFor(() => expect(screen.getByTestId('current-route')).toHaveTextContent(/^\/notes$/))
  expect(await screen.findByDisplayValue('Known route note')).toBeInTheDocument()
})

test('preserves a valid non-first deep link until delayed bootstrap resolves', async () => {
  const bootstrapGate = createDeferred()
  const api = createNotesApi({
    bootstrapGate,
    notes: [
      makeNote({ id: 'first-note', title: 'First boot note' }),
      makeNote({ id: 'target-note', title: 'Target boot note' }),
    ],
  })
  renderNotesWithUploadProbe(api, '/notes/target-note')

  await waitFor(() => expect(api.bootstrap).toHaveBeenCalledTimes(1))
  expect(screen.getByTestId('current-route')).toHaveTextContent('/notes/target-note')
  expect(screen.queryByLabelText('Note title')).not.toBeInTheDocument()
  expect(screen.queryByDisplayValue('First boot note')).not.toBeInTheDocument()

  await act(async () => bootstrapGate.resolve())
  expect(await screen.findByDisplayValue('Target boot note')).toBeInTheDocument()
  expect(screen.getByTestId('current-route')).toHaveTextContent('/notes/target-note')
  expect(screen.queryByDisplayValue('First boot note')).not.toBeInTheDocument()
})

test('waits for delayed bootstrap before normalizing an unknown deep link', async () => {
  const bootstrapGate = createDeferred()
  const api = createNotesApi({
    bootstrapGate,
    notes: [makeNote({ id: 'known-note', title: 'Known delayed note' })],
  })
  renderNotesWithUploadProbe(api, '/notes/missing-note')

  await waitFor(() => expect(api.bootstrap).toHaveBeenCalledTimes(1))
  expect(screen.getByTestId('current-route')).toHaveTextContent('/notes/missing-note')
  expect(screen.queryByLabelText('Note title')).not.toBeInTheDocument()

  await act(async () => bootstrapGate.resolve())
  await waitFor(() => expect(screen.getByTestId('current-route')).toHaveTextContent(/^\/notes$/))
  expect(await screen.findByDisplayValue('Known delayed note')).toBeInTheDocument()
})

test('selects the first note after delayed bootstrap on the unparameterized route', async () => {
  const bootstrapGate = createDeferred()
  const api = createNotesApi({
    bootstrapGate,
    notes: [
      makeNote({ id: 'first-note', title: 'First delayed note' }),
      makeNote({ id: 'second-note', title: 'Second delayed note' }),
    ],
  })
  renderNotesWithUploadProbe(api)

  await waitFor(() => expect(api.bootstrap).toHaveBeenCalledTimes(1))
  expect(screen.getByTestId('current-route')).toHaveTextContent(/^\/notes$/)
  expect(screen.queryByLabelText('Note title')).not.toBeInTheDocument()

  await act(async () => bootstrapGate.resolve())
  expect(await screen.findByDisplayValue('First delayed note')).toBeInTheDocument()
  expect(screen.getByTestId('current-route')).toHaveTextContent(/^\/notes$/)
})

test('selects the first remaining search match when an edited active title drops out', async () => {
  const notes = [
    makeNote({ id: 'needle-a', title: 'Needle alpha', content: [{ t: 'p', v: 'Alpha body' }] }),
    makeNote({ id: 'needle-b', title: 'Needle beta', content: [{ t: 'p', v: 'Beta body' }] }),
  ]
  const api = createNotesApi({ notes })
  const user = userEvent.setup()
  renderNotes(api, '/notes/needle-a')

  await user.type(await screen.findByPlaceholderText(/Search notes/i), 'needle')
  await user.click(screen.getByRole('button', { name: /Needle beta/i }))
  await waitFor(() => expect(screen.getByTestId('current-route')).toHaveTextContent('/notes/needle-b'))

  const title = screen.getByLabelText('Note title')
  await user.clear(title)
  await user.type(title, 'Dropped beta')
  await user.tab()

  await waitFor(() => expect(api.state.notes.find(({ id }) => id === 'needle-b')?.title).toBe('Dropped beta'))
  expect(await screen.findByDisplayValue('Needle alpha')).toBeInTheDocument()
  expect(screen.getByTestId('current-route')).toHaveTextContent('/notes/needle-a')
  expect(screen.queryByDisplayValue('Dropped beta')).not.toBeInTheDocument()
})

test('clears list, detail, and route when the only search match is edited out', async () => {
  const notes = [
    makeNote({ id: 'first-note', title: 'First note', tags: ['unique'], content: [{ t: 'p', v: 'First body' }] }),
    makeNote({ id: 'solo-note', title: 'Solo note', tags: ['unique'], content: [{ t: 'p', v: 'Solo body' }] }),
  ]
  const api = createNotesApi({ notes })
  const user = userEvent.setup()
  renderNotes(api, '/notes/first-note')

  await user.type(await screen.findByPlaceholderText(/Search notes/i), 'unique')
  const firstTags = screen.getByLabelText('Tags')
  await user.clear(firstTags)
  await user.type(firstTags, 'first')
  await user.tab()
  await waitFor(() => expect(screen.getByTestId('current-route')).toHaveTextContent('/notes/solo-note'))
  const soloTags = await screen.findByLabelText('Tags')
  await user.clear(soloTags)
  await user.type(soloTags, 'solo')
  await user.tab()

  await waitFor(() => expect(api.state.notes.find(({ id }) => id === 'solo-note')?.tags).toEqual(['solo']))
  expect(await screen.findByText('No matching notes')).toBeInTheDocument()
  expect(screen.getByText('Select a note to view its content')).toBeInTheDocument()
  expect(screen.getByTestId('current-route')).toHaveTextContent(/^\/notes$/)
  expect(screen.queryByDisplayValue('Solo note')).not.toBeInTheDocument()
})

test('selects the remaining folder note when undo moves the active note out of that folder', async () => {
  const moved = applyNotePatch(makeNote({
    id: 'moved-note',
    title: 'Moved note',
    folderId: 'f-math-ch7',
    folderPath: 'A-Level Math / Ch7 Calculus',
  }), {
    folderId: 'f-ielts-read',
    folderPath: 'IELTS / Reading',
  }, {
    changedAt: '2026-08-02T08:00:00.000Z',
    reason: 'move',
  })
  const remaining = makeNote({
    id: 'remaining-note',
    title: 'Reading remaining',
    folderId: 'f-ielts-read',
    folderPath: 'IELTS / Reading',
  })
  const api = createNotesApi({ notes: [remaining, moved] })
  const user = userEvent.setup()
  renderNotes(api, '/notes/remaining-note')

  await user.click(await screen.findByRole('button', { name: /^Reading\s+0$/i }))
  await user.click(screen.getByRole('button', { name: /Moved note/i }))
  await waitFor(() => expect(screen.getByTestId('current-route')).toHaveTextContent('/notes/moved-note'))
  await user.click(screen.getByRole('button', { name: /Undo last change/i }))

  await waitFor(() => expect(api.state.notes.find(({ id }) => id === 'moved-note')?.folderId).toBe('f-math-ch7'))
  expect(await screen.findByDisplayValue('Reading remaining')).toBeInTheDocument()
  expect(screen.getByTestId('current-route')).toHaveTextContent('/notes/remaining-note')
  expect(screen.queryByDisplayValue('Moved note')).not.toBeInTheDocument()
})

test('retains metadata and offers same-id retry, reselect, and cancel after plain create failure', async () => {
  const api = createNotesApi({ createFailures: 1 })
  const user = userEvent.setup()
  renderNotes(api)

  await user.click(await screen.findByRole('button', { name: /Upload/i }))
  await user.click(screen.getByRole('button', { name: /Use handwritten demo/i }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Upload network unavailable')
  expect(screen.getByText('handwritten-notes-ch7.jpg')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Retry upload/i })).toBeInTheDocument()
  expect(screen.getByText(/Choose another file/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Cancel upload/i })).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: /Retry upload/i }))
  expect(await screen.findByLabelText('Subject')).toHaveValue('A-Level Math')
  expect(api.createUploadJob).toHaveBeenCalledTimes(2)
  expect(api.createUploadJob.mock.calls[1][0].id).toBe(api.createUploadJob.mock.calls[0][0].id)
  expect(api.state.uploadJobs).toHaveLength(1)
})

test('awaits one durable cancellation before choosing another file after an ambiguous create', async () => {
  const cancelGate = createDeferred()
  const api = createNotesApi({ createDurableFailures: 1, cancelGate })
  const user = userEvent.setup()
  renderNotes(api)

  await user.click(await screen.findByRole('button', { name: /Upload/i }))
  await user.click(screen.getByRole('button', { name: /Use handwritten demo/i }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Upload response was lost')
  expect(api.state.uploadJobs[0]).toMatchObject({ id: 'ui-id-1', status: 'queued' })

  const chooseAnother = screen.getByRole('button', { name: /Choose another file/i })
  fireEvent.click(chooseAnother)
  fireEvent.click(chooseAnother)
  await waitFor(() => expect(api.cancelUploadJob).toHaveBeenCalledTimes(1))
  expect(api.cancelUploadJob).toHaveBeenCalledWith('ui-id-1', {})
  expect(screen.getByText('handwritten-notes-ch7.jpg')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Use handwritten demo/i })).not.toBeInTheDocument()

  await act(async () => cancelGate.resolve())
  expect(await screen.findByRole('button', { name: /Use handwritten demo/i })).toBeInTheDocument()
  expect(api.state.uploadJobs[0]).toMatchObject({ id: 'ui-id-1', status: 'cancelled' })

  await user.click(screen.getByRole('button', { name: /Use handwritten demo/i }))
  expect(await screen.findByLabelText('Subject')).toHaveValue('A-Level Math')
  expect(api.createUploadJob.mock.calls.map(([metadata]) => metadata.id)).toEqual(['ui-id-1', 'ui-id-2'])
})

test('keeps the ambiguous create recoverable when choose-another cancellation fails', async () => {
  const api = createNotesApi({ createDurableFailures: 1, cancelFailures: 1 })
  const user = userEvent.setup()
  renderNotes(api)

  await user.click(await screen.findByRole('button', { name: /Upload/i }))
  await user.click(screen.getByRole('button', { name: /Use handwritten demo/i }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Upload response was lost')
  await user.click(screen.getByRole('button', { name: /Choose another file/i }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Cancellation failed. Try again.')
  expect(screen.getByText('handwritten-notes-ch7.jpg')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Choose another file/i })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Use handwritten demo/i })).not.toBeInTheDocument()
  expect(api.state.uploadJobs[0]).toMatchObject({ id: 'ui-id-1', status: 'queued' })

  await user.click(screen.getByRole('button', { name: /Choose another file/i }))
  expect(await screen.findByRole('button', { name: /Use handwritten demo/i })).toBeInTheDocument()
  expect(api.cancelUploadJob).toHaveBeenCalledTimes(2)
  expect(api.state.uploadJobs[0]).toMatchObject({ id: 'ui-id-1', status: 'cancelled' })
})

test('accepts exact NOT_FOUND as durable cleanup before choosing another file', async () => {
  const api = createNotesApi({ createDurableFailures: 1, cancelNotFoundFailures: 1 })
  const user = userEvent.setup()
  renderNotes(api)

  await user.click(await screen.findByRole('button', { name: /Upload/i }))
  await user.click(screen.getByRole('button', { name: /Use handwritten demo/i }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Upload response was lost')
  await user.click(screen.getByRole('button', { name: /Choose another file/i }))

  expect(await screen.findByRole('button', { name: /Use handwritten demo/i })).toBeInTheDocument()
  expect(api.cancelUploadJob).toHaveBeenCalledWith('ui-id-1', {})
  expect(screen.queryByText('Upload not found')).not.toBeInTheDocument()
})

test('offers recognition retry after a plain process failure leaves the known job queued', async () => {
  const api = createNotesApi({ processPlainFailures: 1 })
  const user = userEvent.setup()
  renderNotes(api)

  await user.click(await screen.findByRole('button', { name: /Upload/i }))
  await user.click(screen.getByRole('button', { name: /Use handwritten demo/i }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Recognition network unavailable')
  expect(api.state.uploadJobs[0].status).toBe('queued')

  await user.click(screen.getByRole('button', { name: /Retry recognition/i }))
  expect(await screen.findByLabelText('Subject')).toHaveValue('A-Level Math')
  expect(api.createUploadJob).toHaveBeenCalledTimes(1)
  expect(api.processUploadJob).toHaveBeenCalledTimes(2)
})

test('keeps a known upload recoverable when durable cancellation fails, then closes after retry succeeds', async () => {
  const processGate = createDeferred()
  const api = createNotesApi({ processGate, cancelFailures: 1 })
  const user = userEvent.setup()
  renderNotes(api)

  await user.click(await screen.findByRole('button', { name: /Upload/i }))
  await user.click(screen.getByRole('button', { name: /Use handwritten demo/i }))
  expect(await screen.findByText('35%')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /Cancel upload/i }))

  expect(await screen.findByRole('dialog')).toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('Cancellation failed. Try again.')
  expect(api.state.uploadJobs[0].status).not.toBe('cancelled')

  await user.click(screen.getByRole('button', { name: /Cancel upload/i }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(api.state.uploadJobs[0].status).toBe('cancelled')
})

test('removes a known local upload after canonical cancellation 404, then closes the modal', async () => {
  const processGate = createDeferred()
  const api = createNotesApi({ processGate, cancelNotFoundFailures: 1 })
  const user = userEvent.setup()
  renderNotesWithUploadProbe(api)

  await user.click(await screen.findByRole('button', { name: /Upload/i }))
  await user.click(screen.getByRole('button', { name: /Use handwritten demo/i }))
  expect(await screen.findByText('35%')).toBeInTheDocument()
  expect(screen.getByTestId('upload-job-ids')).toHaveTextContent('ui-id-1')
  await user.click(screen.getByRole('button', { name: /Cancel upload/i }))

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(screen.getByTestId('upload-job-ids')).toHaveTextContent('[]')
})

test('keeps a known upload recoverable when NOT_FOUND is not an HTTP 404', async () => {
  const processGate = createDeferred()
  const api = createNotesApi({ processGate, cancelNonHttpNotFoundFailures: 1 })
  const user = userEvent.setup()
  renderNotesWithUploadProbe(api)

  await user.click(await screen.findByRole('button', { name: /Upload/i }))
  await user.click(screen.getByRole('button', { name: /Use handwritten demo/i }))
  expect(await screen.findByText('35%')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /Cancel upload/i }))

  expect(await screen.findByRole('dialog')).toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('Upload not found')
  expect(screen.getByTestId('upload-job-ids')).toHaveTextContent('ui-id-1')

  await user.click(screen.getByRole('button', { name: /Cancel upload/i }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})

test('waits for ignored-abort create to land, then compensates its reserved id before closing', async () => {
  const createGate = createDeferred()
  const api = createNotesApi({ createGate, createIgnoresAbort: true })
  const user = userEvent.setup()
  renderNotes(api)

  await user.click(await screen.findByRole('button', { name: /Upload/i }))
  await user.click(screen.getByRole('button', { name: /Use handwritten demo/i }))
  await waitFor(() => expect(api.createUploadJob).toHaveBeenCalledTimes(1))
  await user.click(screen.getByRole('button', { name: 'close' }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()

  await act(async () => createGate.resolve())
  await waitFor(() => expect(api.cancelUploadJob).toHaveBeenCalledWith('ui-id-1', {}))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(api.state.uploadJobs).toHaveLength(1)
  expect(api.state.uploadJobs[0].status).toBe('cancelled')
  expect(api.createUploadJob.mock.calls[0][1].signal).toBeUndefined()
  expect(screen.queryByText(/Unable to cancel/i)).not.toBeInTheDocument()
})

test('compensates a server-wins create after Notes unmounts without leaving a queued orphan', async () => {
  const createGate = createDeferred()
  const api = createNotesApi({ createGate, createIgnoresAbort: true })
  const user = userEvent.setup()
  const view = renderNotes(api)

  await user.click(await screen.findByRole('button', { name: /Upload/i }))
  await user.click(screen.getByRole('button', { name: /Use handwritten demo/i }))
  await waitFor(() => expect(api.createUploadJob).toHaveBeenCalledTimes(1))
  view.unmount()
  await act(async () => createGate.resolve())

  await waitFor(() => expect(api.cancelUploadJob).toHaveBeenCalledWith('ui-id-1', {}))
  expect(api.state.uploadJobs).toHaveLength(1)
  expect(api.state.uploadJobs[0].status).toBe('cancelled')
})

test.each(['close button', 'backdrop', 'Escape'])(
  'awaits durable cancellation before %s closes a known cancellable upload',
  async (method) => {
    const processGate = createDeferred()
    const cancelGate = createDeferred()
    const api = createNotesApi({ processGate, cancelGate })
    const user = userEvent.setup()
    renderNotes(api)

    await user.click(await screen.findByRole('button', { name: /Upload/i }))
    await user.click(screen.getByRole('button', { name: /Use handwritten demo/i }))
    expect(await screen.findByText('35%')).toBeInTheDocument()
    await dismissUploadModal(method, user)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await waitFor(() => expect(api.cancelUploadJob).toHaveBeenCalledTimes(1))

    await act(async () => cancelGate.resolve())
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.state.uploadJobs[0].status).toBe('cancelled')
  },
)

test.each(['close button', 'backdrop', 'Escape'])(
  'keeps server-wins confirmation commit-like when %s is requested',
  async (method) => {
    const confirmGate = createDeferred()
    const api = createNotesApi({ confirmGate, confirmIgnoresAbort: true })
    const user = userEvent.setup()
    renderNotes(api)

    await user.click(await screen.findByRole('button', { name: /Upload/i }))
    await user.click(screen.getByRole('button', { name: /Use handwritten demo/i }))
    await screen.findByLabelText('Subject')
    await user.click(screen.getByRole('button', { name: /Confirm and create note/i }))
    await waitFor(() => expect(api.confirmUploadJob).toHaveBeenCalledTimes(1))
    await dismissUploadModal(method, user)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(api.cancelUploadJob).not.toHaveBeenCalled()
    expect(api.confirmUploadJob.mock.calls[0][2].signal).toBeUndefined()
    await act(async () => confirmGate.resolve())
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.state.uploadJobs[0].status).toBe('completed')
    expect(api.state.notes).toHaveLength(2)
  },
)

test('reconciles an ignored-abort confirmation through bootstrap after Notes unmounts', async () => {
  const confirmGate = createDeferred()
  const api = createNotesApi({ confirmGate, confirmIgnoresAbort: true })
  const user = userEvent.setup()
  const firstView = renderNotes(api)

  await user.click(await screen.findByRole('button', { name: /Upload/i }))
  await user.click(screen.getByRole('button', { name: /Use handwritten demo/i }))
  await screen.findByLabelText('Subject')
  await user.click(screen.getByRole('button', { name: /Confirm and create note/i }))
  await waitFor(() => expect(api.confirmUploadJob).toHaveBeenCalledTimes(1))
  firstView.unmount()
  await act(async () => confirmGate.resolve())
  await waitFor(() => expect(api.state.notes).toHaveLength(2))
  expect(api.cancelUploadJob).not.toHaveBeenCalled()

  renderNotes(api, `/notes/${api.state.notes[0].id}`)
  expect(await screen.findByDisplayValue(api.state.notes[0].title)).toBeInTheDocument()
})

test.each([
  ['Bold', (note) => expect(note.content[0].v).toBe('**Draft typed immediately**')],
  ['List', (note) => expect(note.content[0]).toMatchObject({ t: 'list', v: 'Draft typed immediately' })],
  ['Formula', (note) => expect(note.content[0]).toMatchObject({ t: 'formula', v: 'Draft typed immediately' })],
  ['Highlight', (note) => expect(note.content[0]).toMatchObject({ t: 'highlight', v: 'Draft typed immediately' })],
  ['Image', (note) => {
    expect(note.content[0].v).toBe('Draft typed immediately')
    expect(note.content.at(-1)).toMatchObject({ t: 'image', reference: expect.stringMatching(/^object:\/\//) })
  }],
])('applies %s on the first realistic click while merging the latest focused body draft', async (action, assertion) => {
  const api = createNotesApi()
  const user = userEvent.setup({ delay: 1 })
  renderNotes(api, '/notes/n1')

  const paragraph = await screen.findByLabelText('Edit paragraph 1')
  await user.clear(paragraph)
  await user.type(paragraph, 'Draft typed immediately')
  await user.click(screen.getByRole('button', { name: action }))

  await waitFor(() => assertion(api.state.notes[0]))
  expect(api.updateNote).toHaveBeenCalledTimes(1)
})

test('flushes all dirty note fields before organizing and serializes the two writes', async () => {
  const api = createNotesApi()
  const user = userEvent.setup({ delay: 1 })
  renderNotes(api, '/notes/n1')
  fireEvent.change(await screen.findByLabelText('Note title'), { target: { value: 'Dirty title' } })
  fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'dirty, draft' } })
  fireEvent.change(screen.getByLabelText('Edit paragraph 1'), { target: { value: 'Dirty body' } })

  await user.click(screen.getByRole('button', { name: /One-click organise/i }))

  await waitFor(() => expect(api.organizeNote).toHaveBeenCalledTimes(1))
  expect(api.updateNote).toHaveBeenCalledTimes(1)
  expect(api.updateNote.mock.calls[0][1]).toMatchObject({
    title: 'Dirty title', tags: ['dirty', 'draft'], content: expect.arrayContaining([expect.objectContaining({ v: 'Dirty body' })]),
  })
  expect(api.updateNote.mock.invocationCallOrder[0]).toBeLessThan(api.organizeNote.mock.invocationCallOrder[0])
})

test('stops organization and rolls the draft back when its prerequisite flush fails', async () => {
  const api = createNotesApi({ updateFailures: 1 })
  const user = userEvent.setup({ delay: 1 })
  renderNotes(api, '/notes/n1')
  fireEvent.change(await screen.findByLabelText('Note title'), { target: { value: 'Unsaved title' } })
  fireEvent.change(screen.getByLabelText('Edit paragraph 1'), { target: { value: 'Unsaved body' } })

  await user.click(screen.getByRole('button', { name: /One-click organise/i }))

  await waitFor(() => expect(api.updateNote).toHaveBeenCalledTimes(1))
  expect(api.organizeNote).not.toHaveBeenCalled()
  expect(await screen.findByLabelText('Note title')).toHaveValue('Calculus Workspace')
  expect(screen.getByLabelText('Edit paragraph 1')).toHaveValue('Differentiate before finding stationary points.')
})

test('flushes a dirty body before undo and invokes undo only after the update commits', async () => {
  const versioned = applyNotePatch(makeNote(), { title: 'Version two' }, {
    changedAt: '2026-08-02T08:00:00.000Z', reason: 'edit',
  })
  const api = createNotesApi({ notes: [versioned] })
  const user = userEvent.setup({ delay: 1 })
  renderNotes(api, '/notes/n1')
  const paragraph = await screen.findByLabelText('Edit paragraph 1')
  await user.clear(paragraph)
  await user.type(paragraph, 'Dirty before undo')

  await user.click(screen.getByRole('button', { name: /Undo last change/i }))

  await waitFor(() => expect(api.undoNote).toHaveBeenCalledTimes(1))
  expect(api.updateNote).toHaveBeenCalledTimes(1)
  expect(api.updateNote.mock.invocationCallOrder[0]).toBeLessThan(api.undoNote.mock.invocationCallOrder[0])
  expect(await screen.findByText('Restored version 2')).toBeInTheDocument()
})

test('synchronizes an existing classification folder to the current canonical tree path after rename', async () => {
  const originalFolders = [{ id: 'root', name: 'Math', children: [{ id: 'chapter', name: 'Old chapter' }] }]
  const renamedFolders = [{ id: 'root', name: 'Maths', children: [{ id: 'chapter', name: 'Renamed chapter' }] }]
  function Harness() {
    const [folders, setFolders] = useState(originalFolders)
    const [value, setValue] = useState({
      materialType: 'class_note', examBoard: 'CAIE', subject: 'Math', chapter: 'Ch 1',
      folderId: 'chapter', folderPath: 'stale/path',
    })
    return (
      <>
        <ClassificationForm value={value} folders={folders} onChange={setValue} />
        <output aria-label="Canonical folder path">{value.folderPath}</output>
        <button type="button" onClick={() => setFolders(renamedFolders)}>Rename folders</button>
      </>
    )
  }
  const user = userEvent.setup()
  renderStudentApp(<Harness />)

  expect(await screen.findByLabelText('Canonical folder path')).toHaveTextContent('Math / Old chapter')
  await user.click(screen.getByRole('button', { name: 'Rename folders' }))
  expect(await screen.findByLabelText('Canonical folder path')).toHaveTextContent('Maths / Renamed chapter')
})

test('announces and focuses processing, classification, and failure upload transitions', async () => {
  const createGate = createDeferred()
  const processGate = createDeferred()
  const api = createNotesApi({ createGate, processGate })
  const user = userEvent.setup()
  const firstView = renderNotes(api)

  await user.click(await screen.findByRole('button', { name: /Upload/i }))
  await user.click(screen.getByRole('button', { name: /Use handwritten demo/i }))
  let status = await screen.findByRole('status', { name: /Upload status/i })
  expect(status).toHaveTextContent('Queued for recognition')
  expect(status).toHaveFocus()
  await act(async () => createGate.resolve())
  status = await screen.findByRole('status', { name: /Upload status/i })
  expect(status).toHaveTextContent('Recognising content')
  expect(status).toHaveFocus()
  await act(async () => processGate.resolve())
  status = await screen.findByRole('status', { name: /Upload status/i })
  expect(status).toHaveTextContent('Recognition complete')
  expect(status).toHaveFocus()

  const failedApi = createNotesApi({ processFailures: 1 })
  await user.click(screen.getByRole('button', { name: /Cancel upload/i }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  firstView.unmount()
  renderNotes(failedApi)
  await user.click(await screen.findByRole('button', { name: /Upload/i }))
  await user.click(await screen.findByRole('button', { name: /Use handwritten demo/i }))
  const failureStatus = await screen.findByRole('status', { name: /Upload status/i })
  expect(failureStatus).toHaveTextContent('Recognition failed')
  expect(failureStatus).toHaveFocus()
})
