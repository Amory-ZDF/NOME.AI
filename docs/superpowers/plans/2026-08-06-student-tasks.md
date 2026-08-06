# Student Module 1 — Tasks and Time Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the task list reliably answer “what should I do now?” and let students submit a concrete, persistent adjustment request when a teacher task cannot be completed.

**Architecture:** Pure task selectors enforce teacher priority and deterministic ordering. AppStore/API own completion and adjustment mutations. Existing task-row markup moves unchanged into a shared feature component, with one existing-style modal added for adjustment details.

**Tech Stack:** React 18.3.1, Vite 5.4.x, Vitest, React Testing Library, persistent Mock API from Module 0.

## Global Constraints

- Module 0 must already be pushed and its full test suite must be green.
- Preserve current Home and Tasks layout, Tailwind classes, route paths, and English copy style.
- Teacher-assigned tasks always rank above error-review and AI-recommended tasks.
- Do not remove completed tasks; completed history must remain filterable.
- Pages and components may not import `mockData.js`.
- All task writes are Promise-based, duplicate-submit protected, recoverable on API failure, and documented in `API_INTERFACE.md`.
- Push `main` only after targeted tests, the full suite, build, browser smoke, and visual checks pass.

---

### Task 1: Add deterministic task ranking and filtering

**Files:**
- Create: `Student_Frontend/src/features/tasks/taskRules.js`
- Create: `Student_Frontend/src/features/tasks/taskRules.test.js`

**Interfaces:**
- Produces: `rankTasks(tasks, context)` where `context = { now, availableMinutes, weakTopics }`.
- Produces: `filterTasks(tasks, filter, now)` for `all`, `pending`, `overdue`, and `completed`.
- Produces: `getNextTask(tasks, context)` returning the highest ranked pending task or `null`.

- [ ] **Step 1: Write failing priority and filter tests**

```js
const now = new Date('2026-08-06T10:00:00Z')
const tasks = [
  { id: 'ai', type: 'ai_recommended', priority: 'P0', dueAt: '2026-08-06T11:00:00Z', estimatedMinutes: 10, status: 'pending', subject: 'Math' },
  { id: 'teacher', type: 'teacher_assigned', priority: 'P2', dueAt: '2026-08-07T12:00:00Z', estimatedMinutes: 30, status: 'pending', subject: 'Physics' },
  { id: 'done', type: 'teacher_assigned', priority: 'P0', dueAt: '2026-08-05T12:00:00Z', estimatedMinutes: 20, status: 'completed', subject: 'Math' },
]

test('teacher work stays ahead of AI recommendations', () => {
  expect(rankTasks(tasks, { now, availableMinutes: 60, weakTopics: [] }).map((task) => task.id)).toEqual(['teacher', 'ai', 'done'])
})

test('overdue is derived from dueAt instead of stale isOverdue data', () => {
  expect(filterTasks(tasks, 'overdue', now).map((task) => task.id)).toEqual([])
})
```

- [ ] **Step 2: Run the tests to verify failure**

Run: `npm test -- --run src/features/tasks/taskRules.test.js`

Expected: FAIL because the task rules module does not exist.

- [ ] **Step 3: Implement stable ranking and filters**

```js
const SOURCE_SCORE = { teacher_assigned: 0, error_review: 1, ai_recommended: 2 }
const PRIORITY_SCORE = { P0: 0, P1: 1, P2: 2 }

export const isTaskOverdue = (task, now) => task.status === 'pending' && Boolean(task.dueAt) && new Date(task.dueAt) < now

export function rankTasks(tasks, { now = new Date(), availableMinutes = Infinity, weakTopics = [] } = {}) {
  return [...tasks].sort((a, b) => {
    const aWeak = (a.topicIds ?? []).some((topic) => weakTopics.includes(topic))
    const bWeak = (b.topicIds ?? []).some((topic) => weakTopics.includes(topic))
    const values = [
      Number(a.status === 'completed') - Number(b.status === 'completed'),
      (SOURCE_SCORE[a.type] ?? 9) - (SOURCE_SCORE[b.type] ?? 9),
      Number(isTaskOverdue(b, now)) - Number(isTaskOverdue(a, now)),
      (PRIORITY_SCORE[a.priority] ?? 9) - (PRIORITY_SCORE[b.priority] ?? 9),
      Number(a.estimatedMinutes > availableMinutes) - Number(b.estimatedMinutes > availableMinutes),
      Number(!aWeak) - Number(!bWeak),
      (a.dueAt ? new Date(a.dueAt).getTime() : Infinity) - (b.dueAt ? new Date(b.dueAt).getTime() : Infinity),
    ]
    return values.find((value) => value !== 0) ?? a.id.localeCompare(b.id)
  })
}
```

Implement `filterTasks` using `isTaskOverdue`; `getNextTask` filters pending tasks before ranking.

- [ ] **Step 4: Run targeted tests**

Run: `npm test -- --run src/features/tasks/taskRules.test.js`

Expected: all ranking and filter cases PASS.

- [ ] **Step 5: Commit task rules**

```bash
git add Student_Frontend/src/features/tasks/taskRules.js Student_Frontend/src/features/tasks/taskRules.test.js
git commit -m "feat(student-tasks): rank teacher work first"
```

### Task 2: Define and validate adjustment requests

**Files:**
- Create: `Student_Frontend/src/features/tasks/adjustmentRules.js`
- Create: `Student_Frontend/src/features/tasks/adjustmentRules.test.js`

**Interfaces:**
- Produces: `ADJUSTMENT_REASONS` with `time_conflict`, `difficulty`, `health`, and `other`.
- Produces: `validateAdjustmentDraft(draft)` returning `{ valid, errors }`.
- Produces: `buildAdjustmentRequest({ task, draft, now, id })`.
- Request fields: `id`, `taskId`, `reason`, `details`, `availableMinutes`, `proposedDueAt`, `createdAt`, `status: 'submitted'`.

- [ ] **Step 1: Write failing validation and payload tests**

```js
test('requires a reason and a future proposed date', () => {
  const result = validateAdjustmentDraft({ reason: '', details: '', availableMinutes: 20, proposedDueAt: '2026-08-05T12:00:00Z' }, new Date('2026-08-06T10:00:00Z'))
  expect(result).toEqual({ valid: false, errors: { reason: 'Choose a reason', proposedDueAt: 'Choose a future time' } })
})

test('builds the exact teacher-facing adjustment payload', () => {
  expect(buildAdjustmentRequest({
    task: { id: 't1' },
    draft: { reason: 'time_conflict', details: 'Exam revision', availableMinutes: 20, proposedDueAt: '2026-08-07T12:00:00Z' },
    now: new Date('2026-08-06T10:00:00Z'),
    id: 'adj-1',
  })).toMatchObject({ id: 'adj-1', taskId: 't1', reason: 'time_conflict', status: 'submitted' })
})
```

- [ ] **Step 2: Run the tests to verify failure**

Run: `npm test -- --run src/features/tasks/adjustmentRules.test.js`

Expected: FAIL because the adjustment rules module does not exist.

- [ ] **Step 3: Implement validation and request construction**

Use exact messages from the tests. Clamp `availableMinutes` to an integer between 0 and 720. Trim `details`. Serialize `createdAt` and `proposedDueAt` as ISO strings. Reject an unknown reason with `Choose a valid reason`.

- [ ] **Step 4: Run targeted tests and commit**

Run: `npm test -- --run src/features/tasks/adjustmentRules.test.js`

Expected: all cases PASS.

```bash
git add Student_Frontend/src/features/tasks/adjustmentRules.js Student_Frontend/src/features/tasks/adjustmentRules.test.js
git commit -m "feat(student-tasks): validate adjustment requests"
```

### Task 3: Persist task completion and adjustment requests through API/store

**Files:**
- Modify: `Student_Frontend/src/api/index.js`
- Modify: `Student_Frontend/src/api/index.test.js`
- Modify: `Student_Frontend/src/store/AppStore.jsx`
- Modify: `Student_Frontend/src/store/AppStore.test.jsx`
- Modify: `Student_Frontend/API_INTERFACE.md`

**Interfaces:**
- `completeTask(id)` resolves `{ task }` and persists `completedAt`.
- `reportTaskAdjustment(id, request)` resolves `{ request, task }`; task remains present with `status: 'pending'` and `adjustmentStatus: 'submitted'`.
- App context exposes `taskAdjustments`, `completeTask(id)`, and `requestTaskAdjustment(task, draft)`.

- [ ] **Step 1: Write failing API persistence tests**

```js
test('an adjustment request keeps the task and marks it submitted', async () => {
  const request = { id: 'adj-1', taskId: 't1', reason: 'difficulty', details: '', availableMinutes: 20, proposedDueAt: '2026-08-08T10:00:00Z', createdAt: '2026-08-06T10:00:00Z', status: 'submitted' }
  await reportTaskAdjustment('t1', request)
  const data = await bootstrap()
  expect(data.tasks.find((task) => task.id === 't1')).toMatchObject({ status: 'pending', adjustmentStatus: 'submitted' })
  expect(data.taskAdjustments).toContainEqual(request)
})
```

- [ ] **Step 2: Run the test to verify failure**

Run: `npm test -- --run src/api/index.test.js -t "adjustment request"`

Expected: FAIL because the current mock API ignores the request and does not persist it.

- [ ] **Step 3: Implement repository transactions and real endpoint payloads**

Mock mode must append the request and patch only the matching task. Real mode must call:

```js
http.post(`/api/tasks/${id}/adjustment-request`, request)
```

For completion, persist:

```js
{ ...task, status: 'completed', completedAt: now().toISOString(), isOverdue: false }
```

- [ ] **Step 4: Integrate recoverable store actions**

`completeTask` and `requestTaskAdjustment` must return Promises, use action keys `task:complete:${id}` and `task:adjust:${id}`, prevent duplicate submission, roll back on failure, and show existing-style success/error toasts. Remove `removeTask` and the old `cannotCompleteTask` behavior that filtered tasks out.

- [ ] **Step 5: Update the API contract**

Document the adjustment body fields and add `topicIds`, `completedAt`, `adjustmentStatus`, and `taskAdjustments` to bootstrap/task types. State that a submitted adjustment does not delete or complete the task.

- [ ] **Step 6: Run API/store tests and commit**

Run: `npm test -- --run src/api/index.test.js src/store/AppStore.test.jsx`

Expected: completion, adjustment, failure rollback, and duplicate-action tests PASS.

```bash
git add Student_Frontend/src/api/index.js Student_Frontend/src/api/index.test.js Student_Frontend/src/store/AppStore.jsx Student_Frontend/src/store/AppStore.test.jsx Student_Frontend/API_INTERFACE.md
git commit -m "feat(student-tasks): persist task outcomes"
```

### Task 4: Reuse the existing task row and add the adjustment modal

**Files:**
- Create: `Student_Frontend/src/features/tasks/TaskList.jsx`
- Create: `Student_Frontend/src/features/tasks/TaskAdjustmentModal.jsx`
- Modify: `Student_Frontend/src/pages/Home.jsx`
- Modify: `Student_Frontend/src/pages/Tasks.jsx`
- Create: `Student_Frontend/src/features/tasks/TaskList.test.jsx`
- Create: `Student_Frontend/src/features/tasks/TaskAdjustmentModal.test.jsx`

**Interfaces:**
- `TaskList({ tasks, limit, now, availableMinutes, weakTopics })` renders ranked tasks.
- `TaskAdjustmentModal({ task, open, onClose })` submits through `requestTaskAdjustment`.
- Home displays `Next up` on the first ranked pending task without changing the card grid.

- [ ] **Step 1: Write failing interaction tests**

```jsx
test('completed tasks remain visible on the Completed filter', async () => {
  const user = userEvent.setup()
  renderStudentApp(<App />, { route: '/tasks' })
  await user.click(await screen.findByRole('checkbox', { name: /Math P3 Ch7 Review/i }))
  await user.click(screen.getByRole('button', { name: 'Completed' }))
  expect(await screen.findByText(/Math P3 Ch7 Review/i)).toBeInTheDocument()
})

test('submits a detailed adjustment request without removing the task', async () => {
  const user = userEvent.setup()
  renderStudentApp(<App />)
  await user.click(await screen.findByRole('button', { name: /more options for Math P3/i }))
  await user.click(screen.getByRole('menuitem', { name: /I can't complete this/i }))
  await user.selectOptions(screen.getByLabelText('Reason'), 'time_conflict')
  await user.type(screen.getByLabelText('Details'), 'Mock exam preparation')
  await user.clear(screen.getByLabelText('Available minutes'))
  await user.type(screen.getByLabelText('Available minutes'), '20')
  await user.type(screen.getByLabelText('Proposed new time'), '2026-08-08T12:00')
  await user.click(screen.getByRole('button', { name: 'Send adjustment request' }))
  expect(await screen.findByText(/Request sent to your teacher/i)).toBeInTheDocument()
  expect(screen.getByText(/Math P3 Ch7 Review/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the component tests to verify failure**

Run: `npm test -- --run src/features/tasks/TaskList.test.jsx src/features/tasks/TaskAdjustmentModal.test.jsx`

Expected: FAIL because the shared feature components do not exist.

- [ ] **Step 3: Move task markup without redesigning it**

Move `TaskItem` and `TaskList` from `Home.jsx` to `features/tasks/TaskList.jsx`. Preserve existing class strings and motion variants. Add accessible names to the checkbox and more-options button. Replace the menu callback with modal state.

- [ ] **Step 4: Implement the existing-style modal**

Use the current `Modal`, `zb-input`, `zb-btn-primary`, and `zb-btn-ghost` primitives. Render one select, one details textarea, one numeric input, and one `datetime-local` input. Show field errors directly beneath their controls; disable the submit button while `isActionPending(task:adjust:${id})` is true.

- [ ] **Step 5: Wire Home and Tasks to selectors**

Home passes the current learning-summary weak topics and a default 60 available minutes. Tasks uses `filterTasks` for tabs, derives overdue state from the supplied clock, and shows a compact `Next up` badge on the top pending item.

- [ ] **Step 6: Run UI tests and commit**

Run: `npm test -- --run src/features/tasks/TaskList.test.jsx src/features/tasks/TaskAdjustmentModal.test.jsx src/App.smoke.test.jsx`

Expected: task interactions and baseline smoke PASS.

```bash
git add Student_Frontend/src/features/tasks Student_Frontend/src/pages/Home.jsx Student_Frontend/src/pages/Tasks.jsx Student_Frontend/src/App.smoke.test.jsx
git commit -m "feat(student-tasks): complete task planning flow"
```

### Task 5: Verify and push Module 1

**Files:**
- No new files unless a failing check exposes a Module 1 defect.

**Interfaces:**
- Produces a pushed task module consumed by exercise and profile modules.

- [ ] **Step 1: Run targeted and full automated gates**

Run: `npm test -- --run src/features/tasks src/api/index.test.js src/store/AppStore.test.jsx`

Expected: all targeted tests PASS.

Run: `npm test -- --run`

Expected: full suite PASS.

Run: `npm run build`

Expected: production build succeeds.

- [ ] **Step 2: Run browser and visual verification**

Using Playwright CLI at `http://127.0.0.1:4173/student/`, complete a task, filter it under Completed, submit an adjustment request, reload, and confirm both states persist. Confirm teacher work appears above AI recommendations and browser console has zero errors. Compare Home and Tasks screenshots with the baseline; only the approved modal, status badge, and `Next up` marker may differ.

- [ ] **Step 3: Confirm scope, commit repairs if required, and push**

Run: `git status --short`

Expected: no output.

Run: `git log --oneline origin/main..HEAD`

Expected: Module 1 commits only.

Run: `git push origin main`

Expected: remote `main` advances to the Module 1 tip. Do not start Module 2 until the push succeeds.
