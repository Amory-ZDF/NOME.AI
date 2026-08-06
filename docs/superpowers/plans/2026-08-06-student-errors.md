# Student Module 3 — Summary, Diagnosis, and Error Book Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn completed sessions into explainable error diagnoses, maintain a deduplicated error book, and require independent redo plus variant verification before mastery.

**Architecture:** Pure diagnosis and mastery rules compute summaries from persisted sessions. API/store persist error-card merges, redo attempts, and verification state. Existing Summary, Errors, and ErrorRedo layouts consume computed data instead of static mock imports.

**Tech Stack:** React 18.3.1, Vite 5.4.x, Vitest, React Testing Library, persistent repository and exercise engine from Modules 0–2.

## Global Constraints

- Modules 0–2 must already be pushed with green tests.
- Preserve Summary, Errors, and ErrorRedo page structure and styling.
- Error types are exactly `knowledge`, `method`, `calculation`, `reading`, `execution`, `expression`, and `habit`.
- Every error card explains where, why, linked knowledge/ability, recurrence, and hint dependency.
- Independent redo exposes no AI hints.
- A correct redo moves an item to `verification_due`; mastery requires a correct variant verification.
- Migrated pages may not import `mockData.js`.
- Push only after targeted tests, full tests, build, browser flow, and visual checks pass.

---

### Task 1: Compute session summaries and normalized diagnoses

**Files:**
- Create: `Student_Frontend/src/features/errors/errorTypes.js`
- Create: `Student_Frontend/src/features/errors/sessionSummary.js`
- Create: `Student_Frontend/src/features/errors/sessionSummary.test.js`

**Interfaces:**
- Produces: `ERROR_TYPES` and `ERROR_TYPE_META` for all seven types.
- Produces: `normalizeErrorType(question, result)`.
- Produces: `summarizeSession(session)` returning `{ accuracy, correctCount, wrongCount, unansweredCount, hintDependency, errorDistribution, topicOutcomes, wrongQuestions }`.

- [ ] **Step 1: Write failing summary tests**

```js
const session = {
  subject: 'A-Level Math',
  questions: [
    { id: 'q1', topic: 'Calculus', errorType: 'calculation', result: { status: 'wrong', hintsUsed: 3, solvedAtHintLevel: null, attempts: [{ answer: '1', isCorrect: false }] } },
    { id: 'q2', topic: 'Calculus', errorType: 'method', result: { status: 'correct', hintsUsed: 0, solvedAtHintLevel: 0, attempts: [{ answer: '2', isCorrect: true }] } },
  ],
}

test('derives accuracy, distribution, and hint dependency from the session', () => {
  expect(summarizeSession(session)).toMatchObject({
    accuracy: 50,
    correctCount: 1,
    wrongCount: 1,
    hintDependency: { totalHints: 3, averageHints: 1.5, independentlySolved: 1 },
    errorDistribution: { calculation: 1 },
  })
})
```

- [ ] **Step 2: Run the test to verify failure**

Run: `npm test -- --run src/features/errors/sessionSummary.test.js`

Expected: FAIL because the summary module does not exist.

- [ ] **Step 3: Implement type normalization and summary calculations**

Map existing `reading` to Reading comprehension, preserve valid types, and use `execution` when a question is unanswered after the session is submitted. Use `expression` when a correct method is present but required Mark Scheme phrases are absent; use `habit` only when three or more recent attempts repeat the same avoidable pattern. Keep these rules in named pure functions.

```js
export function summarizeSession(session) {
  const total = session.questions.length
  const correct = session.questions.filter((question) => question.result.status === 'correct')
  const wrongQuestions = session.questions.filter((question) => question.result.status !== 'correct')
  const totalHints = session.questions.reduce((sum, question) => sum + question.result.hintsUsed, 0)
  return {
    accuracy: total ? Math.round((correct.length / total) * 100) : 0,
    correctCount: correct.length,
    wrongCount: wrongQuestions.filter((question) => question.result.status === 'wrong').length,
    unansweredCount: wrongQuestions.filter((question) => question.result.status === 'unanswered').length,
    hintDependency: { totalHints, averageHints: total ? totalHints / total : 0, independentlySolved: correct.filter((question) => question.result.solvedAtHintLevel === 0).length },
    errorDistribution: countByErrorType(wrongQuestions),
    topicOutcomes: groupTopicOutcomes(session.questions),
    wrongQuestions,
  }
}
```

Define the two private helpers in the same file:

```js
const countByErrorType = (questions) => questions.reduce((counts, question) => {
  const type = normalizeErrorType(question, question.result)
  return { ...counts, [type]: (counts[type] ?? 0) + 1 }
}, {})

const groupTopicOutcomes = (questions) => Object.values(questions.reduce((groups, question) => {
  const current = groups[question.topic] ?? { topic: question.topic, correct: 0, wrong: 0 }
  return {
    ...groups,
    [question.topic]: {
      ...current,
      [question.result.status === 'correct' ? 'correct' : 'wrong']: current[question.result.status === 'correct' ? 'correct' : 'wrong'] + 1,
    },
  }
}, {}))
```

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- --run src/features/errors/sessionSummary.test.js`

Expected: all summary edge cases PASS, including zero-question sessions.

```bash
git add Student_Frontend/src/features/errors/errorTypes.js Student_Frontend/src/features/errors/sessionSummary.js Student_Frontend/src/features/errors/sessionSummary.test.js
git commit -m "feat(student-errors): compute session diagnostics"
```

### Task 2: Build and merge complete error cards

**Files:**
- Create: `Student_Frontend/src/features/errors/errorCards.js`
- Create: `Student_Frontend/src/features/errors/errorCards.test.js`

**Interfaces:**
- Produces: `buildErrorCard({ question, session, id, occurredAt })`.
- Produces: `mergeErrorCards(existing, incoming)` deduplicated by `questionId`.
- Card adds `whereWrong`, `whyWrong`, `linkedAbility`, `hintDependency`, `occurrences`, `verificationVariantId`, and `variantVerifiedAt`.

- [ ] **Step 1: Write failing card and dedupe tests**

```js
test('captures the required diagnostic evidence', () => {
  const card = buildErrorCard({
    question: { id: 'q1', topic: 'Calculus', errorType: 'calculation', content: 'Q', correctDisplay: '42', result: { status: 'wrong', hintsUsed: 4, attempts: [{ answer: '41', isCorrect: false }] } },
    session: { sessionId: 's1', subject: 'A-Level Math' },
    id: 'e1',
    occurredAt: '2026-08-06',
  })
  expect(card).toMatchObject({ questionId: 'q1', whereWrong: expect.any(String), whyWrong: expect.any(String), linkedAbility: 'calculation accuracy', hintDependency: 4, repeatCount: 1, status: 'pending_review' })
})

test('merges a repeated question instead of duplicating it', () => {
  const merged = mergeErrorCards([{ id: 'e1', questionId: 'q1', repeatCount: 1, occurrences: ['2026-08-01'] }], [{ id: 'e2', questionId: 'q1', repeatCount: 1, occurrences: ['2026-08-06'] }])
  expect(merged).toHaveLength(1)
  expect(merged[0]).toMatchObject({ id: 'e1', repeatCount: 2, lastOccurredAt: '2026-08-06' })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- --run src/features/errors/errorCards.test.js`

Expected: FAIL because the card module does not exist.

- [ ] **Step 3: Implement card construction and immutable merging**

Use the latest wrong attempt for `studentAnswer`. Derive `linkedAbility` from the seven-type mapping. For A-Level, preserve `understandingExplanation`, `scoringExplanation`, and `markSchemePoints`; for IELTS Reading, preserve `passageEvidence` and `errorPattern`. Merging appends occurrences, increments recurrence, resets a mastered card to `pending_review`, and preserves redo history.

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- --run src/features/errors/errorCards.test.js`

Expected: card and merge tests PASS.

```bash
git add Student_Frontend/src/features/errors/errorCards.js Student_Frontend/src/features/errors/errorCards.test.js
git commit -m "feat(student-errors): create evidence-backed error cards"
```

### Task 3: Enforce redo and variant mastery gates

**Files:**
- Create: `Student_Frontend/src/features/errors/masteryRules.js`
- Create: `Student_Frontend/src/features/errors/masteryRules.test.js`
- Modify: `Student_Frontend/src/features/exercise/variantFactory.js`

**Interfaces:**
- Produces: `applyRedoAttempt(errorItem, attempt)`.
- Produces: `attachVerificationVariant(errorItem, variantId)`.
- Produces: `recordVariantVerification(errorItem, { variantId, isCorrect, verifiedAt })`.
- Produces: `canMarkMastered(errorItem)`.

- [ ] **Step 1: Write failing mastery tests**

```js
test('a correct redo schedules verification but is not yet mastery', () => {
  const next = applyRedoAttempt({ status: 'reviewing', repeatCount: 2, redoHistory: [] }, { attemptedAt: '2026-08-06', answer: '42', isCorrect: true, timeSpent: 50 })
  expect(next.status).toBe('verification_due')
  expect(canMarkMastered(next)).toBe(false)
})

test('only a correct linked variant permits mastery', () => {
  let item = attachVerificationVariant({ status: 'verification_due', redoHistory: [{ isCorrect: true }] }, 'variant-1')
  item = recordVariantVerification(item, { variantId: 'variant-1', isCorrect: true, verifiedAt: '2026-08-07' })
  expect(canMarkMastered(item)).toBe(true)
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- --run src/features/errors/masteryRules.test.js`

Expected: FAIL because mastery rules do not exist.

- [ ] **Step 3: Implement strict mastery transitions**

Wrong redo attempts increment `repeatCount` and leave `pending_review`; correct redo attempts set `verification_due`. Variant verification must match `verificationVariantId`; a wrong verification returns to `reviewing`; a correct one sets `variantVerifiedAt` and allows `mastered`.

- [ ] **Step 4: Link variant metadata and commit**

Extend variant tasks with `verificationForErrorId` when created from the error book. Run:

`npm test -- --run src/features/errors/masteryRules.test.js src/features/exercise/variantFactory.test.js`

Expected: all mastery and variant tests PASS.

```bash
git add Student_Frontend/src/features/errors/masteryRules.js Student_Frontend/src/features/errors/masteryRules.test.js Student_Frontend/src/features/exercise/variantFactory.js Student_Frontend/src/features/exercise/variantFactory.test.js
git commit -m "feat(student-errors): require transfer verification"
```

### Task 4: Persist summaries, error merges, redos, and mastery through API/store

**Files:**
- Modify: `Student_Frontend/src/api/index.js`
- Modify: `Student_Frontend/src/api/index.test.js`
- Modify: `Student_Frontend/src/store/AppStore.jsx`
- Modify: `Student_Frontend/src/store/AppStore.test.jsx`
- Modify: `Student_Frontend/API_INTERFACE.md`

**Interfaces:**
- API adds `getSessionSummary(sessionId)`, `upsertErrors(items)`, `submitRedo(id, attempt)`, `scheduleErrorVariant(id)`, `verifyErrorVariant(id, result)`, `markErrorMastered(id)`.
- Store adds `sessionSummaries`, `loadSessionSummary`, `addSessionErrors`, `recordRedo`, `scheduleErrorVariant`, and guarded `markErrorMastered`.

- [ ] **Step 1: Write failing API transition tests**

```js
test('rejects mastery before a correct verification', async () => {
  await expect(markErrorMastered('e1')).rejects.toMatchObject({ code: 'MASTERY_GATE_NOT_MET' })
})

test('persists a session-derived summary', async () => {
  const summary = await getSessionSummary('s1')
  expect(summary).toMatchObject({ accuracy: expect.any(Number), errorDistribution: expect.any(Object) })
})
```

- [ ] **Step 2: Implement mock and real API signatures**

Mock summary reads the persisted session and calls `summarizeSession`. Error upsert uses `mergeErrorCards`. Redo and verification use the mastery rules. Real endpoints remain aligned with `/api/summary/{sessionId}`, `/api/errors/batch`, `/api/errors/{id}/redo`, `/api/errors/{id}/verification`, and `/api/errors/{id}`.

- [ ] **Step 3: Integrate store actions and error messages**

Use pending keys `summary:${sessionId}`, `errors:add`, `error:redo:${id}`, `error:variant:${id}`, and `error:master:${id}`. Failed writes roll back. Surface `Complete the independent variant before marking this mastered` for the mastery gate.

- [ ] **Step 4: Update contract and run tests**

Document all seven error types, extended card fields, `verification_due`, verification endpoint, and mastery rule.

Run: `npm test -- --run src/api/index.test.js src/store/AppStore.test.jsx src/features/errors`

Expected: summary, dedupe, redo, verification, rollback, and gate tests PASS.

- [ ] **Step 5: Commit persistence changes**

```bash
git add Student_Frontend/src/api/index.js Student_Frontend/src/api/index.test.js Student_Frontend/src/store/AppStore.jsx Student_Frontend/src/store/AppStore.test.jsx Student_Frontend/API_INTERFACE.md
git commit -m "feat(student-errors): persist diagnosis lifecycle"
```

### Task 5: Wire Summary, Errors, and ErrorRedo to computed data

**Files:**
- Modify: `Student_Frontend/src/pages/Summary.jsx`
- Modify: `Student_Frontend/src/pages/Errors.jsx`
- Modify: `Student_Frontend/src/pages/ErrorRedo.jsx`
- Create: `Student_Frontend/src/pages/Summary.test.jsx`
- Create: `Student_Frontend/src/pages/Errors.test.jsx`
- Create: `Student_Frontend/src/pages/ErrorRedo.test.jsx`

**Interfaces:**
- Summary loads by route id and adds all session error cards idempotently.
- Errors filters all seven types and exposes verification status.
- ErrorRedo records elapsed seconds and schedules a variant after a correct redo.

- [ ] **Step 1: Write failing page-flow tests**

```jsx
test('reloads a summary by session id and adds errors only once', async () => {
  const user = userEvent.setup()
  renderStudentApp(<App />, { route: '/summary/s1' })
  expect(await screen.findByText(/Error Analysis/i)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /Add all to error book/i }))
  await user.click(screen.getByRole('button', { name: /Add all to error book/i }))
  expect(screen.getByText(/Already in error book/i)).toBeInTheDocument()
})

test('correct redo requires a variant before mastery', async () => {
  const user = userEvent.setup()
  renderStudentApp(<App />, { route: '/errors/review/e1' })
  await user.type(await screen.findByRole('textbox', { name: /Your solution/i }), '5')
  await user.click(screen.getByRole('button', { name: /Submit answer/i }))
  expect(await screen.findByRole('button', { name: /Start variant verification/i })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Mark as mastered/i })).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run page tests to verify failure**

Run: `npm test -- --run src/pages/Summary.test.jsx src/pages/Errors.test.jsx src/pages/ErrorRedo.test.jsx`

Expected: FAIL because pages use last-session/static data and permit early mastery.

- [ ] **Step 3: Migrate pages while preserving markup**

Remove `ERROR_TYPE_META` and grading imports from `mockData.js`. Keep current cards, progress bars, and two-column redo layout. Add compact badges for all seven types and `Verification due`. Replace per-card add controls with an idempotent `Add all to error book` plus existing individual controls.

- [ ] **Step 4: Show subject-specific diagnosis layers**

A-Level cards show `Understanding` and `Scoring / Mark Scheme`; IELTS Reading cards show `Passage evidence`, `Repeated pattern`, and `Micro-training`. Hide absent fields instead of rendering empty cards.

- [ ] **Step 5: Run page tests and commit**

Run: `npm test -- --run src/pages/Summary.test.jsx src/pages/Errors.test.jsx src/pages/ErrorRedo.test.jsx src/features/errors`

Expected: all page flows PASS.

```bash
git add Student_Frontend/src/pages/Summary.jsx Student_Frontend/src/pages/Errors.jsx Student_Frontend/src/pages/ErrorRedo.jsx Student_Frontend/src/pages/Summary.test.jsx Student_Frontend/src/pages/Errors.test.jsx Student_Frontend/src/pages/ErrorRedo.test.jsx
git commit -m "feat(student-errors): complete diagnosis and mastery UI"
```

### Task 6: Verify and push Module 3

**Files:**
- No new files unless a scoped Module 3 verification fix is required.

**Interfaces:**
- Produces trusted error evidence for notes, recommendations, and the student model.

- [ ] **Step 1: Run automated gates**

Run: `npm test -- --run src/features/errors src/pages/Summary.test.jsx src/pages/Errors.test.jsx src/pages/ErrorRedo.test.jsx`

Expected: targeted tests PASS.

Run: `npm test -- --run`

Expected: full suite PASS.

Run: `npm run build`

Expected: production build succeeds.

- [ ] **Step 2: Run browser and visual verification**

Using Playwright CLI, complete a practice session with wrong answers and hints, reload its summary route, add errors twice, verify dedupe, independently redo one wrong and one correct answer, create the verification variant, solve it, then mark mastered. Confirm persistence after reload and zero console errors. Compare Summary, Errors, and ErrorRedo screenshots with baseline; only diagnostic sections and status badges may change.

- [ ] **Step 3: Confirm scope and push**

Run: `git status --short`

Expected: no output.

Run: `git log --oneline origin/main..HEAD`

Expected: Module 3 commits only.

Run: `git push origin main`

Expected: remote `main` advances to the Module 3 tip. Do not start Module 4 until the push succeeds.
