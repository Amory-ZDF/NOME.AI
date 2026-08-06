# Student Module 4 — Notes and Learning Materials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Notes into a persistent learning-material workspace with validated uploads, deterministic Mock OCR/classification, editable organization, version history, and links to knowledge and errors.

**Architecture:** File metadata is validated and processed by a deterministic material pipeline; no raw file bytes enter localStorage. Pure note-version rules create reversible snapshots. API/store own upload jobs and notes, while the existing three-pane Notes layout remains intact.

**Tech Stack:** React 18.3.1, Vite 5.4.x, Vitest, React Testing Library, persistent repository from Module 0, diagnostics from Module 3.

## Global Constraints

- Modules 0–3 must already be pushed with green tests.
- Preserve the current three-pane Notes layout, typography, toolbar placement, and responsive behavior.
- Supported categories are class notes, teacher material, homework, past paper, mock paper, Mark Scheme, IELTS passage, writing/speaking material, handwritten draft, and error photo.
- Validate file type and maximum size of 20 MiB before creating a job.
- Mock OCR/classification is deterministic and test-controlled; do not use random progress or uncancelled timers.
- Persist metadata and extracted content only, never browser File objects or base64 file bodies.
- `Notes.jsx` may not import `mockData.js` after this module.
- Push only after targeted tests, full tests, build, browser flow, and visual checks pass.

---

### Task 1: Define material metadata and upload validation

**Files:**
- Create: `Student_Frontend/src/features/materials/materialRules.js`
- Create: `Student_Frontend/src/features/materials/materialRules.test.js`

**Interfaces:**
- Produces: `MATERIAL_TYPES` and `ALLOWED_FILE_TYPES`.
- Produces: `validateStudyFile({ name, type, size })`.
- Produces: `buildUploadJob({ file, materialType, examBoard, subject, chapter, id, createdAt })`.
- Job statuses: `queued`, `processing`, `needs_confirmation`, `completed`, `failed`, `cancelled`.

- [ ] **Step 1: Write failing validation and job tests**

```js
test('accepts images and PDFs up to 20 MiB', () => {
  expect(validateStudyFile({ name: 'paper.pdf', type: 'application/pdf', size: 20 * 1024 * 1024 })).toEqual({ valid: true })
  expect(validateStudyFile({ name: 'notes.jpg', type: 'image/jpeg', size: 1024 })).toEqual({ valid: true })
})

test('rejects unsupported or oversized files with exact messages', () => {
  expect(validateStudyFile({ name: 'notes.exe', type: 'application/x-msdownload', size: 10 })).toEqual({ valid: false, code: 'UNSUPPORTED_TYPE', message: 'Upload a PDF or image file' })
  expect(validateStudyFile({ name: 'paper.pdf', type: 'application/pdf', size: 20 * 1024 * 1024 + 1 })).toEqual({ valid: false, code: 'FILE_TOO_LARGE', message: 'File must be 20 MB or smaller' })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- --run src/features/materials/materialRules.test.js`

Expected: FAIL because material rules do not exist.

- [ ] **Step 3: Implement exact enums and job construction**

```js
export const MATERIAL_TYPES = [
  'class_note', 'teacher_material', 'homework', 'past_paper', 'mock_paper',
  'mark_scheme', 'ielts_passage', 'writing_speaking', 'handwritten_draft', 'error_photo',
]

export const ALLOWED_FILE_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'])
export const MAX_FILE_BYTES = 20 * 1024 * 1024
```

`buildUploadJob` stores only `fileName`, `mimeType`, `size`, selected metadata, timestamps, `progress: 0`, and `status: 'queued'`.

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- --run src/features/materials/materialRules.test.js`

Expected: all validation and job tests PASS.

```bash
git add Student_Frontend/src/features/materials/materialRules.js Student_Frontend/src/features/materials/materialRules.test.js
git commit -m "feat(student-materials): validate learning files"
```

### Task 2: Implement deterministic Mock OCR and classification

**Files:**
- Create: `Student_Frontend/src/data/materialFixtures.js`
- Create: `Student_Frontend/src/features/materials/mockMaterialProcessor.js`
- Create: `Student_Frontend/src/features/materials/mockMaterialProcessor.test.js`

**Interfaces:**
- Produces: `processMaterialJob(job, { fixtureKey })` returning a `needs_confirmation` job with `result`.
- Result fields: `suggestedTitle`, `materialType`, `examBoard`, `subject`, `chapter`, `folderId`, `folderPath`, `questionBlocks`, `answerBlocks`, `content`, `linkedTopics`, `linkedErrors`, and `confidence`.
- Produces: `confirmMaterialClassification(job, patch)` returning a completed job plus note draft.

- [ ] **Step 1: Write failing processor tests**

```js
test('extracts a deterministic Mark Scheme with split questions and answers', () => {
  const processed = processMaterialJob({ id: 'job-1', fileName: '9709_s22_ms_31.pdf', materialType: 'mark_scheme', status: 'processing' }, { fixtureKey: 'alevel_mark_scheme' })
  expect(processed).toMatchObject({ status: 'needs_confirmation', progress: 100 })
  expect(processed.result.questionBlocks.length).toBeGreaterThan(0)
  expect(processed.result.answerBlocks.length).toBeGreaterThan(0)
  expect(processed.result.examBoard).toBe('Cambridge International')
})

test('lets the student override a low-confidence classification', () => {
  const processedJob = processMaterialJob({ id: 'job-2', fileName: 'reading.png', materialType: 'ielts_passage', status: 'processing' }, { fixtureKey: 'ielts_reading_passage' })
  const { note } = confirmMaterialClassification(processedJob, { subject: 'IELTS Reading', folderId: 'f-ielts-reading', folderPath: 'IELTS / Reading' })
  expect(note).toMatchObject({ subject: 'IELTS Reading', folderId: 'f-ielts-reading' })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- --run src/features/materials/mockMaterialProcessor.test.js`

Expected: FAIL because the processor does not exist.

- [ ] **Step 3: Add concrete fixture results**

Create fixtures for: A-Level handwritten calculus note, A-Level past paper, Mark Scheme, IELTS Reading passage, homework, and error photo. Each fixture contains actual short content blocks and explicit classification metadata. Example fixture shape:

```js
export const MATERIAL_FIXTURES = {
  alevel_mark_scheme: {
    suggestedTitle: '9709/31 May/June 2022 Mark Scheme',
    materialType: 'mark_scheme',
    examBoard: 'Cambridge International',
    subject: 'A-Level Math',
    chapter: 'Calculus',
    folderId: 'f-math-ch7',
    folderPath: 'A-Level Math / Ch7 Calculus',
    questionBlocks: [{ id: 'qb-1', label: 'Question 1', text: 'Find the stationary points.' }],
    answerBlocks: [{ id: 'ab-1', questionId: 'qb-1', text: 'M1 differentiate; A1 solve f\'(x)=0.' }],
    content: [{ t: 'h', v: 'Question 1' }, { t: 'p', v: 'M1 differentiate; A1 solve f\'(x)=0.' }],
    linkedTopics: ['calculus-extrema'],
    linkedErrors: [],
    confidence: 0.94,
  },
}
```

- [ ] **Step 4: Implement pure processing and confirmation**

Clone fixtures before returning. `processMaterialJob` must not use timers, randomness, browser File APIs, or mutation. `confirmMaterialClassification` validates the patch and builds a note with `versions: []`, `version: 1`, `sourceJobId`, and `source` derived from material type.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- --run src/features/materials/mockMaterialProcessor.test.js`

Expected: all processing and override tests PASS.

```bash
git add Student_Frontend/src/data/materialFixtures.js Student_Frontend/src/features/materials/mockMaterialProcessor.js Student_Frontend/src/features/materials/mockMaterialProcessor.test.js
git commit -m "feat(student-materials): classify mock uploads"
```

### Task 3: Add reversible note versions and organization

**Files:**
- Create: `Student_Frontend/src/features/materials/noteVersions.js`
- Create: `Student_Frontend/src/features/materials/noteVersions.test.js`

**Interfaces:**
- Produces: `applyNotePatch(note, patch, { changedAt, reason })`.
- Produces: `applyNoteOrganization(note, suggestionIds, changedAt)`.
- Produces: `undoLastNoteVersion(note, changedAt)`.
- Version snapshot fields: `version`, `title`, `folderId`, `folderPath`, `tags`, `content`, `linkedTopics`, `linkedErrors`, `changedAt`, `reason`.

- [ ] **Step 1: Write failing version and undo tests**

```js
test('records an immutable previous version for a meaningful edit', () => {
  const next = applyNotePatch({ id: 'n1', version: 1, versions: [], title: 'Old', tags: [], content: [], linkedTopics: [], linkedErrors: [] }, { title: 'New' }, { changedAt: '2026-08-06T10:00:00Z', reason: 'title_edit' })
  expect(next).toMatchObject({ title: 'New', version: 2 })
  expect(next.versions[0]).toMatchObject({ version: 1, title: 'Old', reason: 'title_edit' })
})

test('undo restores the previous snapshot and records the undo', () => {
  const editedNote = applyNotePatch({ id: 'n1', version: 1, versions: [], title: 'Old', tags: [], content: [], linkedTopics: [], linkedErrors: [] }, { title: 'New' }, { changedAt: '2026-08-06T10:00:00Z', reason: 'title_edit' })
  const restored = undoLastNoteVersion(editedNote, '2026-08-06T10:01:00Z')
  expect(restored.title).toBe('Old')
  expect(restored.version).toBe(3)
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- --run src/features/materials/noteVersions.test.js`

Expected: FAIL because version rules do not exist.

- [ ] **Step 3: Implement snapshots, organization, and undo**

Do not create a version when the patch is structurally equal to the current values. `applyNoteOrganization` applies only selected suggestion ids, adds `organized`, updates topic/error links without duplicates, changes `source` to `ai_organized`, and records reason `ai_organize`. Undo restores the latest snapshot while retaining the full history.

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- --run src/features/materials/noteVersions.test.js`

Expected: all version tests PASS.

```bash
git add Student_Frontend/src/features/materials/noteVersions.js Student_Frontend/src/features/materials/noteVersions.test.js
git commit -m "feat(student-materials): version and undo notes"
```

### Task 4: Persist upload jobs and notes through API/store

**Files:**
- Modify: `Student_Frontend/src/api/index.js`
- Modify: `Student_Frontend/src/api/index.test.js`
- Modify: `Student_Frontend/src/store/AppStore.jsx`
- Modify: `Student_Frontend/src/store/AppStore.test.jsx`
- Modify: `Student_Frontend/API_INTERFACE.md`

**Interfaces:**
- API adds `listNotes()`, `createUploadJob(metadata)`, `processUploadJob(id)`, `confirmUploadJob(id, patch)`, `cancelUploadJob(id)`, `updateNote(id, patch)`, `organizeNote(id, suggestionIds)`, and `undoNote(id)`.
- Store adds `uploadJobs`, `startMaterialUpload`, `processMaterialUpload`, `confirmMaterialUpload`, `cancelMaterialUpload`, `updateNote`, `organizeNote`, and `undoNote`.

- [ ] **Step 1: Write failing job lifecycle and version persistence tests**

```js
test('persists queued, confirmation, and completed upload states', async () => {
  const queued = await createUploadJob({ id: 'job-1', fileName: 'notes.jpg', mimeType: 'image/jpeg', size: 1000, materialType: 'handwritten_draft' })
  expect(queued.job.status).toBe('queued')
  const processed = await processUploadJob('job-1')
  expect(processed.job.status).toBe('needs_confirmation')
  const completed = await confirmUploadJob('job-1', { subject: 'A-Level Math', folderId: 'f-math-ch7', folderPath: 'A-Level Math / Ch7 Calculus' })
  expect(completed).toMatchObject({ job: { status: 'completed' }, note: { sourceJobId: 'job-1' } })
})
```

- [ ] **Step 2: Implement repository-backed lifecycle and real routes**

Real endpoints:

```text
GET  /api/notes
POST /api/material-uploads
POST /api/material-uploads/{id}/process
POST /api/material-uploads/{id}/confirm
POST /api/material-uploads/{id}/cancel
PATCH /api/notes/{id}
POST /api/notes/{id}/organize
POST /api/notes/{id}/undo
```

Mock process selects a fixture using material type and file-name pattern. Jobs cancelled before confirmation cannot later complete and return `UPLOAD_CANCELLED`.

- [ ] **Step 3: Integrate store actions and cancellation safety**

Use pending keys `upload:create`, `upload:process:${id}`, `upload:confirm:${id}`, `note:update:${id}`, `note:organize:${id}`, and `note:undo:${id}`. Store only metadata. If the modal unmounts, cancel its AbortController and do not update local modal state after resolution.

- [ ] **Step 4: Update contract and run tests**

Document material type enums, 20 MiB rule, job states, classification result, note version fields, organize/undo endpoints, and the fact that raw bytes are handled by future object storage rather than bootstrap.

Run: `npm test -- --run src/api/index.test.js src/store/AppStore.test.jsx src/features/materials`

Expected: job, note, failure, rollback, and cancellation tests PASS.

- [ ] **Step 5: Commit API/store work**

```bash
git add Student_Frontend/src/api/index.js Student_Frontend/src/api/index.test.js Student_Frontend/src/store/AppStore.jsx Student_Frontend/src/store/AppStore.test.jsx Student_Frontend/API_INTERFACE.md
git commit -m "feat(student-materials): persist upload and note lifecycle"
```

### Task 5: Complete the Notes UI flow without changing its layout

**Files:**
- Modify: `Student_Frontend/src/pages/Notes.jsx`
- Create: `Student_Frontend/src/pages/Notes.test.jsx`
- Create: `Student_Frontend/src/features/materials/ClassificationForm.jsx`
- Create: `Student_Frontend/src/features/materials/VersionHistory.jsx`

**Interfaces:**
- Existing Upload modal gains metadata, deterministic stages, classification edit, confirm, cancel, and retry.
- Note detail gains working tag/content edits, selected AI suggestions, undo, and compact version history.

- [ ] **Step 1: Write failing upload and organization tests**

```jsx
test('rejects an oversized upload before creating a job', async () => {
  const user = userEvent.setup()
  renderStudentApp(<App />, { route: '/notes' })
  await user.click(await screen.findByRole('button', { name: /Upload/i }))
  const file = new File(['x'], 'large.pdf', { type: 'application/pdf' })
  Object.defineProperty(file, 'size', { value: 20 * 1024 * 1024 + 1 })
  await user.upload(screen.getByLabelText(/Select a note file/i), file)
  expect(screen.getByText('File must be 20 MB or smaller')).toBeInTheDocument()
})

test('confirms classification and persists the created note', async () => {
  const user = userEvent.setup()
  renderStudentApp(<App />, { route: '/notes' })
  await user.click(await screen.findByRole('button', { name: /Upload/i }))
  await user.selectOptions(screen.getByLabelText('Material type'), 'handwritten_draft')
  await user.click(screen.getByRole('button', { name: /Use handwritten demo/i }))
  await user.selectOptions(await screen.findByLabelText('Subject'), 'A-Level Math')
  await user.click(screen.getByRole('button', { name: /Confirm and create note/i }))
  expect(await screen.findByText(/Note created and classified/i)).toBeInTheDocument()
})

test('organize and undo restore the previous note version', async () => {
  const user = userEvent.setup()
  renderStudentApp(<App />, { route: '/notes/n1' })
  await user.click(await screen.findByRole('button', { name: /One-click organise/i }))
  await user.click(screen.getByRole('button', { name: /Undo last change/i }))
  expect(await screen.findByText(/Restored version 1/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run page tests to verify failure**

Run: `npm test -- --run src/pages/Notes.test.jsx`

Expected: FAIL because uploads are random demos and organization cannot undo.

- [ ] **Step 3: Replace random timing with persisted job stages**

Remove `setInterval` and `Math.random`. Keep the existing progress bar, but render `0`, `35`, `75`, and `100` from store job transitions. Provide a `Try the flow with a demo file` button that supplies concrete metadata without a browser File object.

- [ ] **Step 4: Implement classification and version controls**

Reuse existing inputs, buttons, cards, and modal. `ClassificationForm` exposes material type, exam board, subject, chapter, and folder. `VersionHistory` is a compact collapsible list in the current detail pane. Toolbar actions apply real content patches for bold, list, formula, and highlight to the selected/last paragraph; image action creates an image reference block with alt text.

- [ ] **Step 5: Remove direct mock reads and run tests**

Notes gets all notes, folders, errors, and jobs from AppStore. Search includes title, tag, extracted content, material type, exam board, and chapter.

Run: `npm test -- --run src/pages/Notes.test.jsx src/features/materials`

Expected: upload, classification, editing, organize, undo, and reload tests PASS.

- [ ] **Step 6: Commit UI work**

```bash
git add Student_Frontend/src/pages/Notes.jsx Student_Frontend/src/pages/Notes.test.jsx Student_Frontend/src/features/materials/ClassificationForm.jsx Student_Frontend/src/features/materials/VersionHistory.jsx
git commit -m "feat(student-materials): complete learning workspace"
```

### Task 6: Verify and push Module 4

**Files:**
- No new files unless a scoped Module 4 verification fix is required.

**Interfaces:**
- Produces persistent linked materials for Bank and Profile modules.

- [ ] **Step 1: Run automated gates**

Run: `npm test -- --run src/features/materials src/pages/Notes.test.jsx`

Expected: targeted tests PASS.

Run: `npm test -- --run`

Expected: full suite PASS.

Run: `npm run build`

Expected: production build succeeds.

- [ ] **Step 2: Run browser and visual verification**

Using Playwright CLI, upload an unsupported file and oversized file, complete a demo handwritten upload, edit classification, create the note, edit its title/content/tags, organize selected suggestions, undo, reload, search the created note, and inspect linked errors. Confirm zero console errors. Compare desktop and tablet Notes screenshots with baseline; preserve all three panes and current spacing.

- [ ] **Step 3: Confirm scope and push**

Run: `git status --short`

Expected: no output.

Run: `git log --oneline origin/main..HEAD`

Expected: Module 4 commits only.

Run: `git push origin main`

Expected: remote `main` advances to the Module 4 tip. Do not start Module 5 until the push succeeds.
