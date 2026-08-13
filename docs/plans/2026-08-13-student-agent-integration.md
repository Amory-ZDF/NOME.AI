# Student-Agent Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Student-Backend the single public student API and add three strictly validated, transactionally persisted Agent-backed workflows without changing the Student_Frontend layout or implementing teammate-owned model logic.

**Architecture:** Add an injected `StudentAgentClient` boundary with a production HTTP adapter and deterministic test fake. Public routes stay in Fastify; each coordinator validates configured-student state before the call, treats Agent output as untrusted JSON, re-reads state before an atomic Prisma write, and fails closed on races or corrupt data. Python Prompt/Memory/RAG/model work stays outside this change.

**Tech Stack:** Node.js 24, TypeScript 5.9, Fastify 5, Zod 4, Prisma 7 with SQLite, Vitest 4, built-in `fetch`/`AbortSignal`, React/Vite frontend contract tests.

---

## Shared execution rules

- Work only in the existing isolated worktree: `NOME.AI/.worktrees/student-backend`.
- Before each module, run `git fetch origin main`, inspect `HEAD...origin/main`, and read any new teammate changes. Do not overwrite them.
- Follow `@superpowers:test-driven-development` for every production behavior: first record the precise RED, then implement.
- Keep `Student_Frontend/src` and all layout files unchanged. Only run its tests as compatibility evidence.
- Do not edit `backend/` Agent implementation, `Teacher-Backend`, or `Teacher_Frontend` in this plan.
- Never persist raw files, base64, prompts, credentials, or unvalidated Agent output.
- Use the user's existing test-database consent only for `Student-Backend/prisma/test.db`; never point a reset command at another database.
- After each module, run its focused tests plus the full gates listed below, commit only its exact scope, refresh `origin/main`, and non-force push `HEAD:main`.
- If `origin/main` advanced, stop before push, inspect the incoming diff, integrate it deliberately, rerun the module gates, then use a normal non-force push.

## Baseline commands

Run from `Student-Backend` unless a command says otherwise:

```powershell
$env:PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION='同意重置 Student-Backend/prisma/test.db 测试库并运行测试'
npm test
npm run typecheck
npm run build
$env:DATABASE_URL='file:./prisma/test.db'
npx prisma validate
npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code
npm audit --audit-level=high
```

Expected baseline: the existing complete backend suite passes, typecheck/build exit 0, Prisma reports no schema drift, audit reports no vulnerabilities, and `git status --short` is empty.

### Task 1: Agent client foundation

**Files:**

- Create: `Student-Backend/src/integrations/student-agent/student-agent.contracts.ts`
- Create: `Student-Backend/src/integrations/student-agent/student-agent.client.ts`
- Create: `Student-Backend/src/integrations/student-agent/http-student-agent.client.ts`
- Create: `Student-Backend/src/integrations/student-agent/student-agent.errors.ts`
- Create: `Student-Backend/test/integrations/student-agent-client.test.ts`
- Modify: `Student-Backend/src/config/env.ts`
- Modify: `Student-Backend/test/config/env.test.ts`
- Modify: `Student-Backend/src/app.ts`
- Modify: `Student-Backend/src/server.ts`
- Modify: `Student-Backend/.env.example`

**Step 1: Write environment RED tests**

Extend `test/config/env.test.ts` to assert:

```ts
expect(parseEnv(BASE_ENV)).toMatchObject({
  AGENT_BASE_URL: 'http://127.0.0.1:8000',
  AGENT_TIMEOUT_MS: 10_000,
})

expect(() => parseEnv({
  NODE_ENV: 'production',
  DATABASE_URL: 'file:./production.db',
  STUDENT_ID: 'stu-production',
})).toThrow(/AGENT_BASE_URL/)

expect(() => parseEnv({ ...BASE_ENV, AGENT_BASE_URL: 'file:///agent' }))
  .toThrow(/^Invalid environment/)
expect(() => parseEnv({ ...BASE_ENV, AGENT_TIMEOUT_MS: '0' }))
  .toThrow(/^Invalid environment/)
```

Run:

```powershell
npx vitest run --no-file-parallelism test/config/env.test.ts
```

Expected RED: Agent fields are absent and production does not require an explicit Agent origin.

**Step 2: Define strict internal contracts**

In `student-agent.contracts.ts`, reuse canonical schemas and export request/response schemas. The Agent supplies generated content; Student-Backend supplies final IDs and provenance.

```ts
export const agentOperationSchema = z.strictObject({
  contractVersion: z.literal(1),
  operationKey: z.string().min(1).max(200),
  studentId: z.string().min(1).max(100),
})

export const generatedQuestionSchema = safeStrictObject({
  type: questionTypeSchema,
  topic: z.string().min(1),
  difficulty: z.number().int().min(1).max(5),
  content: z.string().min(1),
  options: z.array(z.string().min(1)).min(1).optional(),
  correctIndex: z.number().int().nonnegative().optional(),
  acceptKeywords: z.array(z.string().min(1)),
  correctDisplay: z.string().min(1),
  errorType: errorTypeSchema,
  hints: z.array(hintSchema).length(5),
  understandingExplanation: z.string().min(1).optional(),
  scoringExplanation: z.string().min(1).optional(),
  markSchemePoints: z.array(jsonObjectSchema).optional(),
  passageEvidence: z.string().min(1).optional(),
  errorPattern: z.string().min(1).optional(),
})
```

Do not copy weaker versions of `MaterialClassificationResult`, `Question`, or error categories. Export any currently-private canonical primitives from `student-contracts.ts` only when required to avoid schema duplication.

**Step 3: Write HTTP adapter RED tests**

Create `test/integrations/student-agent-client.test.ts` with a local disposable HTTP server. Cover:

- exact internal path and POST JSON body for all three methods;
- `contractVersion: 1` and stable `operationKey` preservation;
- `{ code: 0, message: 'ok', data }` unwrapping;
- invalid JSON, success with nonzero code, extra keys, unsafe JSON, and invalid canonical output;
- timeout and caller abort;
- 4xx safe Agent-domain error versus 5xx/network unavailability;
- response-size ceiling and content-type enforcement;
- response and error messages contain none of the URL, prompt, authorization, database, or body sentinels.

Representative assertion:

```ts
await expect(client.generateQuestionVariant(request)).rejects.toMatchObject({
  name: 'AgentOutputInvalidError',
  code: 'AGENT_OUTPUT_INVALID',
})
expect(logOutput).not.toMatch(/PROMPT_SECRET|DATABASE_URL|Bearer/i)
```

Run:

```powershell
npx vitest run --no-file-parallelism test/integrations/student-agent-client.test.ts test/config/env.test.ts
```

Expected RED: modules do not exist.

**Step 4: Implement the interface and safe errors**

In `student-agent.client.ts`:

```ts
export interface StudentAgentClient {
  classifyMaterial(request: MaterialClassificationRequest): Promise<MaterialClassificationResult>
  generateQuestionVariant(request: QuestionVariantRequest): Promise<GeneratedQuestion>
  generateErrorVariant(request: ErrorVariantRequest): Promise<GeneratedQuestion>
}
```

In `student-agent.errors.ts`, define errors whose public mapping never carries the raw cause message:

```ts
export class AgentUnavailableError extends Error {
  readonly code = 'AGENT_UNAVAILABLE'
}

export class AgentOutputInvalidError extends Error {
  readonly code = 'AGENT_OUTPUT_INVALID'
}

export class AgentDomainError extends Error {
  constructor(readonly safeCode: string, readonly safeMessage: string) {
    super(safeMessage)
  }
}
```

The HTTP client must:

- build URLs only from the validated origin plus constant paths;
- use `AbortSignal.timeout(env.AGENT_TIMEOUT_MS)` combined with caller abort;
- set `Content-Type: application/json` and an internal contract-version header;
- read a bounded body before JSON parsing;
- parse the envelope and method-specific data schema;
- map timeout/network/5xx to `AgentUnavailableError`;
- map malformed/untrusted success to `AgentOutputInvalidError`;
- preserve only allowlisted domain codes/messages from a versioned Agent error envelope.

**Step 5: Wire configuration and dependency injection**

Add Zod-validated env fields. Non-production defaults to loopback; production requires an explicit origin. Update `.env.example` without secrets.

Add `studentAgentClient?: StudentAgentClient` to `BuildAppOptions`. `buildApp` must pass it to future route plugins but must not make a network call at startup. `runServer` creates one HTTP client from the parsed environment and injects it.

**Step 6: Run GREEN and regression gates**

```powershell
npx vitest run --no-file-parallelism test/integrations/student-agent-client.test.ts test/config/env.test.ts test/foundation/app.test.ts test/smoke/startup.test.ts
npm run typecheck
npm run build
npm test
git diff --check
```

Expected: all pass; no Student_Frontend diff; no Python/Teacher diff.

**Step 7: Commit and publish module 1**

```powershell
git add -- Student-Backend/src/integrations Student-Backend/src/config/env.ts Student-Backend/src/app.ts Student-Backend/src/server.ts Student-Backend/.env.example Student-Backend/test/integrations Student-Backend/test/config/env.test.ts
git diff --cached --check
git commit -m "feat(student-backend): add Agent client boundary"
git fetch origin main
git push origin HEAD:main
```

Push must be non-force and must succeed as a fast-forward.

### Task 2: Material process coordinator

**Files:**

- Create: `Student-Backend/test/materials/material-process.test.ts`
- Modify: `Student-Backend/src/modules/materials/material.routes.ts`
- Modify: `Student-Backend/src/modules/materials/material.service.ts`
- Modify: `Student-Backend/src/app.ts`
- Modify: `Student-Backend/src/contracts/student-contracts.ts` only if a canonical result helper must be exported, never to weaken validation

**Step 1: Write the route/state RED matrix**

Using real Fastify injection and SQLite, cover:

- queued and failed job success to exact `needs_confirmation`, `progress: 100`, validated result, and precise `updatedAt`;
- configured-student isolation and missing student/job;
- cancelled/completed/needs_confirmation rejection without calling Agent;
- invalid stored scalar/payload mismatch returns safe 500 without calling Agent;
- exact internal request fields and stable key derived from job identity plus current lifecycle version;
- invalid Agent result returns `502 AGENT_OUTPUT_INVALID`, zero write;
- unavailable/timeout returns `503 AGENT_UNAVAILABLE`, zero unsafe output leakage;
- allowlisted Agent-domain failure persists a bounded failed job and returns it in safe error data;
- cancel while Agent is pending wins; late completion performs no resurrection;
- identical concurrent process calls produce one logical classification and a consistent final row;
- 95/96-character id boundary, 413/415, OpenAPI response codes and strict schema;
- all ten Prisma models are byte-equivalent after every rejected operation.

Run:

```powershell
npx vitest run --no-file-parallelism test/materials/material-process.test.ts
```

Expected RED: route returns the existing 404 envelope.

**Step 2: Add the public route**

Register:

```ts
routes.post('/api/material-uploads/:id/process', {
  schema: {
    tags: ['materials'],
    summary: 'Classify a queued material job through the internal Agent',
    params: materialParamsSchema,
    response: {
      200: materialEnvelopeSchema,
      400: errorEnvelopeSchema,
      404: errorEnvelopeSchema,
      409: errorEnvelopeSchema,
      413: errorEnvelopeSchema,
      415: errorEnvelopeSchema,
      502: errorEnvelopeSchema,
      503: errorEnvelopeSchema,
      500: errorEnvelopeSchema,
    },
  },
}, async (request) => ok({ job: await service.process(request.params.id) }))
```

Reuse the same bodyless pre-validation rule as cancel; any request body is `400 INVALID_INPUT`.

**Step 3: Implement lifecycle-safe orchestration**

The service algorithm is:

```ts
const snapshot = await readAndValidateScopedJob(id)
assertProcessable(snapshot.job)
const result = await agentClient.classifyMaterial(buildRequest(snapshot.job))
const parsed = materialClassificationResultSchema.parse(result)
return retryTransaction(async (tx) => {
  const current = await readAndValidateScopedJob(id, tx)
  assertSameProcessGeneration(snapshot.job, current.job)
  assertProcessable(current.job)
  const next = materialUploadJobSchema.parse({
    ...current.job,
    status: 'needs_confirmation',
    progress: 100,
    result: parsed,
    updatedAt: now().toISOString(),
  })
  await writeExactJob(tx, next)
  return next
})
```

Do not hold a SQLite transaction open across the Agent network call. On the final transaction, re-read and compare the lifecycle generation so cancellation or a competing success wins.

**Step 4: Map safe Agent errors**

- `AgentUnavailableError` -> `503 AGENT_UNAVAILABLE`, no result write.
- `AgentOutputInvalidError` or canonical parse failure -> `502 AGENT_OUTPUT_INVALID`, no write.
- `AgentDomainError` -> transactionally persist `status: 'failed'`, bounded failure code/message and progress; throw a domain `AppError` whose data contains only the validated failed job.
- unknown errors -> common safe 500.

**Step 5: Run GREEN and all gates**

```powershell
npx vitest run --no-file-parallelism test/materials/material-process.test.ts test/materials/material-create.test.ts test/materials/material-cancel.test.ts test/materials/material-confirm.test.ts
npm test
npm run typecheck
npm run build
$env:DATABASE_URL='file:./prisma/test.db'
npx prisma validate
npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code
npm audit --audit-level=high
git diff --check
```

**Step 6: Commit and publish module 2**

```powershell
git add -- Student-Backend/src/modules/materials Student-Backend/src/app.ts Student-Backend/src/contracts/student-contracts.ts Student-Backend/test/materials/material-process.test.ts
git commit -m "feat(student-backend): coordinate material Agent processing"
git fetch origin main
git push origin HEAD:main
```

### Task 3: Question variant coordinator

**Files:**

- Create: `Student-Backend/src/modules/variants/variant-ids.ts`
- Create: `Student-Backend/src/modules/variants/question-variant.service.ts`
- Create: `Student-Backend/src/modules/variants/question-variant.routes.ts`
- Create: `Student-Backend/test/variants/question-variant.test.ts`
- Modify: `Student-Backend/src/app.ts`
- Modify: `Student-Backend/src/contracts/student-contracts.ts` only for reusable canonical generated-question construction

**Step 1: Write provenance and persistence RED tests**

Use real SQLite and an injected fake Agent. Cover:

- resolve source from task and bank sets;
- same question id in multiple scoped sets fails closed before Agent call;
- other-student-only source is 404;
- corrupt unrelated and matching stored sets follow the existing fail-closed policy;
- exact request contains canonical source, student context, contract version, and stable key;
- generated choice/calculation/reading questions are fully validated, including five ordered hints;
- Agent cannot choose final id, task id, order, `variantOf`, `sourceQuestionId`, or tenant;
- one transaction creates a one-question task set and linked task with exact provenance;
- retry returns the byte/logically identical existing result;
- conflicting deterministic ids return 409 and mutate nothing;
- two app/Prisma clients racing produce one logical result and no 500;
- invalid output/unavailable errors are 502/503 with zero writes;
- 100/101 path boundary, encoded slash, malformed URL, 413/415, and OpenAPI exact schemas;
- every rejected request preserves all ten student model snapshots.

Run:

```powershell
npx vitest run --no-file-parallelism test/variants/question-variant.test.ts
```

Expected RED: 404 route not found.

**Step 2: Implement deterministic authoritative identifiers**

In `variant-ids.ts`, use Node `createHash('sha256')` over a versioned tuple. Never concatenate unbounded public ids directly.

```ts
function digest(parts: readonly string[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 24)
}

export function questionVariantIds(studentId: string, sourceQuestionId: string) {
  const suffix = digest(['question-variant-v1', studentId, sourceQuestionId])
  return { setId: `variant-${suffix}`, taskId: `task-variant-${suffix}`, questionId: `q-variant-${suffix}` }
}
```

**Step 3: Construct canonical records after Agent validation**

The generated response omits authoritative identity fields. Build and parse the final objects:

```ts
const question = questionSchema.parse({
  ...generated,
  id: ids.questionId,
  order: 1,
  variantOf: source.id,
  sourceQuestionId: source.id,
})
const exerciseSet = exerciseSetSchema.parse({
  id: ids.setId,
  taskId: ids.taskId,
  title: `Independent transfer: ${source.topic}`,
  subject: sourceSet.subject,
  questions: [question],
  sourceQuestionId: source.id,
  createdAt: now,
})
const task = taskSchema.parse({
  id: ids.taskId,
  title: exerciseSet.title,
  type: 'error_review',
  subject: exerciseSet.subject,
  estimatedMinutes: 15,
  dueAt: null,
  assignedBy: null,
  priority: 'P1',
  isOverdue: false,
  status: 'pending',
  exerciseSetId: ids.setId,
  sourceQuestionId: source.id,
  reason: 'Independent transfer check',
  createdAt: now,
})
```

**Step 4: Persist idempotently**

Call Agent outside a transaction. Inside a bounded retrying transaction:

- re-resolve the exact source and verify it is unchanged;
- read deterministic task/set ids;
- if both exist, validate every scalar/payload/provenance field and return them;
- if neither exists, create task then set (or the FK-safe order required by the current schema) atomically;
- if only one exists or values conflict, return `409 VARIANT_CONFLICT` and roll back.

**Step 5: Register route and error schemas**

Add `POST /api/questions/:questionId/variant` with success `{ exerciseSet, task }`, public 400/404/409/413/415/500/502/503 envelopes, and the canonical id path schema.

**Step 6: Run GREEN and gates**

```powershell
npx vitest run --no-file-parallelism test/variants/question-variant.test.ts test/exercises/exercises.test.ts test/sessions/sessions.test.ts
npm test
npm run typecheck
npm run build
$env:DATABASE_URL='file:./prisma/test.db'
npx prisma validate
npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code
npm audit --audit-level=high
git diff --check
```

**Step 7: Commit and publish module 3**

```powershell
git add -- Student-Backend/src/modules/variants Student-Backend/src/app.ts Student-Backend/src/contracts/student-contracts.ts Student-Backend/test/variants/question-variant.test.ts
git commit -m "feat(student-backend): persist generated question variants"
git fetch origin main
git push origin HEAD:main
```

### Task 4: Error verification variant coordinator

**Files:**

- Create: `Student-Backend/src/modules/variants/error-variant.service.ts`
- Create: `Student-Backend/src/modules/variants/error-variant.routes.ts`
- Create: `Student-Backend/test/variants/error-variant.test.ts`
- Modify: `Student-Backend/src/modules/variants/variant-ids.ts`
- Modify: `Student-Backend/src/modules/errors/error.service.ts` only to expose a safe transaction-level scheduling operation or reuse its private aggregate parser without duplication
- Modify: `Student-Backend/src/app.ts`

**Step 1: Write lifecycle RED tests**

Cover:

- missing/cross-student error and source question;
- error without a correct redo;
- wrong status, already-linked variant, mastered error, incomplete legacy occurrence evidence;
- exact source question must match `error.questionId` and stored occurrence binding;
- Agent request contains only allowlisted error evidence and source question;
- output receives authoritative ids and `variantOf` provenance;
- transaction creates set/task and updates the exact error `verificationVariantId` together;
- task has `verificationForErrorId`, source id, exercise set id, and correct reason;
- deterministic retry returns identical set/task/error;
- concurrent same request produces one logical link; different conflicting evidence produces one winner and one 409, never a 500;
- invalid output/unavailable errors are 502/503 with no mutation;
- later `/verification` and `/mastered` routes accept the generated provenance;
- all failure, path, transport, OpenAPI, tenant, and ten-model rollback boundaries.

Run:

```powershell
npx vitest run --no-file-parallelism test/variants/error-variant.test.ts
```

Expected RED: route is absent.

**Step 2: Derive stable ids from the lifecycle gate**

The stable tuple must include the error id and the exact latest correct redo timestamp so a new legitimate redo generation is distinct while a transport retry is idempotent:

```ts
digest(['error-variant-v1', studentId, error.id, latestCorrectRedo.attemptedAt])
```

**Step 3: Implement pre-call and post-call validation**

Before Agent call:

- parse the private stored aggregate with existing error-card validation;
- require complete occurrence evidence;
- require a correct redo and no linked variant;
- resolve exactly one source question.

After Agent call, build canonical Question/ExerciseSet/Task objects as in Task 3, with `verificationForErrorId: error.id`.

Inside one retrying transaction:

- re-read error and source;
- assert the correct redo gate and operation tuple did not change;
- validate existing deterministic records for idempotent return or create both;
- update only that error aggregate's public `verificationVariantId` while retaining its private occurrence bindings;
- commit set, task, and error together.

**Step 4: Register route**

Add `POST /api/errors/:id/variant` with success `{ exerciseSet, task, error }` and exact 400/404/409/413/415/500/502/503 OpenAPI responses.

**Step 5: Run GREEN and gates**

```powershell
npx vitest run --no-file-parallelism test/variants/error-variant.test.ts test/errors/error-redo.test.ts test/errors/error-verification.test.ts
npm test
npm run typecheck
npm run build
$env:DATABASE_URL='file:./prisma/test.db'
npx prisma validate
npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code
npm audit --audit-level=high
git diff --check
```

**Step 6: Commit and publish module 4**

```powershell
git add -- Student-Backend/src/modules/variants Student-Backend/src/modules/errors/error.service.ts Student-Backend/src/app.ts Student-Backend/test/variants/error-variant.test.ts
git commit -m "feat(student-backend): persist error verification variants"
git fetch origin main
git push origin HEAD:main
```

### Task 5: Cross-service contract audit and teammate handoff

**Files:**

- Create: `Student-Backend/contracts/student-agent-v1/material-classification.request.json`
- Create: `Student-Backend/contracts/student-agent-v1/material-classification.response.json`
- Create: `Student-Backend/contracts/student-agent-v1/question-variant.request.json`
- Create: `Student-Backend/contracts/student-agent-v1/question-variant.response.json`
- Create: `Student-Backend/contracts/student-agent-v1/error-variant.request.json`
- Create: `Student-Backend/contracts/student-agent-v1/error-variant.response.json`
- Create: `Student-Backend/test/contract/student-agent-handoff.test.ts`
- Modify: `Student-Backend/AGENT_HANDOFF.md`
- Modify: `Student-Backend/README.md`
- Modify: `Student_Frontend/API_INTERFACE.md` only to document service ownership, without changing runtime shape
- Modify: `docs/plans/2026-08-13-student-agent-integration-design.md` only if implementation review proves a design correction

**Step 1: Write fixture RED tests**

The contract test must load every checked-in JSON fixture and parse it with the exact runtime schemas used by the HTTP client. Mutate each fixture one field at a time to prove extra keys, missing version, unsafe strings, invalid hints, invalid classification references, and Agent-supplied authoritative ids are rejected.

Add a route inventory test proving:

- all three public routes now exist only in Student-Backend;
- `POST /api/sessions` remains deterministic persistence;
- Student_Frontend still uses one base URL and unchanged endpoint paths;
- no frontend file references `AGENT_BASE_URL`, port 8000, prompts, or model secrets.

Expected RED: fixture directory and ownership documentation do not exist.

**Step 2: Write versioned teammate fixtures and docs**

Fixtures contain safe synthetic data only. `AGENT_HANDOFF.md` must state:

- exact internal request/response fixtures and version header;
- the three client method responsibilities;
- Agent must be idempotent per operation key;
- Agent returns generated content only, never tenant or database identifiers;
- Student-Backend validates and persists;
- Python public `/api/sessions` conflict must be renamed/removed by the teammate;
- material OCR requires a teammate-owned opaque ingestion reference; metadata-only jobs must not cause fabricated classification;
- no raw/base64/prompt/credential logging.

**Step 3: Run the complete end-to-end audit**

With a deterministic fake Agent:

- create/process/confirm a material and observe the linked note;
- generate a question variant, submit its session, and read its summary;
- add error evidence, correct redo, generate an error variant, persist its verification, and mark mastered;
- prove a second configured student cannot read or mutate any generated records;
- snapshot all ten models before each rejected cross-service flow;
- validate every public response against an independently constructed contract, not the same production schema instance.

Run:

```powershell
npx vitest run --no-file-parallelism test/contract/student-agent-handoff.test.ts test/contract/frontend-contract.test.ts test/contract/isolation.test.ts test/contract/error-envelope.test.ts
npm test
npm run typecheck
npm run build
$env:DATABASE_URL='file:./prisma/test.db'
npm run db:generate
npx prisma validate
npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code
npm audit --audit-level=high
git diff --check
git status --short
```

Then from `Student_Frontend`:

```powershell
npm test -- --run
npm run build
```

Expected: all tests and builds pass; the only acceptable frontend build note is the already-known chunk-size warning; `git diff -- Student_Frontend/src` is empty.

**Step 4: Independent review and completion audit**

Use `@superpowers:requesting-code-review`. The reviewer must compare:

- this design and implementation plan;
- `Student_Frontend/API_INTERFACE.md`;
- the three public route tests and Agent fixtures;
- current teammate Python route inventory;
- git scope from the pre-integration base to HEAD.

Fix every Critical/Important finding using `@superpowers:receiving-code-review` plus RED/GREEN evidence, then rerun all gates.

**Step 5: Commit and publish module 5**

```powershell
git add -- Student-Backend/contracts Student-Backend/test/contract/student-agent-handoff.test.ts Student-Backend/AGENT_HANDOFF.md Student-Backend/README.md Student_Frontend/API_INTERFACE.md docs/plans/2026-08-13-student-agent-integration-design.md
git diff --cached --check
git commit -m "test(student-backend): audit Agent integration contracts"
git fetch origin main
git push origin HEAD:main
```

Confirm after push:

```powershell
git rev-parse HEAD
git rev-parse origin/main
git status --short
```

Expected: local HEAD equals `origin/main`, worktree is clean, no force push occurred, and the teammate can implement the Python fixtures without reading Student-Backend internals.

## Completion criteria

This integration is complete only when current evidence proves all of the following:

- Student_Frontend uses one Student-Backend base URL and no layout/runtime-source change was required.
- All deterministic student routes, including public session persistence, remain owned by Student-Backend.
- The three Agent-backed public routes exist, validate scoped state, validate output, and persist atomically.
- Invalid/unavailable Agent behavior cannot leak data or partially mutate any student model.
- Retries and two-client races are idempotent or fail with stable domain conflicts, never arbitrary 500s.
- Exact versioned fixtures are available for the teammate-owned Python implementation.
- No Prompt/Memory/RAG/model implementation was duplicated.
- Every module was focused-tested, full-tested, reviewed, committed, and non-force-pushed to `origin/main`.
- Final backend/frontend/build/Prisma/audit/scope evidence is fresh and green.
