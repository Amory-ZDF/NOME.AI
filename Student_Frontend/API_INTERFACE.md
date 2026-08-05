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
| `errorType` | enum | `calculation` \| `method` \| `knowledge` \| `reading` \| `execution` |
| `hints` | Hint[] | L1–L5 progressive hints |

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
| `taskId` | string \| null | Owning task, if any |
| `title` | string | |
| `subject` | string | |
| `questions` | Question[] | |

### ErrorItem
| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `questionId` | string | Dedupe key |
| `subject` | string | |
| `errorType` | enum | Same as Question.errorType |
| `questionSummary` | string | Plain-text excerpt |
| `questionContent` | string | HTML |
| `errorDescription` | string | AI explanation of the mistake |
| `relatedTopic` | string | |
| `topicId` | string | |
| `firstOccurredAt` / `lastOccurredAt` | string | ISO date |
| `repeatCount` | number | |
| `status` | enum | `pending_review` \| `reviewing` \| `mastered` |
| `studentAnswer` | string | |
| `correctAnswer` | string | |
| `analysis` | string | |
| `acceptKeywords` | string[] | For redo grading |
| `options` | string[]? | For choice-type redos |
| `correctIndex` | number? | |
| `redoHistory` | RedoAttempt[] | |

### RedoAttempt
| Field | Type |
|---|---|
| `attemptedAt` | string (ISO date) |
| `answer` | string |
| `isCorrect` | boolean |
| `timeSpent` | number (seconds) |

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
| Endpoint | Body | Notes |
|---|---|---|
| `PATCH /api/tasks/{id}` | `{ "status": "completed" }` | Mark task done (PRD §1.3) |
| `POST /api/tasks/{id}/adjustment-request` | `{}` | Student can't complete → notify teacher (PRD §1.4) |
| `POST /api/tasks` | Task (full object) | Create task (e.g. variant drill from summary page) |

### Error book
| Endpoint | Body | Notes |
|---|---|---|
| `POST /api/errors/batch` | `{ "items": ErrorItem[] }` | Add wrong questions from a session |
| `PATCH /api/errors/{id}` | `{ "status": "mastered" }` | Only valid after ≥1 correct redo (PRD §4.3) |
| `POST /api/errors/{id}/redo` | RedoAttempt | Independent redo, no hints (PRD §4.4) |

### Notes
| Endpoint | Body | Notes |
|---|---|---|
| `POST /api/notes` | Note | Includes OCR-created notes |
| `PATCH /api/notes/{id}` | Partial\<Note\> | Title/tag/content updates, AI one-click organise |

### Exercise session
| Endpoint | Body | Notes |
|---|---|---|
| `POST /api/sessions` | Session | Submit whole exercise set (PRD §2.7) |

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

### Settings
| Endpoint | Body |
|---|---|
| `PATCH /api/student/settings` | Partial\<Settings\> |

---

## 4. Read-only Endpoints (future, served by bootstrap today)

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

| UI action | API call | Code path |
|---|---|---|
| App mount | `GET /api/student/bootstrap` | `AppStore.jsx` → `api.bootstrap()` |
| Check a task done | `PATCH /api/tasks/{id}` | `Home.jsx / Tasks.jsx` → `completeTask` |
| "Can't complete" | `POST /api/tasks/{id}/adjustment-request` | `cannotCompleteTask` |
| Add wrong Qs to error book | `POST /api/errors/batch` | `Summary.jsx` → `addErrors` |
| Mark error mastered | `PATCH /api/errors/{id}` | `Errors.jsx / ErrorRedo.jsx` |
| Submit redo | `POST /api/errors/{id}/redo` | `ErrorRedo.jsx` → `recordRedo` |
| Create / edit note | `POST`/`PATCH /api/notes...` | `Notes.jsx` |
| Submit exercise set | `POST /api/sessions` | `Exercise.jsx` → `saveSession` |
| Save settings | `PATCH /api/student/settings` | `Profile.jsx` SettingsModal |
