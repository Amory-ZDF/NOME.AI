# Student Module 6 — Learning Profile, Knowledge Graph, and Motivation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an evidence-backed dynamic student model, update the knowledge graph from real activity, visualize meaningful progress, and reward effective learning behavior without rankings.

**Architecture:** Pure event reducers convert tasks, sessions, redos, notes, and settings into knowledge and student-model evidence. Selectors derive graphs, trends, error patterns, achievements, and feedback copy. API/store persist the profile; existing Home and Profile layouts render derived data.

**Tech Stack:** React 18.3.1, Vite 5.4.x, Vitest, React Testing Library, persisted evidence from Modules 0–5.

## Global Constraints

- Modules 0–5 must already be pushed with green tests.
- Preserve the existing Profile header, knowledge graph, timeline, error-pattern, achievement, and settings layout.
- Knowledge states are exactly `mastered`, `fuzzy`, `misconception`, and `not_learned`.
- Every model tag includes evidence, timestamp, confidence, and cadence; tags are not permanent personality labels.
- Update exercise evidence immediately, task/habit evidence daily, and trends weekly.
- Reward review, independent variant solving, and help-seeking; do not add rankings or peer comparisons.
- `Profile.jsx` and migrated Home learning widgets may not import `mockData.js`.
- Push only after targeted tests, full tests, build, end-to-end browser flows, visual checks, and final requirement audit pass.

---

### Task 1: Reduce learning events into knowledge evidence

**Files:**
- Create: `Student_Frontend/src/features/profile/knowledgeModel.js`
- Create: `Student_Frontend/src/features/profile/knowledgeModel.test.js`

**Interfaces:**
- Produces: `createKnowledgeNode({ id, name, prerequisites })`.
- Produces: `applyKnowledgeEvent(node, event)`.
- Produces: `deriveKnowledgeState(node)`.
- Event kinds: `attempt`, `session_completed`, `redo`, `variant_verification`, `note_linked`, and `teacher_confirmation`.
- Evidence item: `{ id, kind, sourceId, outcome, hintLevel, occurredAt, weight }`.

- [ ] **Step 1: Write failing evidence/state tests**

```js
test('independent transfer evidence can produce mastery', () => {
  let node = createKnowledgeNode({ id: 'calculus', name: 'Calculus', prerequisites: ['algebra'] })
  node = applyKnowledgeEvent(node, { id: 'ev-1', kind: 'redo', sourceId: 'e1', outcome: 'correct', hintLevel: 0, occurredAt: '2026-08-06', weight: 0.7 })
  node = applyKnowledgeEvent(node, { id: 'ev-2', kind: 'variant_verification', sourceId: 'v1', outcome: 'correct', hintLevel: 0, occurredAt: '2026-08-07', weight: 1 })
  expect(deriveKnowledgeState(node)).toMatchObject({ state: 'mastered', confidence: expect.any(Number) })
})

test('repeated wrong evidence marks a misconception instead of a weak personality label', () => {
  const repeatedWrongEvents = [
    { id: 'ev-1', kind: 'attempt', sourceId: 'q1', outcome: 'wrong', hintLevel: 2, occurredAt: '2026-08-05', weight: 1 },
    { id: 'ev-2', kind: 'attempt', sourceId: 'q2', outcome: 'wrong', hintLevel: 1, occurredAt: '2026-08-06', weight: 1 },
  ]
  const node = repeatedWrongEvents.reduce(applyKnowledgeEvent, createKnowledgeNode({ id: 'tfng', name: 'T/F/NG', prerequisites: [] }))
  expect(deriveKnowledgeState(node).state).toBe('misconception')
  expect(node).not.toHaveProperty('personality')
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- --run src/features/profile/knowledgeModel.test.js`

Expected: FAIL because the knowledge model does not exist.

- [ ] **Step 3: Implement evidence scoring and state thresholds**

Use outcome scores `correct: +1`, `wrong: -1`, `unanswered: -0.6`, multiplied by weight and `1 - min(hintLevel, 5) * 0.12`. Decay evidence older than 30 days by 50%. State thresholds: no learning evidence → `not_learned`; score at least `1.2` with a correct variant → `mastered`; two or more repeated wrong outcomes → `misconception`; otherwise → `fuzzy`. Confidence is `min(1, totalAbsoluteWeight / 3)` rounded to two decimals.

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- --run src/features/profile/knowledgeModel.test.js`

Expected: state, confidence, decay, dedupe, and teacher-confirmation tests PASS.

```bash
git add Student_Frontend/src/features/profile/knowledgeModel.js Student_Frontend/src/features/profile/knowledgeModel.test.js
git commit -m "feat(student-profile): model knowledge from evidence"
```

### Task 2: Build dynamic student tags and cadenced updates

**Files:**
- Create: `Student_Frontend/src/features/profile/studentModel.js`
- Create: `Student_Frontend/src/features/profile/studentModel.test.js`

**Interfaces:**
- Produces: `MODEL_DIMENSIONS`: `learning_goal`, `knowledge`, `ability`, `error_pattern`, `habit`, `interaction_preference`, `action_state`, `learning_state`.
- Produces: `upsertModelTag(model, tag)`.
- Produces: `applyImmediateEvents(model, events, now)`.
- Produces: `runDailyUpdate(model, evidence, now)`.
- Produces: `runWeeklyUpdate(model, evidence, now)`.
- Tag: `{ id, dimension, key, value, evidenceIds, confidence, updatedAt, cadence, status }`.

- [ ] **Step 1: Write failing tag and cadence tests**

```js
test('stores evidence and confidence for every tag', () => {
  const next = upsertModelTag({ tags: [] }, { id: 'tag-1', dimension: 'habit', key: 'review_consistency', value: 'improving', evidenceIds: ['task-1'], confidence: 0.6, updatedAt: '2026-08-06', cadence: 'daily', status: 'active' })
  expect(next.tags[0]).toMatchObject({ evidenceIds: ['task-1'], confidence: 0.6, cadence: 'daily' })
})

test('daily update does not rewrite weekly trend tags', () => {
  const model = { tags: [{ id: 'weekly-1', dimension: 'ability', key: 'transfer_trend', value: 'stable', evidenceIds: [], confidence: 0.4, updatedAt: '2026-08-01', cadence: 'weekly', status: 'active' }] }
  const dailyEvidence = [{ id: 'task-1', kind: 'task_completed', occurredAt: '2026-08-06' }]
  expect(runDailyUpdate(model, dailyEvidence, new Date('2026-08-06')).tags[0]).toEqual(model.tags[0])
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- --run src/features/profile/studentModel.test.js`

Expected: FAIL because the student model does not exist.

- [ ] **Step 3: Implement evidence-only model updates**

Reject tags without evidence except self-reported goals/preferences. Clamp confidence to `0..1`. Immediate updates cover current action/learning state and hint dependency. Daily updates cover completion, redo, review, delay, avoidance, and fatigue evidence. Weekly updates cover transfer, comprehension speed, calculation accuracy, repeated error reduction, and phase-goal progress. `status` supports `active`, `teacher_confirmed`, `teacher_modified`, and `teacher_rejected`.

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- --run src/features/profile/studentModel.test.js`

Expected: dimension, evidence, confidence, cadence, and teacher-state tests PASS.

```bash
git add Student_Frontend/src/features/profile/studentModel.js Student_Frontend/src/features/profile/studentModel.test.js
git commit -m "feat(student-profile): update dynamic learner tags"
```

### Task 3: Derive progress, graph links, and behavior rewards

**Files:**
- Create: `Student_Frontend/src/features/profile/profileSelectors.js`
- Create: `Student_Frontend/src/features/profile/profileSelectors.test.js`
- Create: `Student_Frontend/src/features/profile/rewardRules.js`
- Create: `Student_Frontend/src/features/profile/rewardRules.test.js`

**Interfaces:**
- Produces: `buildKnowledgeGraph({ nodes, notes, errors, questions })`.
- Produces: `buildProgressTimeline(events, { from, to })`.
- Produces: `buildProgressInsights(events)`.
- Produces: `evaluateRewards(events, existingAchievements)`.
- Reward kinds: `review_streak`, `independent_variant`, `help_seeking`, `error_reduction`, and `knowledge_mastery`.

- [ ] **Step 1: Write failing graph, progress, and reward tests**

```js
test('links prerequisite, notes, errors, and practice to each graph node', () => {
  const graph = buildKnowledgeGraph({ nodes: [{ id: 'calculus', name: 'Calculus', prerequisites: ['algebra'] }], notes: [{ id: 'n1', linkedTopics: ['calculus'] }], errors: [{ id: 'e1', topicId: 'calculus' }], questions: [{ id: 'q1', topicId: 'calculus' }] })
  expect(graph.nodes[0]).toMatchObject({ prerequisiteIds: ['algebra'], noteIds: ['n1'], errorIds: ['e1'], questionIds: ['q1'] })
})

test('rewards effective behavior rather than raw time or rank', () => {
  const rewards = evaluateRewards([{ id: 'ev-1', kind: 'variant_verification', outcome: 'correct', occurredAt: '2026-08-06' }], [])
  expect(rewards).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'independent_variant' })]))
  expect(rewards.some((reward) => reward.kind === 'leaderboard')).toBe(false)
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- --run src/features/profile/profileSelectors.test.js src/features/profile/rewardRules.test.js`

Expected: FAIL because selectors and rewards do not exist.

- [ ] **Step 3: Implement exact progress insights**

Insights must include: same-type errors reduced by percent, days from first evidence to mastery, average hint level change, independent variant completion count, and phase goal completion. Use at least two comparable events before claiming improvement; otherwise return `Not enough evidence yet`.

- [ ] **Step 4: Implement idempotent reward evaluation**

Achievements are keyed by behavior and milestone, e.g. `independent_variant:1`, `independent_variant:5`, `review_streak:3`, and `error_reduction:25`. Never award for total logged time alone. Preserve existing earned dates.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- --run src/features/profile/profileSelectors.test.js src/features/profile/rewardRules.test.js`

Expected: graph, insight, insufficient-evidence, idempotence, and no-ranking tests PASS.

```bash
git add Student_Frontend/src/features/profile/profileSelectors.js Student_Frontend/src/features/profile/profileSelectors.test.js Student_Frontend/src/features/profile/rewardRules.js Student_Frontend/src/features/profile/rewardRules.test.js
git commit -m "feat(student-profile): derive progress and rewards"
```

### Task 4: Make tone and preferences affect feedback copy

**Files:**
- Create: `Student_Frontend/src/features/profile/feedbackTone.js`
- Create: `Student_Frontend/src/features/profile/feedbackTone.test.js`
- Modify: `Student_Frontend/src/store/AppStore.jsx`

**Interfaces:**
- Produces: `formatFeedback(messageKey, data, settings)`.
- Tone `0..49`: warm and encouraging; tone `50..100`: strict coach.
- Message keys: `task_completed`, `adjustment_sent`, `wrong_attempt`, `redo_correct`, `variant_correct`, `progress_insight`.

- [ ] **Step 1: Write failing tone tests**

```js
test('uses warm and strict variants without changing factual content', () => {
  expect(formatFeedback('redo_correct', { topic: 'Calculus' }, { tone: 20 })).toBe('Nice recovery — you solved the Calculus error independently.')
  expect(formatFeedback('redo_correct', { topic: 'Calculus' }, { tone: 80 })).toBe('Calculus redo passed independently. Complete the variant to prove transfer.')
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- --run src/features/profile/feedbackTone.test.js`

Expected: FAIL because tone formatting does not exist.

- [ ] **Step 3: Implement all exact message variants**

Store actions call `formatFeedback` instead of hardcoded success text for the six keys. Error text and validation text remain factual and are not softened. Settings continue to persist through API.

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- --run src/features/profile/feedbackTone.test.js src/store/AppStore.test.jsx`

Expected: tone and store integration tests PASS.

```bash
git add Student_Frontend/src/features/profile/feedbackTone.js Student_Frontend/src/features/profile/feedbackTone.test.js Student_Frontend/src/store/AppStore.jsx Student_Frontend/src/store/AppStore.test.jsx
git commit -m "feat(student-profile): apply feedback tone preference"
```

### Task 5: Persist and expose the complete profile through API/store

**Files:**
- Modify: `Student_Frontend/src/api/index.js`
- Modify: `Student_Frontend/src/api/index.test.js`
- Modify: `Student_Frontend/src/store/AppStore.jsx`
- Modify: `Student_Frontend/src/store/AppStore.test.jsx`
- Modify: `Student_Frontend/API_INTERFACE.md`

**Interfaces:**
- API adds `getStudentProfile()`, `rebuildStudentProfile({ cadence, now })`, `updateModelTag(id, decision)`, and the existing `updateSettings(patch)`.
- Store adds `profile`, `loadProfile`, `refreshProfile`, `confirmModelTag`, `modifyModelTag`, and `rejectModelTag`.

- [ ] **Step 1: Write failing profile API tests**

```js
test('rebuilds a profile from persisted learning evidence', async () => {
  const result = await rebuildStudentProfile({ cadence: 'immediate', now: '2026-08-06T10:00:00Z' })
  expect(result).toMatchObject({ knowledgeGraph: expect.any(Object), progressTimeline: expect.any(Array), insights: expect.any(Array), achievements: expect.any(Array), model: { tags: expect.any(Array) } })
})

test('persists teacher rejection without deleting evidence', async () => {
  const updated = await updateModelTag('tag-1', { status: 'teacher_rejected', reason: 'insufficient classroom evidence' })
  expect(updated.tag.status).toBe('teacher_rejected')
  expect(updated.tag.evidenceIds.length).toBeGreaterThan(0)
})
```

- [ ] **Step 2: Implement profile aggregation and real endpoints**

Mock rebuild reads tasks, sessions, errors, notes, bank attempts, settings, and existing teacher decisions, then applies the pure reducers/selectors. Real endpoints:

```text
GET   /api/student/profile
POST  /api/student/profile/rebuild
PATCH /api/student/profile/tags/{id}
PATCH /api/student/settings
```

- [ ] **Step 3: Integrate store state and scheduling**

Refresh immediately after session submission, redo, variant verification, and note link. On boot, run at most one daily update per date and one weekly update per ISO week using persisted `lastDailyUpdate` and `lastWeeklyUpdate`. Avoid background intervals.

- [ ] **Step 4: Update contract and run tests**

Document knowledge states, evidence, confidence, cadences, dimensions, teacher decisions, progress insights, reward types, and profile rebuild request.

Run: `npm test -- --run src/api/index.test.js src/store/AppStore.test.jsx src/features/profile`

Expected: aggregation, cadence, teacher decision, settings, and failure recovery tests PASS.

- [ ] **Step 5: Commit API/store work**

```bash
git add Student_Frontend/src/api/index.js Student_Frontend/src/api/index.test.js Student_Frontend/src/store/AppStore.jsx Student_Frontend/src/store/AppStore.test.jsx Student_Frontend/API_INTERFACE.md
git commit -m "feat(student-profile): persist evidence-backed profile"
```

### Task 6: Migrate Profile and Home learning status without redesign

**Files:**
- Modify: `Student_Frontend/src/pages/Profile.jsx`
- Modify: `Student_Frontend/src/pages/Home.jsx`
- Create: `Student_Frontend/src/pages/Profile.test.jsx`
- Modify: `Student_Frontend/src/App.smoke.test.jsx`

**Interfaces:**
- Profile renders only API/store profile data.
- Home greeting, module stats, knowledge heatmap, weak topics, and progress come from the same derived profile.
- Knowledge-node detail links to `/notes`, `/errors`, and `/bank` with query parameters.

- [ ] **Step 1: Write failing profile and Home tests**

```jsx
import { fireEvent, screen } from '@testing-library/react'

test('shows evidence and links for a selected knowledge node', async () => {
  const user = userEvent.setup()
  renderStudentApp(<App />, { route: '/profile' })
  await user.click(await screen.findByRole('button', { name: /Calculus mastery/i }))
  expect(screen.getByText(/Evidence confidence/i)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Related notes/i })).toHaveAttribute('href', expect.stringContaining('/student/notes'))
})

test('persisted tone changes subsequent task feedback', async () => {
  const user = userEvent.setup()
  renderStudentApp(<App />, { route: '/profile?settings=1' })
  fireEvent.change(await screen.findByLabelText(/AI tone style/i), { target: { value: '80' } })
  await user.click(screen.getByRole('button', { name: /Save settings/i }))
  await user.click(screen.getByRole('link', { name: 'Home' }))
  await user.click(await screen.findByRole('checkbox', { name: /Physics Chapter 3/i }))
  expect(await screen.findByText(/Task completed/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- --run src/pages/Profile.test.jsx src/App.smoke.test.jsx`

Expected: FAIL because Profile/Home read static mock data and feedback is hardcoded.

- [ ] **Step 3: Replace static profile imports with store data**

Keep all existing sections and SVG sizing. Render knowledge state, mastery percentage, confidence, evidence count, prerequisites, linked notes/errors/questions, timeline insights, seven error types, achievements, and settings. Represent `not_learned` nodes with neutral stone rather than error red.

- [ ] **Step 4: Make graph links and settings functional**

Graph node links target `/notes?topic=...`, `/errors?topic=...`, and `/bank?topic=...`; the target pages read the query and initialize their existing search/filter controls. Settings fields have accessible labels and show persisted values after reload.

- [ ] **Step 5: Run page and regression tests and commit**

Run: `npm test -- --run src/pages/Profile.test.jsx src/App.smoke.test.jsx src/features/profile`

Expected: Profile, Home, links, settings, and tone tests PASS.

```bash
git add Student_Frontend/src/pages/Profile.jsx Student_Frontend/src/pages/Profile.test.jsx Student_Frontend/src/pages/Home.jsx Student_Frontend/src/App.smoke.test.jsx
git commit -m "feat(student-profile): complete learning profile UI"
```

### Task 7: Run the full product completion audit and push Module 6

**Files:**
- Modify: `Student_Frontend/README.md`
- Modify: `Student_Frontend/API_INTERFACE.md`

**Interfaces:**
- Produces the verified student frontend requested by the product document.

- [ ] **Step 1: Run Module 6 and full automated gates**

Run: `npm test -- --run src/features/profile src/pages/Profile.test.jsx src/App.smoke.test.jsx`

Expected: Module 6 tests PASS.

Run: `npm test -- --run`

Expected: every test from Modules 0–6 PASS.

Run: `npm run build`

Expected: production build succeeds.

- [ ] **Step 2: Run complete browser journeys**

Using Playwright CLI, complete these independent journeys with reload checks and zero console errors:

1. Teacher task priority → adjustment request → completion history.
2. Valid attempt → L1–L5 → correct solution → persisted session → L6 variant.
3. Summary → diagnosis → error dedupe → independent redo → variant verification → mastery.
4. Material upload → classification edit → note link → organize → undo → search.
5. Bank filters → evidence recommendation → every question practiceable → paper import.
6. Profile evidence → graph links → progress insight → achievement → tone persistence.

- [ ] **Step 3: Run responsive visual checks**

Capture Home, Tasks, Exercise, Summary, Errors, Notes, Bank, and Profile at 1440×900, 1024×768, and 390×844. Compare structure with the original baseline. Accept only approved functional controls and status content; reject navigation shifts, card-width changes, overflow, clipped controls, or altered design tokens.

- [ ] **Step 4: Audit every product requirement against evidence**

Create a temporary checklist in the terminal mapping each section of `2026-08-06-student-frontend-delivery-design.md` to test names, API contract sections, and browser journey results. Any requirement without direct evidence remains incomplete and must be fixed before push. Confirm there are no page/component imports from `src/data/mockData.js`:

Run: `Get-ChildItem src/pages,src/components -Recurse -File | Select-String -Pattern "data/mockData"`

Expected: no output.

- [ ] **Step 5: Update documentation with verified commands and module behavior**

README must list `npm install`, `npm test -- --run`, `npm run build`, route list, persistence reset, and real-backend switch. API contract must match every implemented endpoint and field.

- [ ] **Step 6: Commit documentation updates**

```bash
git add Student_Frontend/README.md Student_Frontend/API_INTERFACE.md
git commit -m "docs(student): finalize verified frontend contract"
```

- [ ] **Step 7: Confirm scope and push**

Run: `git status --short`

Expected: no output.

Run: `git log --oneline origin/main..HEAD`

Expected: Module 6 commits only.

Run: `git push origin main`

Expected: remote `main` advances to the verified Module 6 tip. Only after remote verification should the overarching student frontend goal be considered for completion.
