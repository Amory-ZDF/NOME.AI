# Student Module 2 — Progressive Exercise Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the complete six-level progressive-help loop, record independence and hint dependency, and generate a real variant exercise after learning.

**Architecture:** Pure answer and session engines replace page-local grading and state mutation. Exercise sets load through API/store. The existing Exercise layout stays in place while L1–L5 are state-machine transitions and L6 creates a persisted variant set plus task.

**Tech Stack:** React 18.3.1, Vite 5.4.x, Vitest, React Testing Library, Module 0 repository, Module 1 task actions.

## Global Constraints

- Modules 0 and 1 must already be pushed with green full-suite tests.
- Preserve the current full-screen exercise layout, question navigator, answer area, AI side panel, and Tailwind classes.
- A student must submit a valid attempt before any hint unlocks.
- Help levels are exactly: clarify, knowledge, method, key step, full process, independent variant.
- Record every attempt, highest hint level, solved-at level, elapsed seconds, and handwriting mode.
- L6 must create a different, answerable question and a persisted task; a toast alone is not accepted.
- `Exercise.jsx` may not import `mockData.js` after this module.
- Push only after targeted tests, full tests, build, browser flow, and visual checks pass.

---

### Task 1: Extract answer validation and grading

**Files:**
- Create: `Student_Frontend/src/features/exercise/answerRules.js`
- Create: `Student_Frontend/src/features/exercise/answerRules.test.js`
- Modify: `Student_Frontend/src/data/mockData.js`
- Modify: `Student_Frontend/src/pages/ErrorRedo.jsx`

**Interfaces:**
- Produces: `validateAttempt(answer)` returning `{ valid: true, value }` or `{ valid: false, code, message }`.
- Produces: `gradeAnswer(question, answer)` returning `{ isCorrect, normalizedAnswer }`.
- Removes grading functions from `mockData.js`; Exercise and ErrorRedo consume the feature module.

- [ ] **Step 1: Write failing validation and grading tests**

```js
test.each(['', '   ', '!!!', '???'])('rejects throwaway answer %j', (answer) => {
  expect(validateAttempt(answer)).toEqual({ valid: false, code: 'THROWAWAY', message: 'Please answer seriously first — empty or random input cannot be submitted' })
})

test('grades a choice by letter or exact option text', () => {
  const question = { options: ['A. 1', 'B. 2'], correctIndex: 1, acceptKeywords: ['B'] }
  expect(gradeAnswer(question, 'b').isCorrect).toBe(true)
  expect(gradeAnswer(question, '2').isCorrect).toBe(true)
})

test('grades open work with case-insensitive keywords', () => {
  expect(gradeAnswer({ acceptKeywords: ['y = 2x'] }, 'Therefore Y = 2X').isCorrect).toBe(true)
})
```

- [ ] **Step 2: Run the tests to verify failure**

Run: `npm test -- --run src/features/exercise/answerRules.test.js`

Expected: FAIL because `answerRules.js` does not exist.

- [ ] **Step 3: Implement validation and grading**

```js
const normalize = (answer) => String(answer ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

export function validateAttempt(answer) {
  const value = String(answer ?? '').trim()
  if (!value || /^[^a-zA-Z0-9\u4e00-\u9fa5]+$/.test(value)) {
    return { valid: false, code: 'THROWAWAY', message: 'Please answer seriously first — empty or random input cannot be submitted' }
  }
  return { valid: true, value }
}

export function gradeAnswer(question, answer) {
  const normalizedAnswer = normalize(answer)
  if (question.options && Number.isInteger(question.correctIndex)) {
    const letter = ['a', 'b', 'c', 'd'][question.correctIndex]
    const optionText = normalize(question.options[question.correctIndex].replace(/^[A-D][.、\s]*/, ''))
    return { isCorrect: normalizedAnswer === letter || normalizedAnswer === optionText || normalizedAnswer.startsWith(`${letter}.`), normalizedAnswer }
  }
  return { isCorrect: question.acceptKeywords.some((keyword) => normalizedAnswer.includes(normalize(keyword))), normalizedAnswer }
}
```

- [ ] **Step 4: Update ErrorRedo and run tests**

Replace its duplicated grading and throwaway checks with `validateAttempt` and `gradeAnswer`. Preserve the page layout and current independent-mode messaging.

Run: `npm test -- --run src/features/exercise/answerRules.test.js`

Expected: all answer rules PASS.

- [ ] **Step 5: Commit answer rules**

```bash
git add Student_Frontend/src/features/exercise/answerRules.js Student_Frontend/src/features/exercise/answerRules.test.js Student_Frontend/src/data/mockData.js Student_Frontend/src/pages/ErrorRedo.jsx
git commit -m "refactor(student-exercise): centralize answer grading"
```

### Task 2: Implement the progressive-help state machine

**Files:**
- Create: `Student_Frontend/src/features/exercise/exerciseEngine.js`
- Create: `Student_Frontend/src/features/exercise/exerciseEngine.test.js`

**Interfaces:**
- Produces: `createQuestionProgress(questionId)`.
- Produces: `submitAttempt(progress, question, answer, submittedAt)`.
- Produces: `unlockNextHint(progress)`.
- Produces: `canSubmitSession(progressById)`.
- Produces: `buildSession({ set, progressById, elapsedSeconds, sessionId, completedAt })`.

- [ ] **Step 1: Write failing state-transition tests**

```js
test('a first wrong attempt unlocks only L1', () => {
  const progress = createQuestionProgress('q1')
  const result = submitAttempt(progress, { acceptKeywords: ['42'] }, '41', '2026-08-06T10:00:00Z')
  expect(result).toMatchObject({ status: 'wrong', hintLevel: 1, solvedAtHintLevel: null })
  expect(result.attempts).toHaveLength(1)
})

test('hints cannot unlock before a wrong attempt and stop at L5', () => {
  expect(unlockNextHint(createQuestionProgress('q1'))).toMatchObject({ hintLevel: 0, transitionError: 'ATTEMPT_REQUIRED' })
  let progress = { ...createQuestionProgress('q1'), status: 'wrong', hintLevel: 1 }
  for (let index = 0; index < 9; index += 1) progress = unlockNextHint(progress)
  expect(progress.hintLevel).toBe(5)
})

test('records the level at which the student solved independently', () => {
  const progress = { ...createQuestionProgress('q1'), status: 'wrong', hintLevel: 3, attempts: [] }
  expect(submitAttempt(progress, { acceptKeywords: ['42'] }, '42', '2026-08-06T10:01:00Z')).toMatchObject({ status: 'correct', solvedAtHintLevel: 3 })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- --run src/features/exercise/exerciseEngine.test.js`

Expected: FAIL because the engine does not exist.

- [ ] **Step 3: Implement immutable state transitions**

```js
export const createQuestionProgress = (questionId) => ({
  questionId,
  answer: '',
  status: 'unanswered',
  attempts: [],
  hintLevel: 0,
  solvedAtHintLevel: null,
  handwritingUsed: false,
})

export function unlockNextHint(progress) {
  if (progress.status === 'unanswered') return { ...progress, transitionError: 'ATTEMPT_REQUIRED' }
  return { ...progress, transitionError: null, hintLevel: Math.min(5, progress.hintLevel + 1) }
}
```

`submitAttempt` must call `validateAttempt` and `gradeAnswer`, append `{ answer, normalizedAnswer, submittedAt, isCorrect }`, set L1 after the first wrong attempt, and never reduce `hintLevel`. `buildSession` must store `hintsUsed`, `solvedAtHintLevel`, `handwritingUsed`, `timeSpentSeconds`, and rounded `timeSpent`.

- [ ] **Step 4: Run engine tests and commit**

Run: `npm test -- --run src/features/exercise/exerciseEngine.test.js src/features/exercise/answerRules.test.js`

Expected: all engine and grading tests PASS.

```bash
git add Student_Frontend/src/features/exercise/exerciseEngine.js Student_Frontend/src/features/exercise/exerciseEngine.test.js
git commit -m "feat(student-exercise): add progressive help engine"
```

### Task 3: Create deterministic variant questions and tasks

**Files:**
- Create: `Student_Frontend/src/data/variantTemplates.js`
- Create: `Student_Frontend/src/features/exercise/variantFactory.js`
- Create: `Student_Frontend/src/features/exercise/variantFactory.test.js`

**Interfaces:**
- Produces: `VARIANT_TEMPLATES` keyed by source topic.
- Produces: `createVariantExercise({ sourceQuestion, templateIndex, variantId, taskId, createdAt })` returning `{ exerciseSet, task }`.
- Variant task type: `ai_recommended`; field `reason: 'Independent transfer check'`; field `sourceQuestionId`.

- [ ] **Step 1: Write failing variant tests**

```js
test('creates a different persisted transfer question for the same topic', () => {
  const sourceQuestion = { id: 'q1', topic: 'Calculus - Differentiation', content: 'Differentiate x³', acceptKeywords: ['3x²'] }
  const { exerciseSet, task } = createVariantExercise({ sourceQuestion, templateIndex: 0, variantId: 'variant-1', taskId: 'task-v1', createdAt: '2026-08-06T10:00:00Z' })
  expect(exerciseSet.questions[0].content).not.toBe(sourceQuestion.content)
  expect(exerciseSet.questions[0]).toMatchObject({ variantOf: 'q1', topic: 'Calculus - Differentiation' })
  expect(task).toMatchObject({ id: 'task-v1', exerciseSetId: 'variant-1', type: 'ai_recommended', sourceQuestionId: 'q1' })
})
```

- [ ] **Step 2: Run the test to verify failure**

Run: `npm test -- --run src/features/exercise/variantFactory.test.js`

Expected: FAIL because the factory and template data do not exist.

- [ ] **Step 3: Add concrete templates**

Add at least two answerable templates for each currently seeded topic in A-Level Math and IELTS Reading. A template contains `content`, `options`, `correctIndex`, `acceptKeywords`, `correctDisplay`, `errorType`, and L1–L5 hints. Do not copy the original question text. Example differentiation template:

```js
{
  topic: 'Calculus - Differentiation',
  type: 'calculation',
  content: 'Given <span class="math">g(x)=2x<sup>3</sup>-4x+1</span>, find <span class="math">g\'(2)</span>.',
  acceptKeywords: ['20'],
  correctDisplay: "g'(x)=6x²-4, so g'(2)=20",
  errorType: 'calculation',
  hints: [
    { level: 1, title: 'Clarify the Question', content: 'Differentiate first, then substitute x=2.' },
    { level: 2, title: 'Relevant Knowledge', content: 'Use the power rule term by term.' },
    { level: 3, title: 'Method Hint', content: "Find g'(x)=6x²-4." },
    { level: 4, title: 'Key Step', content: "g'(2)=6·4-4." },
    { level: 5, title: 'Full Solution', content: "g'(2)=24-4=20." },
  ],
}
```

- [ ] **Step 4: Implement the factory and commit**

The factory selects `VARIANT_TEMPLATES[sourceQuestion.topic][templateIndex]`, clones it, adds `id`, `order: 1`, `variantOf`, and returns a one-question set plus a due-date-free P2 task estimated at 15 minutes.

Run: `npm test -- --run src/features/exercise/variantFactory.test.js`

Expected: all variant tests PASS.

```bash
git add Student_Frontend/src/data/variantTemplates.js Student_Frontend/src/features/exercise/variantFactory.js Student_Frontend/src/features/exercise/variantFactory.test.js
git commit -m "feat(student-exercise): generate transfer variants"
```

### Task 4: Move exercise reads and writes behind API/store

**Files:**
- Modify: `Student_Frontend/src/api/index.js`
- Modify: `Student_Frontend/src/api/index.test.js`
- Modify: `Student_Frontend/src/store/AppStore.jsx`
- Modify: `Student_Frontend/src/store/AppStore.test.jsx`
- Modify: `Student_Frontend/API_INTERFACE.md`

**Interfaces:**
- API adds `getExerciseSet(taskId)`, `getBankExerciseSet(setId)`, `submitSession(session)`, `generateVariant(sourceQuestionId)`.
- Store adds `exerciseCache`, `loadExerciseSet({ taskId, bankSetId })`, `saveSession(session)`, `generateVariant(sourceQuestion)`.
- Bootstrap/session data includes `sessions` keyed by session id and dynamic `exerciseSets` keyed by set id.

- [ ] **Step 1: Write failing API tests for reads, session persistence, and L6 generation**

```js
test('persists a completed session and generated variant', async () => {
  const set = await getExerciseSet('t1')
  await submitSession({ sessionId: 's1', taskId: 't1', questions: [], completedAt: '2026-08-06T10:00:00Z' })
  const generated = await generateVariant(set.questions[0].id)
  const data = await bootstrap()
  expect(data.sessions.s1.sessionId).toBe('s1')
  expect(data.tasks.some((task) => task.id === generated.task.id)).toBe(true)
  expect(data.exerciseSets[generated.exerciseSet.id]).toEqual(generated.exerciseSet)
})
```

- [ ] **Step 2: Implement mock repository transactions and real routes**

Real mode endpoints:

```text
GET  /api/exercise-sets/{taskId}
GET  /api/bank/exercise/{setId}
POST /api/sessions
POST /api/questions/{questionId}/variant
```

Mock mode finds the source question across exercise and bank sets, creates a deterministic variant using the next template index, persists it, and returns `{ exerciseSet, task }`.

- [ ] **Step 3: Add store loading/error/pending states**

Use action keys `exercise:load:${id}`, `exercise:submit:${sessionId}`, and `exercise:variant:${questionId}`. Cache resolved sets. On submit, persist session before completing its task; if completion fails, keep the saved session and show `Session saved; task completion will retry` rather than losing work.

- [ ] **Step 4: Update interface documentation and tests**

Document `handwritingUsed`, `variantOf`, `sourceQuestionId`, the variant endpoint, and the two-layer A-Level explanation fields `understandingExplanation` and `scoringExplanation`. IELTS Reading questions add `passageEvidence` and `errorPattern`.

Run: `npm test -- --run src/api/index.test.js src/store/AppStore.test.jsx`

Expected: exercise reads, session persistence, failure handling, and L6 generation PASS.

- [ ] **Step 5: Commit API/store work**

```bash
git add Student_Frontend/src/api/index.js Student_Frontend/src/api/index.test.js Student_Frontend/src/store/AppStore.jsx Student_Frontend/src/store/AppStore.test.jsx Student_Frontend/API_INTERFACE.md
git commit -m "feat(student-exercise): persist sessions and variants"
```

### Task 5: Refactor Exercise page onto the engine without redesign

**Files:**
- Modify: `Student_Frontend/src/pages/Exercise.jsx`
- Create: `Student_Frontend/src/pages/Exercise.test.jsx`

**Interfaces:**
- Exercise page obtains its set from `loadExerciseSet` and holds only engine state plus the active question index.
- AI panel receives `progress` and callbacks; L6 calls `generateVariant` and shows the created task title.

- [ ] **Step 1: Write failing user-flow tests**

```jsx
test('requires an attempt, unlocks hints one level at a time, and records solved level', async () => {
  const user = userEvent.setup()
  renderStudentApp(<App />, { route: '/exercise/t1' })
  expect(await screen.findByText(/Math P3/i)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /Get a hint/i }))
  expect(screen.getByText(/Submit your attempt first/i)).toBeInTheDocument()
  await user.type(screen.getByRole('textbox', { name: /Your answer/i }), '41')
  await user.click(screen.getByRole('button', { name: /Submit answer/i }))
  expect(screen.getByText(/Clarify the Question/i)).toBeInTheDocument()
})

test('L6 adds a real variant task after a solved question', async () => {
  const user = userEvent.setup()
  renderStudentApp(<App />, { route: '/exercise/t1' })
  const answer = await screen.findByRole('textbox', { name: /Your answer/i })
  await user.type(answer, '0')
  await user.click(screen.getByRole('button', { name: /Submit answer/i }))
  await user.click(screen.getByRole('button', { name: /Create independent variant/i }))
  expect(await screen.findByText(/Variant task added/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- --run src/pages/Exercise.test.jsx`

Expected: FAIL because the page still uses local grading and L6 only shows a toast.

- [ ] **Step 3: Replace page-local transitions with the engine**

Initialize progress with `createQuestionProgress`. Use `submitAttempt`, `unlockNextHint`, `canSubmitSession`, and `buildSession`. Keep current markup and class names. Add accessible labels to answer fields and question navigation. The Submit button must remain disabled until every question has a non-unanswered status.

- [ ] **Step 4: Render subject-specific explanation fields**

For A-Level questions, after a correct answer show `Understanding` and `Scoring` sections in the existing AI panel. For IELTS Reading, show `Passage evidence` and `Pattern to avoid`. Hide these sections when the fields are absent.

- [ ] **Step 5: Run page and regression tests and commit**

Run: `npm test -- --run src/pages/Exercise.test.jsx src/features/exercise src/App.smoke.test.jsx`

Expected: the six-layer flow, session creation, and baseline smoke PASS.

```bash
git add Student_Frontend/src/pages/Exercise.jsx Student_Frontend/src/pages/Exercise.test.jsx
git commit -m "feat(student-exercise): complete six-layer practice flow"
```

### Task 6: Verify and push Module 2

**Files:**
- No new files unless a Module 2 verification failure requires a scoped fix.

**Interfaces:**
- Produces persisted sessions and variants for Module 3 diagnostics and Module 6 modeling.

- [ ] **Step 1: Run all automated gates**

Run: `npm test -- --run src/features/exercise src/pages/Exercise.test.jsx src/api/index.test.js src/store/AppStore.test.jsx`

Expected: targeted tests PASS.

Run: `npm test -- --run`

Expected: full suite PASS.

Run: `npm run build`

Expected: production build succeeds.

- [ ] **Step 2: Run browser and visual verification**

Using Playwright CLI, open teacher-task and bank exercise routes. Verify invalid input rejection, wrong-answer L1 unlock, sequential L2–L5 unlocks, correct-after-hint recording, handwritten toggle, all-question submit, summary navigation, L6 variant creation, reload persistence, and zero console errors. Compare desktop and 768px-wide screenshots with the baseline; page columns, sticky bars, and spacing must be unchanged.

- [ ] **Step 3: Confirm scope and push**

Run: `git status --short`

Expected: no output.

Run: `git log --oneline origin/main..HEAD`

Expected: Module 2 commits only.

Run: `git push origin main`

Expected: remote `main` advances to the Module 2 tip. Do not start Module 3 until the push succeeds.
