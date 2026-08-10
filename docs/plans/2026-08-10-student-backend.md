# Student Backend Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an independently runnable, contract-compatible `Student-Backend/` for every non-Agent student feature, while reserving AI routes for the teammate and preserving the existing frontend layout.

**Architecture:** Implement a TypeScript Fastify modular monolith. Routes own transport validation and response envelopes, services own state transitions, and Prisma repositories persist student-scoped aggregates in SQLite. Agent-owned routes are explicit non-mutating 501 placeholders; no LLM, OCR, diagnosis, recommendation, or generation logic is added.

**Tech Stack:** Node.js 24, TypeScript, Fastify 5, Zod 4, Prisma 7, SQLite, Vitest 4, OpenAPI, npm.

---

## Mandatory execution rules

- Work only in the `codex/student-backend` worktree.
- Use `@superpowers:test-driven-development` for every implementation or bug fix.
- Use `@superpowers:systematic-debugging` before changing code in response to any unexpected failure.
- Use `@superpowers:verification-before-completion` before every success claim, commit, and push.
- Use `@superpowers:requesting-code-review` after each public module checkpoint.
- Never edit `Student_Frontend` layout or import frontend source at backend runtime.
- Treat `Student_Frontend/API_INTERFACE.md` and the pure frontend domain helpers listed below as behavioral specifications.
- Stage exact paths only. Do not stage existing or unrelated frontend files.
- After every task: run the focused tests, full backend tests, typecheck, and build; then commit and immediately push only if all required checks pass.
- Agent placeholders must return `501 AGENT_NOT_IMPLEMENTED` and prove no durable mutation.

## Behavior sources

- Contract: `Student_Frontend/API_INTERFACE.md`
- HTTP envelope expectations: `Student_Frontend/src/api/client.js`
- Current endpoint adapter and validation: `Student_Frontend/src/api/index.js`
- Task eligibility: `Student_Frontend/src/features/tasks/taskRules.js`
- Session summary: `Student_Frontend/src/features/errors/sessionSummary.js`
- Error recurrence and mastery: `Student_Frontend/src/features/errors/errorCards.js`, `Student_Frontend/src/features/errors/masteryRules.js`
- Note mutation/version rules: `Student_Frontend/src/features/materials/noteVersions.js`
- Material metadata and lifecycle contracts: `Student_Frontend/src/features/materials/materialRules.js`, `Student_Frontend/src/features/materials/materialContracts.js`
- Do not port Agent-owned implementations: `mockMaterialProcessor.js`, `variantFactory.js`, or recommendation/generation behavior.

## Checkpoint commands

Run from `Student-Backend/` unless a step says otherwise:

```powershell
npm test -- <focused-test-path>
npm test
npm run typecheck
npm run build
```

Expected checkpoint result: every command exits `0`; Vitest reports no failed or skipped required test; TypeScript reports no errors.

---

### Task 1: Package scaffold and validated configuration

**Files:**

- Create: `Student-Backend/package.json`
- Create: `Student-Backend/package-lock.json` through `npm install`
- Create: `Student-Backend/tsconfig.json`
- Create: `Student-Backend/tsconfig.build.json`
- Create: `Student-Backend/vitest.config.ts`
- Create: `Student-Backend/.gitignore`
- Create: `Student-Backend/.env.example`
- Create: `Student-Backend/src/config/env.ts`
- Create: `Student-Backend/test/config/env.test.ts`

**Step 1: Create the manifest and compiler/test configuration**

Create `package.json` with these scripts and dependency major ranges; `npm install` will lock exact compatible versions:

```json
{
  "name": "nome-ai-student-backend",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "engines": { "node": ">=24" },
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "start": "node dist/server.js",
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc --noEmit",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy",
    "db:seed": "prisma db seed",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@fastify/cors": "^11.0.0",
    "@fastify/swagger": "^9.0.0",
    "@fastify/swagger-ui": "^5.0.0",
    "@prisma/adapter-better-sqlite3": "^7.0.0",
    "@prisma/client": "^7.0.0",
    "fastify": "^5.0.0",
    "fastify-type-provider-zod": "^6.0.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "cross-env": "^10.0.0",
    "pino-pretty": "^13.0.0",
    "prisma": "^7.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.9.0",
    "vitest": "^4.0.0"
  }
}
```

Configure strict ESM TypeScript with `module`/`moduleResolution: "NodeNext"`, `target: "ES2023"`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `rootDir: "."`, and Vitest globals disabled. Override `rootDir` to `src/` in `tsconfig.build.json` and build only `src/**/*.ts` directly into `dist/`, so `npm start` resolves `dist/server.js`.

Ignore `node_modules/`, `dist/`, `.env`, `*.db`, `*.db-journal`, and generated coverage without ignoring Prisma migrations.

**Step 2: Install locked dependencies**

Run: `npm install`

Expected: exit `0`, `package-lock.json` created, npm audit reports no unresolved high/critical issue. If npm selects an incompatible major, pin the latest compatible minor inside the declared major and record why in the commit.

**Step 3: Write the failing environment tests**

```ts
import { describe, expect, it } from 'vitest'
import { parseEnv } from '../../src/config/env.js'

describe('parseEnv', () => {
  it('applies development defaults', () => {
    expect(parseEnv({ NODE_ENV: 'test', DATABASE_URL: 'file:./test.db' })).toMatchObject({
      NODE_ENV: 'test',
      PORT: 3001,
      HOST: '127.0.0.1',
      STUDENT_ID: 'stu-001',
      CORS_ORIGINS: ['http://localhost:5173'],
    })
  })

  it('rejects an invalid port and missing database URL', () => {
    expect(() => parseEnv({ NODE_ENV: 'test', PORT: '0' })).toThrow(/environment/i)
  })
})
```

**Step 4: Run the focused test and verify red**

Run: `npx vitest run test/config/env.test.ts`

Expected: FAIL because `src/config/env.ts` does not exist.

**Step 5: Implement strict environment parsing**

Export `parseEnv(input: NodeJS.ProcessEnv | Record<string, string | undefined>)` and `Env`. Use a strict Zod object with:

- `NODE_ENV`: `development | test | production`, default `development`;
- `HOST`: default `127.0.0.1`;
- `PORT`: coerced integer `1..65535`, default `3001`;
- `DATABASE_URL`: non-empty, required;
- `STUDENT_ID`: non-empty, default `stu-001` outside production;
- `CORS_ORIGINS`: comma-separated non-empty HTTP(S) origins, default `http://localhost:5173`;
- `LOG_LEVEL`: `fatal | error | warn | info | debug | trace | silent`, default `info`.

Map any Zod failure to one startup `Error('Invalid environment: ...')` without exposing secrets.

**Step 6: Run focused and static checks**

Run:

```powershell
npx vitest run test/config/env.test.ts
npm test
npm run typecheck
npm run build
```

Expected: PASS.

**Step 7: Commit and push scaffold**

```powershell
git add -- Student-Backend/package.json Student-Backend/package-lock.json Student-Backend/tsconfig.json Student-Backend/tsconfig.build.json Student-Backend/vitest.config.ts Student-Backend/.gitignore Student-Backend/.env.example Student-Backend/src/config/env.ts Student-Backend/test/config/env.test.ts
git commit -m "chore(student-backend): scaffold typed service"
git push -u origin codex/student-backend
```

---

### Task 2: Fastify application foundation

**Files:**

- Create: `Student-Backend/src/common/errors/app-error.ts`
- Create: `Student-Backend/src/common/http/envelope.ts`
- Create: `Student-Backend/src/common/http/error-handler.ts`
- Create: `Student-Backend/src/app.ts`
- Create: `Student-Backend/test/foundation/app.test.ts`

**Step 1: Write failing route-foundation tests**

Cover:

```ts
const app = await buildApp({ env: testEnv })
const health = await app.inject({ method: 'GET', url: '/health' })
expect(health.statusCode).toBe(200)
expect(health.json()).toEqual({ code: 0, message: 'ok', data: { status: 'ok' } })

const missing = await app.inject({ method: 'GET', url: '/missing' })
expect(missing.statusCode).toBe(404)
expect(missing.json()).toMatchObject({ code: 'NOT_FOUND' })
```

Also assert the configured origin receives `access-control-allow-origin`, an unconfigured origin does not, `/documentation/json` returns OpenAPI JSON, and a thrown `AppError` maps to the stable envelope without a stack.

**Step 2: Verify red**

Run: `npx vitest run test/foundation/app.test.ts`

Expected: FAIL because `buildApp` is missing.

**Step 3: Implement the foundation**

Implement:

```ts
export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly data: unknown = null,
  ) { super(message) }
}

export const ok = <T>(data: T) => ({ code: 0 as const, message: 'ok', data })
export const fail = (code: string, message: string, data: unknown = null) => ({ code, message, data })
```

`buildApp` must:

- accept injected `env` dependencies; Task 3 extends the dependency object with Prisma after the database client exists;
- register Zod validator/serializer compilers;
- register CORS, Swagger, and Swagger UI before routes;
- redact `authorization`, cookies, and database URLs in logs;
- register `GET /health`;
- map Zod/Fastify validation to HTTP 400 `INVALID_INPUT`;
- map unknown routes to HTTP 404 `NOT_FOUND`;
- map unexpected errors to HTTP 500 `INTERNAL_ERROR`, logging the private cause only;
- expose a clean `app.close()` lifecycle. Database shutdown is added to the server entrypoint in Task 3.

**Step 4: Verify and checkpoint**

Run the focused test, full `npm test`, `npm run typecheck`, and `npm run build`. Expected: all pass.

**Step 5: Commit and push**

```powershell
git add -- Student-Backend/src/common Student-Backend/src/app.ts Student-Backend/test/foundation/app.test.ts
git commit -m "feat(student-backend): add HTTP foundation"
git push origin codex/student-backend
```

---

### Task 3: Prisma schema, migrations, and isolated test database

**Files:**

- Create: `Student-Backend/prisma.config.ts`
- Create: `Student-Backend/prisma/schema.prisma`
- Create: `Student-Backend/prisma/migrations/**`
- Create: `Student-Backend/src/db/client.ts`
- Create: `Student-Backend/src/db/json.ts`
- Create: `Student-Backend/src/server.ts`
- Modify: `Student-Backend/package.json`
- Modify: `Student-Backend/src/app.ts`
- Create: `Student-Backend/test/helpers/database.ts`
- Create: `Student-Backend/test/db/schema.test.ts`

**Step 1: Write the failing database test**

Test that one student and every aggregate can be created, read through its `studentId`, and deleted by `resetDatabase()`. Also create the same `questionId` for two students and prove queries never cross student scope.

**Step 2: Verify red**

Run: `npm test -- test/db/schema.test.ts`

Expected: FAIL because Prisma configuration/schema are absent.

**Step 3: Define the Prisma 7 configuration and schema**

Use `prisma.config.ts` with `defineConfig`, `dotenv/config`, schema path, migration path, seed command `tsx prisma/seed.ts`, and `DATABASE_URL` from the environment.

Define these models:

- `Student`: scalar profile fields plus JSON `greeting`, `moduleStats`, `learningSummary`;
- `Task`: `id`, `studentId`, `type`, `status`, nullable `dueAt`, and complete JSON `payload`;
- `TaskAdjustment`: `id`, `studentId`, `taskId`, `status`, `createdAt`, JSON `payload`;
- `ExerciseSet`: `id`, `studentId`, nullable `taskId`, `kind` (`task`/`bank`), JSON `payload`;
- `Session`: `id`, `studentId`, `taskId`, `submittedAt`, JSON `payload`;
- `ErrorItem`: `id`, `studentId`, `questionId`, `status`, `lastOccurredAt`, JSON `payload`;
- `Note`: `id`, `studentId`, `version`, `updatedAtValue`, JSON `payload`;
- `NoteFolder`: `id`, `studentId`, nullable `parentId`, JSON `payload`;
- `MaterialUploadJob`: `id`, `studentId`, `status`, `createdAtValue`, JSON `payload`;
- `StudentSettings`: `studentId` primary key and JSON `payload`.

Add relations to `Student`, cascaded cleanup, unique aggregate ids, and indexes for student/state/lookup fields. Do not model Agent output tables.

Update the test scripts now that the database schema exists:

```json
{
  "test:prepare": "cross-env DATABASE_URL=file:./prisma/test.db prisma db push --force-reset --skip-generate",
  "test": "npm run test:prepare && cross-env DATABASE_URL=file:./prisma/test.db vitest run",
  "test:watch": "cross-env DATABASE_URL=file:./prisma/test.db vitest"
}
```

**Step 4: Generate and inspect the migration**

Run:

```powershell
npx cross-env DATABASE_URL=file:./prisma/dev.db prisma generate
npx cross-env DATABASE_URL=file:./prisma/dev.db prisma migrate dev --name init
```

Expected: generated client under `src/generated/prisma/`; one checked-in SQL migration; no database file staged.

**Step 5: Implement client and JSON boundaries**

`createPrisma(databaseUrl)` must construct the SQLite adapter and generated client without reading global environment. `toInputJson` must accept only validated JSON and centralize the narrow Prisma cast; repository/service files may not use `as Prisma.InputJsonValue` directly.

`resetDatabase` deletes child aggregates before `Student` inside a transaction.

Extend `buildApp` with an injected Prisma client. Implement `server.ts` to parse `process.env`, create the Prisma client, build/listen on Fastify, and close Fastify plus Prisma exactly once on `SIGINT` or `SIGTERM`.

**Step 6: Verify full database checkpoint**

Run focused tests, full backend tests, typecheck, and build. Expected: all pass.

**Step 7: Commit and push**

```powershell
git add -- Student-Backend/prisma.config.ts Student-Backend/prisma/schema.prisma Student-Backend/prisma/migrations Student-Backend/src/db Student-Backend/src/generated Student-Backend/src/server.ts Student-Backend/src/app.ts Student-Backend/test/helpers/database.ts Student-Backend/test/db/schema.test.ts Student-Backend/package.json Student-Backend/package-lock.json
git commit -m "feat(student-backend): add SQLite persistence"
git push origin codex/student-backend
```

---

### Task 4: Shared contracts, seed, bootstrap, and settings

**Files:**

- Create: `Student-Backend/src/contracts/student-contracts.ts`
- Create: `Student-Backend/prisma/seed-data.ts`
- Create: `Student-Backend/prisma/seed.ts`
- Create: `Student-Backend/src/modules/bootstrap/bootstrap.service.ts`
- Create: `Student-Backend/src/modules/bootstrap/bootstrap.routes.ts`
- Create: `Student-Backend/src/modules/settings/settings.service.ts`
- Create: `Student-Backend/src/modules/settings/settings.routes.ts`
- Modify: `Student-Backend/src/app.ts`
- Test: `Student-Backend/test/bootstrap/bootstrap.test.ts`
- Test: `Student-Backend/test/settings/settings.test.ts`

**Step 1: Write failing bootstrap contract tests**

Seed the test database, call `GET /api/student/bootstrap`, and assert the exact top-level keys:

```ts
expect(Object.keys(response.json().data).sort()).toEqual([
  'bankExerciseSets', 'errors', 'exerciseSets', 'greeting', 'learningSummary',
  'moduleStats', 'noteFolders', 'notes', 'sessions', 'settings', 'student',
  'taskAdjustments', 'tasks', 'uploadJobs',
].sort())
```

Assert exercise/session maps are keyed records, not arrays; every returned aggregate belongs to the configured student; and missing development student returns 404 without silently creating one.

**Step 2: Write failing settings tests**

Assert legal partial patches update only `dailyGoalHours`, `reminderErrorReview`, and `reminderStudyTime`; unknown keys, `dailyGoalHours` outside `1..12`, empty patches, and prototype-polluting JSON reject atomically.

**Step 3: Verify red**

Run both focused test files. Expected: route 404 or module import failure.

**Step 4: Implement strict shared Zod contracts**

Port the complete field sets and enums from `API_INTERFACE.md`. Use `z.strictObject` for mutation boundaries and preserve optional-field presence. Export schemas and inferred types for Student, Task, TaskAdjustment, Question, Hint, ExerciseSet, Session, ErrorItem, Note, NoteFolder, MaterialUploadJob, Settings, Greeting, ModuleStats, and LearningSummary.

Do not use `z.any`; use a recursive JSON schema plus domain schemas.

**Step 5: Add backend-owned seed data**

Create a compact but complete seed containing:

- `stu-001` profile;
- at least one pending teacher task, one completed task, one A-Level exercise set, one IELTS bank set, one session, one error card, one versioned note, one note folder, settings, greeting, module stats, and learning summary;
- no material job in an impossible lifecycle state;
- no generated Agent output beyond static demonstration fixtures already represented by the contract.

The seed file must not import `Student_Frontend`.

**Step 6: Implement bootstrap and settings in transactions**

Bootstrap reads all models through `studentId`, orders list data deterministically, parses every stored JSON payload before returning it, and filters nothing silently: invalid backend data is an internal contract error.

Settings uses an upsert only for the configured existing student and returns `{ settings }`.

**Step 7: Verify, commit, and push**

Run focused tests, full tests, typecheck, build, and `npm run db:seed` against a temporary development database. Then:

```powershell
git add -- Student-Backend/src/contracts Student-Backend/prisma/seed-data.ts Student-Backend/prisma/seed.ts Student-Backend/src/modules/bootstrap Student-Backend/src/modules/settings Student-Backend/src/app.ts Student-Backend/test/bootstrap Student-Backend/test/settings
git commit -m "feat(student-backend): add bootstrap and settings"
git push origin codex/student-backend
```

---

### Task 5: Task and time-management API

**Files:**

- Create: `Student-Backend/src/modules/tasks/task.service.ts`
- Create: `Student-Backend/src/modules/tasks/task.routes.ts`
- Modify: `Student-Backend/src/app.ts`
- Test: `Student-Backend/test/tasks/tasks.test.ts`

**Step 1: Write failing tests**

Cover:

- `POST /api/tasks` creates and returns `{ task }`;
- duplicate id returns 409 `DUPLICATE_ID` without mutation;
- `PATCH /api/tasks/{id}` accepts only `{ status: 'completed' }`, uses an injected clock, sets `completedAt`, and forces `isOverdue: false`;
- completing an already completed task is idempotent and does not rewrite `completedAt`;
- adjustment accepts only the full matching request, only for an eligible pending teacher task, persists `{ request, task }`, and leaves the task pending with `adjustmentStatus: 'submitted'`;
- mismatched body/path task id, duplicate request id, AI task adjustment, completed task, missing task, and invalid timestamps reject atomically;
- all lookups are student-scoped.

**Step 2: Verify red**

Run: `npm test -- test/tasks/tasks.test.ts`

Expected: route 404.

**Step 3: Implement task service and routes**

Port the pure adjustment eligibility rule from `taskRules.js`. Inject `now(): Date` into the service. Validate before opening the transaction; re-read the task inside the transaction before writing. Store the full validated payload and synchronize indexed status/type/dueAt fields.

**Step 4: Verify and push module**

Run all checkpoint commands, request code review, then:

```powershell
git add -- Student-Backend/src/modules/tasks Student-Backend/src/app.ts Student-Backend/test/tasks
git commit -m "feat(student-backend): add task management API"
git push origin codex/student-backend
```

---

### Task 6: Exercise-set read API

**Files:**

- Create: `Student-Backend/src/modules/exercises/exercise.service.ts`
- Create: `Student-Backend/src/modules/exercises/exercise.routes.ts`
- Modify: `Student-Backend/src/app.ts`
- Test: `Student-Backend/test/exercises/exercises.test.ts`

**Step 1: Write failing tests**

Assert:

- `GET /api/exercise-sets/{taskId}` resolves exactly one task-kind set by `taskId`;
- `GET /api/bank/exercise/{setId}` resolves only a bank-kind set by id;
- task/bank kind confusion returns 404;
- blank/encoded-invalid ids return 400;
- malformed stored question/hint payload becomes 500 `INTERNAL_ERROR`, never leaked JSON;
- another student's ids return 404.

**Step 2: Verify red**

Run the focused test. Expected: route 404.

**Step 3: Implement strict reads**

Query by `studentId` plus lookup key/kind, parse with `exerciseSetSchema`, and return the bare exercise-set payload inside the common success envelope so the frontend client resolves the same object as mock mode.

**Step 4: Verify, commit, and push**

Run all checkpoint commands, then commit `Student-Backend/src/modules/exercises`, app wiring, and its tests as `feat(student-backend): add exercise reads`; push immediately.

---

### Task 7: Session persistence and deterministic summary

**Files:**

- Create: `Student-Backend/src/modules/sessions/session-summary.ts`
- Create: `Student-Backend/src/modules/sessions/session.service.ts`
- Create: `Student-Backend/src/modules/sessions/session.routes.ts`
- Modify: `Student-Backend/src/app.ts`
- Test: `Student-Backend/test/sessions/sessions.test.ts`

**Step 1: Write failing tests**

Cover complete Session validation, exact `sessionId`, task linkage, duplicate rejection, chronological timestamps, answer type, and atomic persistence. For `GET /api/summary/{sessionId}`, assert the exact summary computed from mixed correct/incorrect attempts and preserved A-Level/IELTS explanatory fields.

Add a regression test proving a summary request never creates error cards, tasks, or variants.

**Step 2: Verify red**

Run focused tests. Expected: route 404.

**Step 3: Port deterministic summary logic**

Port only pure aggregation from `sessionSummary.js`. Keep semantic grading out: the submitted Session already contains `isCorrect` and explanatory evidence. Reject a session whose exercise/task provenance does not belong to the configured student.

**Step 4: Verify, commit, and push**

Run all checkpoint commands, then commit as `feat(student-backend): add exercise sessions`; push immediately.

---

### Task 8: Error recurrence, redo, and lifecycle foundations

**Files:**

- Create: `Student-Backend/src/modules/errors/error-cards.ts`
- Create: `Student-Backend/src/modules/errors/mastery.ts`
- Create: `Student-Backend/src/modules/errors/error.service.ts`
- Create: `Student-Backend/src/modules/errors/error.routes.ts`
- Modify: `Student-Backend/src/app.ts`
- Test: `Student-Backend/test/errors/error-batch.test.ts`
- Test: `Student-Backend/test/errors/error-redo.test.ts`

**Step 1: Write failing batch tests**

Test all seven normalized types, strict fresh-evidence requirements, non-empty unique occurrence keys, matching occurrence records/count, recurrence merge by `questionId`, repeated request idempotency, duplicate items inside one batch, and whole-batch rollback when any item is invalid.

**Step 2: Write failing redo tests**

Test:

- wrong redo -> `pending_review`;
- correct redo -> `verification_due`;
- both append the exact attempt and clear stale verification fields;
- timestamps cannot precede prior evidence or replay/conflict;
- a missing/other-student id returns 404;
- invalid redo has no mutation.

**Step 3: Verify red**

Run both focused files. Expected: route 404.

**Step 4: Port and type the pure rules**

Port the non-Agent recurrence merge and mastery transition rules. Preserve the frontend messages/codes where the contract fixes them. The batch accepts supplied diagnoses but never invents `errorType`, descriptions, links, or analysis.

**Step 5: Implement transactional routes**

Register `POST /api/errors/batch` and `POST /api/errors/{id}/redo`. Parse stored payload before transition, write the full payload and indexed status/timestamps together, and return `{ errors }` or `{ error }` exactly as the frontend adapter expects.

**Step 6: Verify, review, commit, and push**

Run all checkpoint commands, then commit as `feat(student-backend): add error recurrence and redo`; push immediately.

---

### Task 9: Error verification and mastery gate

**Files:**

- Modify: `Student-Backend/src/modules/errors/mastery.ts`
- Modify: `Student-Backend/src/modules/errors/error.service.ts`
- Modify: `Student-Backend/src/modules/errors/error.routes.ts`
- Test: `Student-Backend/test/errors/error-verification.test.ts`

**Step 1: Write failing provenance tests**

Seed an error already linked by an Agent-created variant id plus the exact exercise set and task. Assert successful verification only when:

- error, set, and verification ids match;
- set source question matches and contains exactly one `variantOf` question;
- set resolves to exactly one task;
- task id, exercise-set id, source-question id, and `verificationForErrorId` match;
- verification follows the latest correct redo chronologically.

Assert replay, conflicting same-time evidence, wrong provenance, wrong answer, and missing records reject without mutation.

**Step 2: Write failing mastery tests**

`PATCH /api/errors/{id}` accepts only `{ status: 'mastered' }`. It returns 409 `MASTERY_GATE_NOT_MET` with the exact documented message unless correct redo plus correct linked verification exists.

**Step 3: Verify red and implement**

Run focused tests, extend the transaction to read error/set/task together, port `recordVariantVerification` and `canMarkMastered`, and keep variant generation absent.

**Step 4: Verify, commit, and push**

Run all checkpoint commands, commit as `feat(student-backend): enforce error mastery gate`, and push.

---

### Task 10: Note creation, editing, and version continuity

**Files:**

- Create: `Student-Backend/src/modules/notes/note-versions.ts`
- Create: `Student-Backend/src/modules/notes/note.service.ts`
- Create: `Student-Backend/src/modules/notes/note.routes.ts`
- Modify: `Student-Backend/src/app.ts`
- Test: `Student-Backend/test/notes/note-crud.test.ts`
- Test: `Student-Backend/test/notes/note-update.test.ts`

**Step 1: Write failing list/create tests**

Cover ordered list, strict recursive note allowlist, legacy `version`/`versions` initialization, duplicate id, durable image references, and rejection of unknown/raw/base64/accessor-like carrier fields before persistence.

**Step 2: Write failing update tests**

Cover all editable fields, metadata precedence, exact client `changedAt`, default reason, immutable identity/source/provenance/createdAt/AI suggestions, no-op handling, one continuous version increment, exact prior snapshot, malformed dense JSON, and atomic rollback.

**Step 3: Verify red**

Run both focused files. Expected: route 404.

**Step 4: Port note rules and implement routes**

Port `sanitizeNote`, `sanitizePersistedNote`, `applyNotePatch`, snapshot construction, and change-metadata normalization into TypeScript. Register list/create/update routes. Do not generate suggestions or links.

**Step 5: Verify, review, commit, and push**

Run all checkpoint commands, commit as `feat(student-backend): add versioned notes`, and push.

---

### Task 11: Apply existing note suggestions and undo

**Files:**

- Modify: `Student-Backend/src/modules/notes/note-versions.ts`
- Modify: `Student-Backend/src/modules/notes/note.service.ts`
- Modify: `Student-Backend/src/modules/notes/note.routes.ts`
- Test: `Student-Backend/test/notes/note-organize.test.ts`
- Test: `Student-Backend/test/notes/note-undo.test.ts`

**Step 1: Write failing organize tests**

Assert only known supplied suggestion ids apply, unknown/duplicate ids reject, link/tag/content additions deduplicate, source becomes `ai_organized`, AI suggestion generation never occurs, and the exact action becomes one version step.

**Step 2: Write failing undo tests**

Assert the latest snapshot is restored, a traceable undo snapshot is appended, legacy null source preserves the current legal source, missing history returns the documented conflict code, and replay/out-of-order `changedAt` cannot corrupt history.

**Step 3: Verify red, implement, and verify green**

Port `applyNoteOrganization` and `undoLastNoteVersion`; perform each operation inside one read-validate-write transaction.

**Step 4: Commit and push**

After all checkpoint commands pass, commit as `feat(student-backend): add note organization history` and push.

---

### Task 12: Material metadata creation and cancellation

**Files:**

- Create: `Student-Backend/src/modules/materials/material-rules.ts`
- Create: `Student-Backend/src/modules/materials/material.service.ts`
- Create: `Student-Backend/src/modules/materials/material.routes.ts`
- Modify: `Student-Backend/src/app.ts`
- Test: `Student-Backend/test/materials/material-create.test.ts`
- Test: `Student-Backend/test/materials/material-cancel.test.ts`

**Step 1: Write failing creation tests**

Cover every `MaterialType`, supported MIME rules, size limit, generated id/time injection, caller id/time preservation, duplicate id, exact queued shape, and rejection of unknown/raw bytes/base64 fields.

**Step 2: Write failing cancellation tests**

Cover queued/processing/failed/needs-confirmation cancellation, terminal completed conflict, idempotent repeated cancellation, removal of state-specific `failure`/`result`, missing id, and student isolation.

**Step 3: Verify red and implement**

Port metadata-only rules and strict job sanitizer. Register create/cancel routes. Do not accept a file body and do not call OCR or a processor.

**Step 4: Verify, review, commit, and push**

Run all checkpoint commands, commit as `feat(student-backend): add material job lifecycle`, and push.

---

### Task 13: Material confirmation and Agent placeholders

**Files:**

- Modify: `Student-Backend/src/modules/materials/material.service.ts`
- Modify: `Student-Backend/src/modules/materials/material.routes.ts`
- Create: `Student-Backend/src/modules/agent-placeholders/agent-placeholder.routes.ts`
- Modify: `Student-Backend/src/app.ts`
- Test: `Student-Backend/test/materials/material-confirm.test.ts`
- Test: `Student-Backend/test/agent/agent-placeholders.test.ts`

**Step 1: Write failing confirmation tests**

Seed a strict `needs_confirmation` job as if the teammate's future Agent completed classification. Assert a legal partial classification patch creates exactly `note-{jobId}`, sets `sourceJobId`, initializes version 1, completes the job, and commits both atomically. Cover duplicate note id, wrong state, invalid patch/result, cancellation/completion conflicts, and rollback.

**Step 2: Write failing placeholder tests**

For each route:

```text
POST /api/material-uploads/{id}/process
POST /api/questions/{questionId}/variant
POST /api/errors/{id}/variant
```

assert HTTP 501 and:

```json
{ "code": "AGENT_NOT_IMPLEMENTED", "message": "Agent capability is not implemented", "data": null }
```

Snapshot every table before and after each request and assert byte-equivalent durable state.

**Step 3: Verify red and implement**

Implement confirmation using the strict material/note schemas and one Prisma transaction. Implement placeholders as dependency-free handlers that never query or mutate the database.

**Step 4: Verify, review, commit, and push**

Run all checkpoint commands, commit as `feat(student-backend): add material confirmation boundaries`, and push.

---

### Task 14: Cross-module contract and isolation audit

**Files:**

- Create: `Student-Backend/test/contract/frontend-contract.test.ts`
- Create: `Student-Backend/test/contract/isolation.test.ts`
- Create: `Student-Backend/test/contract/error-envelope.test.ts`
- Modify: implementation files only when a failing contract test proves a real mismatch

**Step 1: Write an endpoint matrix test**

Exercise every documented non-Agent route with frontend-shaped payloads and assert the resolved `data` shapes match `API_INTERFACE.md`. Assert all success responses are enveloped once, never double-wrapped.

**Step 2: Write isolation and failure tests**

Use two students with overlapping foreign identifiers. Assert every read/write remains scoped. Assert malformed JSON, unsupported content type, oversized JSON, missing ids, and unexpected exceptions return stable envelopes without internal paths, SQL, stack traces, or secrets.

**Step 3: Run and repair only proven mismatches**

Run focused contract tests. For each failure, use systematic debugging, add the narrow regression test first, and change the owning module rather than adding route-specific hacks.

**Step 4: Run complete verification**

```powershell
npm test
npm run typecheck
npm run build
npm run db:generate
```

Also run the unchanged frontend baseline from `Student_Frontend/`:

```powershell
npm test -- --run --reporter=dot
npm run build
```

Expected: backend fully green; frontend remains 28 test files / 897 tests or a higher count only if separately approved frontend changes are present; no layout files changed.

**Step 5: Commit and push**

Stage exact contract tests and any proven backend fixes, commit as `test(student-backend): verify frontend contract`, and push.

---

### Task 15: Operations documentation, startup smoke test, and final handoff

**Files:**

- Create: `Student-Backend/README.md`
- Create: `Student-Backend/AGENT_HANDOFF.md`
- Modify: `Student-Backend/.env.example`
- Modify: root `README.md` only to add one Student-Backend link/start command; do not edit frontend layout
- Test: `Student-Backend/test/smoke/startup.test.ts`

**Step 1: Write the failing startup smoke test**

Spawn the built server with a temporary SQLite URL and free localhost port, wait for `/health`, assert its envelope, then send a termination signal and assert a clean exit. Bound the test with a short timeout and always clean up the child process/database in `finally`.

**Step 2: Verify red, implement shutdown fixes if required, and rerun**

The smoke test must use the production build, not `tsx`, and must prove signal handling closes Fastify and Prisma exactly once.

**Step 3: Write operations documentation**

`README.md` must include:

- prerequisites and `npm install`;
- `.env` creation;
- migration, seed, development, test, typecheck, build, and production commands;
- `VITE_API_BASE_URL=http://localhost:3001` integration instruction;
- common response/error envelope;
- SQLite's development scope;
- current authentication limitation;
- exact implemented and 501-reserved route tables.

`AGENT_HANDOFF.md` must list the three placeholder routes, future six-level hint contract needs, seven error categories, material-classification result schema, transaction expectations, and the rule that Agent code supplies results while core services own persistence. Do not add Agent source code.

**Step 4: Final verification-before-completion audit**

Run from `Student-Backend/`:

```powershell
npm test
npm run typecheck
npm run build
npm run db:generate
npx prisma migrate reset --force
npm run db:seed
```

Run a production startup smoke request manually against `/health` and `/api/student/bootstrap`, then stop the server. Verify `git status --short`, `git diff --check`, tracked file list, and no `.env`, database, log, output, or secret artifact is staged.

Run the frontend tests/build again without changing layout.

**Step 5: Request final code review and address findings with TDD**

Use `@superpowers:requesting-code-review`. Any accepted correction receives a failing regression test, focused verification, full verification, its own scoped commit, and a push.

**Step 6: Commit and push handoff**

```powershell
git add -- Student-Backend/README.md Student-Backend/AGENT_HANDOFF.md Student-Backend/.env.example Student-Backend/test/smoke/startup.test.ts README.md
git commit -m "docs(student-backend): add operations and Agent handoff"
git push origin codex/student-backend
```

**Step 7: Finish the branch**

Use `@superpowers:finishing-a-development-branch` only after every acceptance criterion in the design is backed by current command output and repository evidence. Do not mark the overarching student goal complete while any student module or explicitly requested integration remains unfinished.
