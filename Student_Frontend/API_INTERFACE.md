# NOME.AI Student — Frontend ↔ Backend Interface Contract

> Version 1.0 · English-first · Aligned with `student-prd.md` §8 (API endpoints) and §3 data models.
>
> **Frontend-only today:** when `VITE_API_BASE_URL` is unset the frontend runs in mock mode
> (`src/api/index.js` serves the same signatures from local data). Setting the env var switches every
> call below to real HTTP — **zero UI code changes required**.
>
> Swap point: `src/api/client.js` (HTTP) · `src/api/index.js` (endpoints) · `src/data/mockData.js` (mock adapter).

---

## Conventions

- Base URL: `{VITE_API_BASE_URL}`, e.g. `https://api.nome.ai`
- Content type: `application/json`
- Auth (future): `Authorization: Bearer <token>` header, issued by the backend; the frontend stores nothing else.
- Common response envelope:

```json
{ "code": 0, "message": "ok", "data": { /* payload below */ } }
```

- Response normalization: the HTTP client resolves the envelope's `data` value to endpoint callers.
  It also accepts a bare JSON payload for compatibility with an endpoint that does not wrap data.
- Error normalization: a non-2xx HTTP status or an envelope with `code !== 0` rejects with
  `ApiError`; it retains the backend message, HTTP `status`, and API `code`. Network and JSON
  parsing failures are likewise surfaced as `ApiError`. A non-JSON HTTP error retains its status
  with code `HTTP_<status>`, while an empty successful 204/205 response resolves to `null`.
- Mock persistence: without `VITE_API_BASE_URL`, the local adapter persists the state that backs
  these endpoint functions in `localStorage` key `nome-ai.student-state.v1`, using the versioned
  `{ version: 1, data }` envelope. State survives refreshes; missing, malformed, or incompatible
  stored data falls back to the seed state during bootstrap.
- Test helper: `resetMockState()` is exported from `src/api/index.js`. It clears that local key and
  returns a fresh bootstrapped seed state asynchronously. It does not introduce or alter an HTTP
  endpoint.
- Dates: ISO 8601 strings (`2026-08-05T22:00:00` or `2026-08-05` for date-only fields).

---

## 1. Bootstrap

### `GET /api/student/bootstrap`

One-shot load of everything the student shell needs. Frontend calls it once on mount (`AppProvider`).

**Response `data`:**

| Field | Type | Description |
|---|---|---|
| `student` | Student | Current student profile |
| `tasks` | Task[] | Pending + completed tasks |
| `taskAdjustments` | TaskAdjustment[] | Submitted adjustment requests; never removes the related task |
| `exerciseSets` | Record\<string, ExerciseSet\> | Task sets plus dynamically generated variant sets, keyed by set id |
| `bankExerciseSets` | Record\<string, ExerciseSet\> | Question-bank sets keyed by bank set id |
| `sessions` | Record\<string, Session\> | Persisted sessions keyed by `sessionId` (not an array) |
| `errors` | ErrorItem[] | Error-book entries |
| `notes` | Note[] | Notes |
| `noteFolders` | NoteFolder[] | Folder tree (auto-created by AI) |
| `settings` | Settings | Student preferences |
| `greeting` | Greeting | Home greeting copy |
| `moduleStats` | ModuleStats | Home module card numbers |
| `learningSummary` | LearningSummary | Mastery heatmap source |

---

## 2. Shared Types

### Student
| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `name` | string | |
| `avatar` | string \| null | URL |
| `joinedDays` | number | |
| `gradeInfo` | string | e.g. `"A-Level · Year 12 Science"` |

### Task
| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `title` | string | |
| `type` | enum | `teacher_assigned` \| `error_review` \| `ai_recommended` |
| `subject` | string | e.g. `"A-Level Math"`, `"IELTS Reading"` |
| `estimatedMinutes` | number | |
| `dueAt` | string \| null | ISO datetime |
| `assignedBy` | string \| null | Teacher name |
| `priority` | enum | `P0` \| `P1` \| `P2` |
| `isOverdue` | boolean | |
| `status` | enum | `pending` \| `completed` |
| `lastAccuracy` | number? | Optional, % of previous attempt |
| `exerciseSetId` | string? | Links to an exercise set |
| `topicIds` | string[]? | Linked curriculum topic ids |
| `completedAt` | string? | ISO datetime set when the task is completed |
| `adjustmentStatus` | enum? | `submitted` when the student has requested an adjustment |
| `sourceQuestionId` | string? | Source question for an independently generated variant task |
| `verificationForErrorId` | string? | Non-empty error id whose independent transfer check this task verifies |
| `reason` | string? | Variant tasks use `"Independent transfer check"` |
| `createdAt` | string? | ISO datetime for generated tasks |

### TaskAdjustment
| Field | Type | Notes |
|---|---|---|
| `id` | string | Client-generated request id |
| `taskId` | string | The teacher-assigned task being discussed |
| `reason` | enum | `time_conflict` \| `difficulty` \| `health` \| `other` |
| `details` | string | Optional student explanation |
| `availableMinutes` | number | Daily time the student can make available |
| `proposedDueAt` / `createdAt` | string | ISO datetimes |
| `status` | enum | Always `submitted` for this endpoint |

### Question
| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `order` | number | Position within a set |
| `type` | enum | `choice` \| `calculation` \| `proof` \| `fill_blank` \| `reading` \| `writing` |
| `topic` | string | Knowledge point, e.g. `"Calculus - Extrema"` |
| `difficulty` | number | 1–5 |
| `content` | string | HTML string (trusted, backend-rendered) |
| `options` | string[]? | Multiple choice only, `"A. ..."` prefixed |
| `correctIndex` | number? | Multiple choice only |
| `acceptKeywords` | string[] | Grading keywords for open answers |
| `correctDisplay` | string | Shown after solving |
| `errorType` | enum | `knowledge` \| `method` \| `calculation` \| `reading` \| `execution` \| `expression` \| `habit` |
| `hints` | Hint[] | L1–L5 progressive hints |
| `variantOf` | string? | Source question id when this is an L6 transfer variant |
| `sourceQuestionId` | string? | Optional explicit source reference carried by an API payload |
| `understandingExplanation` | string? | A-Level conceptual explanation shown after solving |
| `scoringExplanation` | string? | A-Level mark-scheme explanation shown after solving |
| `passageEvidence` | string? | IELTS passage evidence shown after solving |
| `errorPattern` | string? | IELTS reading pattern to avoid next time |

### Hint
| Field | Type | Notes |
|---|---|---|
| `level` | number | 1 clarify · 2 knowledge · 3 method · 4 key step · 5 full solution |
| `title` | string | |
| `content` | string | |

> L6 (variant question) is generated server-side on demand, not part of `hints`.

### ExerciseSet
| Field | Type | Notes |
|---|---|---|
| `id` | string? | Present on generated/dynamic sets and used as the `exerciseSets` key |
| `taskId` | string \| null | Owning task, if any |
| `title` | string | |
| `subject` | string | |
| `questions` | Question[] | |
| `sourceQuestionId` | string? | Source question for a generated L6 set |
| `createdAt` | string? | ISO datetime for a generated L6 set |

### ErrorItem
| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `questionId` | string | Dedupe key |
| `sessionId` | string \| null | Session that produced this diagnostic occurrence, when available |
| `subject` | string | |
| `errorType` | enum | `knowledge` \| `method` \| `calculation` \| `reading` \| `execution` \| `expression` \| `habit` |
| `questionSummary` | string | Plain-text excerpt |
| `questionContent` | string | HTML |
| `type` | Question.type \| null | Original question type, when available; only the six `Question.type` enum values are accepted |
| `difficulty` | integer \| null | Original difficulty, when available; 1-5 |
| `errorDescription` | string | AI explanation of the mistake |
| `relatedTopic` | string | |
| `topicId` | string \| null | |
| `whereWrong` / `whyWrong` | string | Concrete diagnostic location and root-cause evidence |
| `linkedAbility` | string | Ability targeted by the normalized error type |
| `hintDependency` | non-negative integer | Hints consumed in the source session |
| `firstOccurredAt` / `lastOccurredAt` | string | Valid ISO calendar date or RFC3339 timestamp |
| `occurrences` | string[] | Valid ISO calendar dates or RFC3339 timestamps |
| `occurrenceKeys` | string[] | Unique non-empty stable identities, normally `session:{sessionId}:question:{questionId}` |
| `occurrenceRecords` | `{ key, occurredAt }[]` | Unique non-empty keys with valid timestamps; when keys and records are both supplied, they must align exactly |
| `repeatCount` | positive integer | Number of distinct recurrence identities |
| `hasIncompleteOccurrenceHistory` | boolean? | Server-owned legacy migration marker; incoming batches must omit it or send `false` |
| `status` | enum | `pending_review` \| `reviewing` \| `verification_due` \| `mastered`; batch input must use `pending_review` |
| `studentAnswer` | string | |
| `correctAnswer` | string | |
| `analysis` | string | |
| `acceptKeywords` | string[] | For redo grading |
| `options` | string[]? | For choice-type redos |
| `correctIndex` | non-negative integer? | Must be smaller than `options.length` |
| `redoHistory` | RedoAttempt[] | Server-owned lifecycle evidence; batch input must use `[]` |
| `verificationVariantId` | string \| null | Server-owned exact generated exercise-set id; batch input must omit it or use `null` |
| `variantVerifiedAt` | string \| null | Server-owned timestamp of the latest accepted correct verification; batch input must omit it or use `null` |
| `variantVerification` | VariantVerification \| null | Server-owned audit result for the linked variant; batch input must omit it or use `null` |
| `understandingExplanation` / `scoringExplanation` | string? | Preserved A-Level diagnostic evidence |
| `markSchemePoints` | object[]? | Preserved A-Level mark-scheme evidence; every element must be a record |
| `passageEvidence` | string \| string[]? | Preserved IELTS passage evidence |
| `errorPattern` | string? | Preserved reading/habit evidence |

### RedoAttempt
| Field | Type |
|---|---|
| `attemptedAt` | string (valid ISO calendar date or RFC3339 timestamp) |
| `answer` | string |
| `isCorrect` | boolean |
| `timeSpent` | number (seconds) |

### VariantVerification
| Field | Type | Notes |
|---|---|---|
| `variantId` | string | Must equal `ErrorItem.verificationVariantId` |
| `isCorrect` | boolean | A wrong verification returns the item to `reviewing` |
| `verifiedAt` | string | Valid ISO calendar date or RFC3339 timestamp; must be at or after the latest correct redo and strictly later than any accepted verification |

### Note
| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `title` | string | |
| `folderId` | string | |
| `folderPath` | string | Display path, e.g. `"A-Level Math / Ch7 Calculus"` |
| `tags` | string[] | |
| `linkedTopics` | string[] | Topic ids |
| `linkedErrors` | string[] | ErrorItem ids |
| `source` | enum | `typed` \| `handwritten` \| `photo` \| `ai_organized` |
| `createdAt` / `updatedAt` | string (ISO date) | |
| `content` | NoteBlock[] | `{ t: 'p'|'h'|'formula', v: string }` |
| `aiSuggestions` | AiSuggestion[] | `{ type, message }`, type ∈ `split_note` \| `link_topic` \| `related_content` |

### NoteFolder
| Field | Type |
|---|---|
| `id` | string |
| `name` | string |
| `noteCount` | number |
| `autoCreated` | boolean |
| `children` | NoteFolder[]? |
| `parentId` | string? (children only) |

### Settings
| Field | Type | Notes |
|---|---|---|
| `tone` | number | 0 = warm & encouraging → 100 = strict coach |
| `dailyGoalHours` | number | 1–12 |
| `reminderTask` | boolean | Task deadline reminders |
| `reminderErrorReview` | boolean | Error review reminders |
| `reminderStudyTime` | boolean | Daily study-time reminders |

### Greeting
`{ message: string, fallback: string }`

### ModuleStats
`{ notesCount: number, weeklyExercises: number, latestAccuracy: number, pendingErrorReview: number }`

### LearningSummary
| Field | Type | Notes |
|---|---|---|
| `overallMastery` | number | % |
| `weeklyCompleted` / `weeklyTotal` | number | |
| `overdueTasks` | number | |
| `weakTopics` | string[] | |
| `knowledgeHeatmap` | `{ topicId, topicName, mastery }[]` | mastery 0–100 |

---

## 3. Write Endpoints

### Tasks

`PATCH /api/tasks/{id}` marks a task completed. Its returned task includes an ISO `completedAt` value and `isOverdue: false`.

`POST /api/tasks/{id}/adjustment-request` receives the full `TaskAdjustment` body (`id`, `taskId`, `reason`, `details`, `availableMinutes`, `proposedDueAt`, `createdAt`, `status`) and resolves `{ request, task }`. A submitted adjustment does not delete or complete the task: it stays `pending` with `adjustmentStatus: "submitted"`.

| Endpoint | Body | Notes |
|---|---|---|
| `PATCH /api/tasks/{id}` | `{ "status": "completed" }` | Mark task done; the response task includes `completedAt` and `isOverdue: false` (PRD §1.3) |
| `POST /api/tasks/{id}/adjustment-request` | Full `TaskAdjustment` body | Persist and return `{ request, task }`; the task remains pending with `adjustmentStatus: "submitted"` (PRD §1.4) |
| `POST /api/tasks` | Task (full object) | Create task (e.g. variant drill from summary page) |

### Error book
| Endpoint | Body | Notes |
|---|---|---|
| `POST /api/errors/batch` | `{ "items": ErrorItem[] }` | Upsert fresh recurrence evidence by `questionId`; count only distinct occurrence identities |
| `POST /api/errors/{id}/redo` | RedoAttempt | Correct sets `verification_due`; wrong sets `pending_review`; both clear stale verification evidence |
| `POST /api/errors/{id}/variant` | none | Atomically create the independent variant set/task and link both to the exact error id |
| `POST /api/errors/{id}/verification` | VariantVerification | Accept only the exact linked task/set/error provenance and chronological evidence |
| `PATCH /api/errors/{id}` | `{ "status": "mastered" }` | Valid only after a correct redo followed by a correct linked independent variant |

Error batches are validated atomically. In addition to the field constraints above, each redo entry
must contain all four `RedoAttempt` fields, every verification audit must be internally consistent,
and `passageEvidence` must be a string or an array of strings. An invalid item rejects the whole
batch without changing persisted state. Every batch item is fresh recurrence evidence: it must use
`status: "pending_review"`, an empty `redoHistory`, and null or absent verification fields. Lifecycle
state and mastery evidence are written only by their dedicated server endpoints. Batch items must
also include non-empty `occurrenceKeys` and matching `occurrenceRecords`; the unique identity count
must equal `repeatCount`. Clients cannot set `hasIncompleteOccurrenceHistory: true` to claim a larger
legacy aggregate. That marker is retained only while normalizing already persisted legacy cards.
`expression` and `habit` are valid normalized error types.

Mastery chronology is strict: a correct redo alone is not mastery. It first moves the item to
`verification_due`; the backend then schedules one independent variant. A correct verification
must prove this exact persisted chain: `ErrorItem.verificationVariantId` equals both the
`exerciseSets` record key and `ExerciseSet.id`; the set has a non-empty `taskId` resolving to exactly
one task; that task has the same `id`, set id, source question id, and `verificationForErrorId`; the
set has the same source question id and exactly one question whose `variantOf` is that source id.
The verification timestamp must not precede the latest correct redo. It then permits the final
mastery patch. Otherwise the patch rejects with code `MASTERY_GATE_NOT_MET` and message
`Complete the independent variant before marking this mastered`. A new recurrence or redo clears
stale verification evidence.

Malformed or out-of-order redo evidence, verification replay, and a conflicting verification at an
already accepted timestamp reject with code `INVALID_INPUT`; these failures do not mutate state.

### Notes
| Endpoint | Body | Notes |
|---|---|---|
| `POST /api/notes` | Note | Includes OCR-created notes |
| `PATCH /api/notes/{id}` | Partial\<Note\> | Title/tag/content updates, AI one-click organise |

### Exercise session
| Endpoint | Body | Notes |
|---|---|---|
| `POST /api/sessions` | Session | Submit whole exercise set (PRD §2.7) |
| `POST /api/questions/{questionId}/variant` | none | Generate and atomically persist the next deterministic L6 variant set and task; returns `{ exerciseSet, task }` |

#### Session
| Field | Type | Notes |
|---|---|---|
| `sessionId` | string | Client-generated |
| `taskId` | string \| null | |
| `taskTitle` | string | |
| `subject` | string | |
| `completedAt` | string (ISO datetime) | |
| `timeSpent` | number (minutes) | |
| `timeSpentSeconds` | number | |
| `questions` | SessionQuestion[] | One per attempted question |

#### SessionQuestion
Question fields plus `result`:

| Field | Type | Notes |
|---|---|---|
| `result.status` | enum | `correct` \| `wrong` \| `unanswered` |
| `result.attempts` | `{ answer, submittedAt, isCorrect }[]` | |
| `result.hintsUsed` | number | 0–5 |
| `result.solvedAtHintLevel` | number \| null | null if never solved |
| `result.handwritingUsed` | boolean? | Whether handwriting mode was used; legacy sessions may omit it, while the current exercise engine always sends it |

### Settings
| Endpoint | Body |
|---|---|
| `PATCH /api/student/settings` | Partial\<Settings\> |

---

## 4. Read Endpoints

Exercise pages use the two concrete set routes below. Other rows remain bootstrap-backed until their dedicated backend handlers land.

| Endpoint | Response `data` |
|---|---|
| `GET /api/bank/questions?subject=&difficulty=&type=&status=` | `BankQuestion[]` |
| `GET /api/bank/recommendations` | `{ questionId, reason }[]` |
| `GET /api/bank/exercise/{setId}` | ExerciseSet |
| `GET /api/exercise-sets/{taskId}` | ExerciseSet |
| `GET /api/student/profile` | `profileOverview + knowledgeGraph + progressTimeline + errorPatterns + achievements` |
| `GET /api/summary/{sessionId}` | Server-computed summary (accuracy, distribution, suggestions) |

### BankQuestion
| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `subject` / `topic` / `chapter` | string | |
| `type` | enum | Question.type |
| `difficulty` | number | 1–5 |
| `source` | enum | `past_exam` \| `mock` \| `teacher_upload` |
| `sourceDetail` | string | |
| `correctRate` | number | Global correct rate % |
| `attemptCount` | number | |
| `studentStatus` | enum | `not_attempted` \| `correct` \| `wrong` |
| `setId` | string \| null | Exercise set to open |
| `preview` | string | Plain-text snippet |

---

## 5. Frontend Usage Map

Task adjustments are submitted through `requestTaskAdjustment(task, draft)`; the store builds the request with its injected clock and id service before calling the endpoint.

| UI action | API call | Code path |
|---|---|---|
| App mount | `GET /api/student/bootstrap` | `AppStore.jsx` → `api.bootstrap()` |
| Open assigned exercise | `GET /api/exercise-sets/{taskId}` | `Exercise.jsx` → `loadExerciseSet({ taskId })` |
| Open bank exercise | `GET /api/bank/exercise/{setId}` | `Exercise.jsx` → `loadExerciseSet({ bankSetId })` |
| Open a persisted session summary | `GET /api/summary/{sessionId}` | `Summary.jsx` → `loadSessionSummary(sessionId)` |
| Check a task done | `PATCH /api/tasks/{id}` | `Home.jsx / Tasks.jsx` → `completeTask` |
| Submit adjustment request | `POST /api/tasks/{id}/adjustment-request` | `requestTaskAdjustment(task, draft)` |
| Add wrong Qs to error book | `POST /api/errors/batch` | `Summary.jsx` → `addSessionErrors` |
| Schedule independent verification | `POST /api/errors/{id}/variant` | `ErrorRedo.jsx` → `scheduleErrorVariant` |
| Record independent verification | `POST /api/errors/{id}/verification` | `Exercise.jsx` → `verifyErrorVariant` after the linked one-question set is persisted |
| Mark error mastered | `PATCH /api/errors/{id}` | `Errors.jsx` after the mastery gate |
| Submit redo | `POST /api/errors/{id}/redo` | `ErrorRedo.jsx` → `recordRedo` |
| Create / edit note | `POST`/`PATCH /api/notes...` | `Notes.jsx` |
| Submit exercise set | `POST /api/sessions` | `Exercise.jsx` → `saveSession` |
| Create L6 transfer task | `POST /api/questions/{questionId}/variant` | `Exercise.jsx` → `generateVariant(sourceQuestion)` |
| Save settings | `PATCH /api/student/settings` | `Profile.jsx` SettingsModal |
