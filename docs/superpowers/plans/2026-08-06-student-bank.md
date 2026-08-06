# Student Module 5 — Question Bank Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every bank item searchable and practiceable, generate evidence-based recommendations, and turn uploaded papers into confirmed exercise sets.

**Architecture:** Pure selectors filter and recommend API-supplied questions. A deterministic paper-import state machine reuses material upload metadata but produces split questions and exercise sets. Bank UI preserves its current cards, filters, recommendation panel, and upload modal.

**Tech Stack:** React 18.3.1, Vite 5.4.x, Vitest, React Testing Library, Modules 0–4 API/store and material pipeline.

## Global Constraints

- Modules 0–4 must already be pushed with green tests.
- Preserve the existing Bank layout, subject tabs, filter row, recommendation card, question cards, and Tailwind styling.
- Bank data must come through API/store; `Bank.jsx` may not import `mockData.js`.
- Every displayed question must resolve to a valid exercise set.
- Recommendation reasons must cite weak knowledge, recent error, or pending verification evidence.
- Paper import statuses are `processing`, `needs_confirmation`, `completed`, `failed`, and `cancelled`.
- Push only after targeted tests, full tests, build, browser flow, and visual checks pass.

---

### Task 1: Add bank filters and evidence-based recommendations

**Files:**
- Create: `Student_Frontend/src/features/bank/bankSelectors.js`
- Create: `Student_Frontend/src/features/bank/bankSelectors.test.js`

**Interfaces:**
- Produces: `filterBankQuestions(questions, filters)`.
- Produces: `rankBankRecommendations({ questions, weakTopics, errors, verificationDue, limit })`.
- Filter fields: `subject`, `difficulty`, `type`, `status`, and `search`.
- Recommendation item: `{ questionId, score, reason, evidence: { kind, id }[] }`.

- [ ] **Step 1: Write failing filter and recommendation tests**

```js
const questions = [
  { id: 'q1', subject: 'A-Level Math', topic: 'Calculus', chapter: 'Ch7', difficulty: 3, type: 'calculation', studentStatus: 'wrong', preview: 'Differentiate' },
  { id: 'q2', subject: 'IELTS Reading', topic: 'T/F/NG', chapter: 'Reading', difficulty: 2, type: 'reading', studentStatus: 'not_attempted', preview: 'Passage evidence' },
]

test('applies all filters with case-insensitive search', () => {
  expect(filterBankQuestions(questions, { subject: 'A-Level Math', difficulty: '3', type: 'calculation', status: 'wrong', search: 'differentiate' }).map((q) => q.id)).toEqual(['q1'])
})

test('ranks a recent repeated error above a generic weak-topic match', () => {
  const result = rankBankRecommendations({
    questions,
    weakTopics: ['Calculus'],
    errors: [{ id: 'e1', relatedTopic: 'Calculus', repeatCount: 3, status: 'pending_review', lastOccurredAt: '2026-08-06' }],
    verificationDue: [],
    limit: 3,
  })
  expect(result[0]).toMatchObject({ questionId: 'q1', reason: expect.stringMatching(/repeated Calculus error/i) })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- --run src/features/bank/bankSelectors.test.js`

Expected: FAIL because bank selectors do not exist.

- [ ] **Step 3: Implement filtering and stable scoring**

Use exact scores: verification match `+100`, pending repeated error `+60 + repeatCount`, recent error `+40`, weak topic `+20`, previously wrong question `+10`. Break ties by lower student mastery, then question id. Recommendation reasons use the highest-scoring evidence and never claim evidence that is absent.

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- --run src/features/bank/bankSelectors.test.js`

Expected: all filter, ranking, tie, and no-evidence tests PASS.

```bash
git add Student_Frontend/src/features/bank/bankSelectors.js Student_Frontend/src/features/bank/bankSelectors.test.js
git commit -m "feat(student-bank): rank evidence-based practice"
```

### Task 2: Implement paper splitting and confirmation

**Files:**
- Create: `Student_Frontend/src/data/paperFixtures.js`
- Create: `Student_Frontend/src/features/bank/paperImport.js`
- Create: `Student_Frontend/src/features/bank/paperImport.test.js`

**Interfaces:**
- Produces: `processPaperImport(job, fixtureKey)` returning a `needs_confirmation` job with `draftQuestions`.
- Produces: `updateDraftQuestion(job, questionId, patch)`.
- Produces: `confirmPaperImport(job, { exerciseSetId, importedAt })` returning `{ job, exerciseSet, bankQuestions }`.
- Draft question fields match `Question` plus `sourcePage`, `cropLabel`, and `include`.

- [ ] **Step 1: Write failing split and confirmation tests**

```js
test('splits a paper into editable questions and answers', () => {
  const job = processPaperImport({ id: 'paper-1', status: 'processing', fileName: '9709_s22_qp_31.pdf' }, 'alevel_math_paper')
  expect(job.status).toBe('needs_confirmation')
  expect(job.draftQuestions).toEqual(expect.arrayContaining([expect.objectContaining({ sourcePage: 1, include: true, acceptKeywords: expect.any(Array) })]))
})

test('confirmed included questions all point to the new exercise set', () => {
  const processedJob = processPaperImport({ id: 'paper-1', status: 'processing', fileName: '9709_s22_qp_31.pdf' }, 'alevel_math_paper')
  const result = confirmPaperImport(processedJob, { exerciseSetId: 'import-set-1', importedAt: '2026-08-06T10:00:00Z' })
  expect(result.exerciseSet.questions.length).toBe(result.bankQuestions.length)
  expect(result.bankQuestions.every((question) => question.setId === 'import-set-1')).toBe(true)
  expect(result.job.status).toBe('completed')
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- --run src/features/bank/paperImport.test.js`

Expected: FAIL because paper import modules do not exist.

- [ ] **Step 3: Add concrete paper fixtures**

Create one three-question A-Level Math paper and one three-question IELTS Reading paper. Every draft includes content, answer metadata, five hints, topic, difficulty, type, source detail, and source page. At least one A-Level question includes Mark Scheme understanding/scoring fields; IELTS questions include passage evidence.

- [ ] **Step 4: Implement immutable edit and confirmation**

`updateDraftQuestion` permits patches only to `content`, `topic`, `difficulty`, `type`, `options`, `correctIndex`, `acceptKeywords`, `correctDisplay`, and `include`. `confirmPaperImport` rejects zero included questions with code `NO_QUESTIONS_SELECTED`. It produces practiceable bank records and a matching exercise set.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- --run src/features/bank/paperImport.test.js`

Expected: processing, edit, rejection, and confirmation tests PASS.

```bash
git add Student_Frontend/src/data/paperFixtures.js Student_Frontend/src/features/bank/paperImport.js Student_Frontend/src/features/bank/paperImport.test.js
git commit -m "feat(student-bank): split and confirm papers"
```

### Task 3: Guarantee a practice set for every bank question

**Files:**
- Create: `Student_Frontend/src/features/bank/exerciseSetResolver.js`
- Create: `Student_Frontend/src/features/bank/exerciseSetResolver.test.js`
- Modify: `Student_Frontend/src/data/mockData.js`

**Interfaces:**
- Produces: `resolveBankExercise(question, exerciseSets)` returning an existing or generated single-question set.
- Generated set id: `bank-single-${question.id}`.

- [ ] **Step 1: Write failing resolver tests**

```js
test('reuses an existing set and generates a missing one', () => {
  const answerableQuestion = {
    content: 'What is 1 + 1?',
    correctDisplay: '2',
    acceptKeywords: ['2'],
    hints: [1, 2, 3, 4, 5].map((level) => ({ level, title: `L${level}`, content: `Hint ${level}` })),
  }
  expect(resolveBankExercise({ id: 'q1', setId: 'set-1' }, { 'set-1': { id: 'set-1', questions: [{}] } }).id).toBe('set-1')
  expect(resolveBankExercise({ id: 'q2', setId: null, subject: 'Math', ...answerableQuestion }, {}).id).toBe('bank-single-q2')
})

test('rejects bank records without grading data', () => {
  expect(() => resolveBankExercise({ id: 'broken', setId: null, content: 'Q' }, {})).toThrowError(expect.objectContaining({ code: 'QUESTION_NOT_PRACTICEABLE' }))
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- --run src/features/bank/exerciseSetResolver.test.js`

Expected: FAIL because the resolver does not exist.

- [ ] **Step 3: Implement resolution and repair seed records**

A question is answerable when it has `content`, `correctDisplay`, five hints, and either choice metadata or non-empty `acceptKeywords`. Add missing grading/hint data to every seeded bank question rather than hiding it.

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- --run src/features/bank/exerciseSetResolver.test.js`

Expected: every seeded bank question resolves successfully.

```bash
git add Student_Frontend/src/features/bank/exerciseSetResolver.js Student_Frontend/src/features/bank/exerciseSetResolver.test.js Student_Frontend/src/data/mockData.js
git commit -m "feat(student-bank): make every question practiceable"
```

### Task 4: Persist bank data, recommendations, and paper jobs through API/store

**Files:**
- Modify: `Student_Frontend/src/api/index.js`
- Modify: `Student_Frontend/src/api/index.test.js`
- Modify: `Student_Frontend/src/store/AppStore.jsx`
- Modify: `Student_Frontend/src/store/AppStore.test.jsx`
- Modify: `Student_Frontend/API_INTERFACE.md`

**Interfaces:**
- API adds `getBankQuestions(filters)`, `getBankRecommendations()`, `getBankExercise(setId)`, `createPaperImport(metadata)`, `processPaperImport(id)`, `updatePaperDraft(id, questionId, patch)`, `confirmPaperImport(id)`, `cancelPaperImport(id)`.
- Store adds `bankQuestions`, `bankRecommendations`, `paperImports`, `loadBank`, and paper lifecycle actions.

- [ ] **Step 1: Write failing API tests**

```js
test('returns filtered recommendations with evidence', async () => {
  const result = await getBankRecommendations()
  expect(result[0]).toMatchObject({ questionId: expect.any(String), reason: expect.any(String), evidence: expect.any(Array) })
})

test('persists a confirmed paper and its exercise set', async () => {
  const { job } = await createPaperImport({ id: 'paper-1', fileName: '9709.pdf', mimeType: 'application/pdf', size: 1000 })
  await processPaperImport(job.id)
  const result = await confirmPaperImport(job.id)
  await expect(getBankExercise(result.exerciseSet.id)).resolves.toMatchObject({ id: result.exerciseSet.id })
})
```

- [ ] **Step 2: Implement mock transactions and real endpoints**

Real endpoints:

```text
GET   /api/bank/questions
GET   /api/bank/recommendations
GET   /api/bank/exercise/{setId}
POST  /api/bank/imports
POST  /api/bank/imports/{id}/process
PATCH /api/bank/imports/{id}/questions/{questionId}
POST  /api/bank/imports/{id}/confirm
POST  /api/bank/imports/{id}/cancel
```

Mock recommendations read current knowledge summary, errors, and verification-due items. In `api/index.js`, import the pure functions as `processPaperDraft` and `confirmPaperDraft` so they do not collide with exported endpoint names. Confirmation atomically persists the job, bank questions, and exercise set.

- [ ] **Step 3: Integrate store state and failure recovery**

Use pending keys `bank:load`, `paper:create`, `paper:process:${id}`, `paper:update:${id}`, `paper:confirm:${id}`, and `paper:cancel:${id}`. A failed confirmation leaves the draft in `needs_confirmation` and shows a retryable toast.

- [ ] **Step 4: Update API contract and run tests**

Document recommendation evidence, practiceability requirements, paper job/draft types, update endpoint, and atomic confirmation response.

Run: `npm test -- --run src/api/index.test.js src/store/AppStore.test.jsx src/features/bank`

Expected: filters, recommendations, resolver, import lifecycle, failure recovery, and persistence PASS.

- [ ] **Step 5: Commit API/store work**

```bash
git add Student_Frontend/src/api/index.js Student_Frontend/src/api/index.test.js Student_Frontend/src/store/AppStore.jsx Student_Frontend/src/store/AppStore.test.jsx Student_Frontend/API_INTERFACE.md
git commit -m "feat(student-bank): persist practice and paper imports"
```

### Task 5: Complete Bank UI interactions without redesign

**Files:**
- Modify: `Student_Frontend/src/pages/Bank.jsx`
- Create: `Student_Frontend/src/pages/Bank.test.jsx`
- Create: `Student_Frontend/src/features/bank/PaperImportModal.jsx`
- Create: `Student_Frontend/src/features/bank/PaperQuestionEditor.jsx`

**Interfaces:**
- Bank loads API/store collections, filters with `filterBankQuestions`, and renders ranked recommendations.
- Clicking any question navigates to a valid exercise.
- Upload modal supports select, process, edit, include/exclude, confirm, cancel, and retry.

- [ ] **Step 1: Write failing Bank interaction tests**

```jsx
test('filters by topic and starts every visible question', async () => {
  const user = userEvent.setup()
  renderStudentApp(<App />, { route: '/bank' })
  await user.type(await screen.findByPlaceholderText(/Search questions/i), 'Calculus')
  const starts = screen.getAllByRole('button', { name: /Start practice|Redo|Practice again/i })
  expect(starts.length).toBeGreaterThan(0)
  await user.click(starts[0])
  expect(await screen.findByText(/Elapsed/i)).toBeInTheDocument()
})

test('imports an edited paper into the bank', async () => {
  const user = userEvent.setup()
  renderStudentApp(<App />, { route: '/bank' })
  await user.click(await screen.findByRole('button', { name: /Upload paper/i }))
  await user.click(screen.getByRole('button', { name: /Use A-Level demo paper/i }))
  await user.click(await screen.findByRole('button', { name: /Review split questions/i }))
  await user.type(screen.getAllByLabelText('Topic')[0], ' - reviewed')
  await user.click(screen.getByRole('button', { name: /Confirm and add to bank/i }))
  expect(await screen.findByText(/3 questions added to the bank/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run page tests to verify failure**

Run: `npm test -- --run src/pages/Bank.test.jsx`

Expected: FAIL because Bank reads static mock data and upload only shows a toast.

- [ ] **Step 3: Migrate Bank reads and filters**

Remove direct imports of questions/recommendations. Keep current tabs, selects, search input, toggle, recommendation grid, and cards. Ensure card-level click and nested action button do not trigger twice. Add loading, recoverable error, and no-results states using existing primitives.

- [ ] **Step 4: Implement the paper modal in existing visual language**

Keep the current modal width and upload dropzone for select/processing. `PaperQuestionEditor` renders compact cards with include checkbox, topic, type, difficulty, and answer fields. Confirmation remains in the modal; show exact added count and navigate nowhere automatically.

- [ ] **Step 5: Run UI tests and commit**

Run: `npm test -- --run src/pages/Bank.test.jsx src/features/bank`

Expected: filter, recommendation, practice navigation, import, failure, and persistence tests PASS.

```bash
git add Student_Frontend/src/pages/Bank.jsx Student_Frontend/src/pages/Bank.test.jsx Student_Frontend/src/features/bank/PaperImportModal.jsx Student_Frontend/src/features/bank/PaperQuestionEditor.jsx
git commit -m "feat(student-bank): complete question bank flow"
```

### Task 6: Verify and push Module 5

**Files:**
- No new files unless a scoped Module 5 verification fix is required.

**Interfaces:**
- Produces bank practice evidence and imported sets for the profile model.

- [ ] **Step 1: Run automated gates**

Run: `npm test -- --run src/features/bank src/pages/Bank.test.jsx`

Expected: targeted tests PASS.

Run: `npm test -- --run`

Expected: full suite PASS.

Run: `npm run build`

Expected: production build succeeds.

- [ ] **Step 2: Run browser and visual verification**

Using Playwright CLI, exercise every filter, toggle recommendations, start seeded questions that previously lacked set ids, upload/edit/confirm both demo papers, reload, search imported questions, and start an imported exercise. Confirm recommendation reasons match visible evidence and console has zero errors. Compare Bank screenshots with baseline; preserve card sizes, tab spacing, and filter row.

- [ ] **Step 3: Confirm scope and push**

Run: `git status --short`

Expected: no output.

Run: `git log --oneline origin/main..HEAD`

Expected: Module 5 commits only.

Run: `git push origin main`

Expected: remote `main` advances to the Module 5 tip. Do not start Module 6 until the push succeeds.
