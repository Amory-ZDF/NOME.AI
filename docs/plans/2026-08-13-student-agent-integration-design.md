# Student-Agent integration design

Date: 2026-08-13
Status: approved (architecture option 1)
Scope: Student_Frontend, Student-Backend, and the boundary to the teammate-owned Python Agent service

## Context

The current repository has three backend processes:

- `Student-Backend` (Fastify/Prisma, port 3001) owns the real student data and all deterministic student state transitions.
- `backend/` (FastAPI, port 8000) owns prompts, model calls, memory, retrieval, the knowledge graph, and Agent orchestration.
- `Teacher-Backend` (Fastify, port 3002) is outside this change.

The teammate's latest `main` correctly removed duplicate student CRUD routers from the Python service. The remaining integration is incomplete:

- `Student_Frontend` has one `VITE_API_BASE_URL`, so it cannot safely split requests between two public services.
- `Student-Backend` deliberately leaves three Agent-backed public routes unregistered.
- The Python service does not yet implement those three route contracts.
- Both services currently claim `POST /api/sessions`, but with different meanings. The public student contract defines it as deterministic session persistence, which is already owned by `Student-Backend`.

## Decision

`Student-Backend` is the only browser-facing student API. `Student_Frontend` continues to use one base URL and its existing endpoint functions. No page layout or component hierarchy changes are required.

The Python service is an internal capability provider, not a second public student API. It generates classification or variant content but never owns student CRUD, tenant scoping, or relational persistence.

```text
Student_Frontend
       |
       | public /api/*
       v
Student-Backend :3001
  - configured-student scoping
  - lifecycle and provenance validation
  - Agent output validation
  - atomic Prisma persistence
       |
       | internal Agent contract
       v
Python Agent :8000
  - prompts / models
  - memory / RAG / knowledge graph
  - classification and generation only
```

## Public route ownership

Student-Backend owns every browser-facing route, including these three routes that become Agent-backed coordinators:

| Public route | Student-Backend responsibility | Python Agent responsibility |
|---|---|---|
| `POST /api/material-uploads/:id/process` | Validate job/id/state, invoke Agent, validate the full classification, persist `needs_confirmation` or a safe `failed` state | Produce a classification result |
| `POST /api/questions/:questionId/variant` | Resolve the scoped source question, invoke Agent, construct deterministic IDs/provenance, atomically create set and task | Produce new question content from the source |
| `POST /api/errors/:id/variant` | Validate the exact error/redo/source provenance, invoke Agent, atomically create the independent set/task and link the error | Produce an independent verification question |

`POST /api/sessions` remains exclusively owned by Student-Backend. The Python Agent session-analysis operation must use an internal, non-conflicting path if it remains available.

## Internal Agent client boundary

Student-Backend depends on an injected `StudentAgentClient` interface rather than importing Python code or model libraries:

- `classifyMaterial(request)`
- `generateQuestionVariant(request)`
- `generateErrorVariant(request)`

Tests use a deterministic fake implementation. Production uses an HTTP implementation configured by `AGENT_BASE_URL` and `AGENT_TIMEOUT_MS`. The recommended teammate-facing paths are namespaced under `/internal/v1/student-agent/*`; they are not browser contracts.

Every internal request includes:

- a stable operation/idempotency key owned by Student-Backend;
- the configured `studentId` as context, not as trusted authentication;
- only the minimum, strictly validated source data required for generation;
- no database URL, cookies, authorization headers from the browser, or model credentials.

Every response is treated as untrusted JSON and parsed with the canonical Student-Backend schemas before any write occurs. The Agent never supplies tenant identity or final relational IDs.

## Data flow and persistence

### Material processing

1. Load the scoped upload job and validate that its stored payload matches its indexed metadata.
2. Require `queued` or `failed`; reject cancelled/completed/confirmation states with the existing stable domain errors.
3. Invoke `classifyMaterial` with the safe metadata and the stable job operation key.
4. Validate the returned `MaterialClassificationResult` using the canonical schema.
5. Re-read the job in a transaction and persist the result only if the lifecycle state still permits it. Cancellation wins over late Agent completion.
6. On a safe Agent-domain failure, persist only a bounded `{ code, message }` failure. Infrastructure or invalid-output failures return a safe error and never leak raw Agent data.

Student-Backend continues to reject and never persist raw bytes/base64. The current public upload contract carries metadata only. Real OCR/file access therefore belongs to a teammate-owned ingestion mechanism that yields an opaque internal reference; until that mechanism exists, production material classification must fail explicitly rather than fabricate content.

### Question variant

1. Resolve exactly one scoped source question from task or bank provenance; ambiguity fails closed.
2. Build an internal request from the canonical source question and a stable operation key.
3. Validate the generated question, including hints, answer references, subject/type constraints, and raw/base64 prohibitions.
4. Student-Backend creates deterministic set/task identifiers and authoritative provenance fields.
5. A single transaction re-checks the source and idempotency state, then creates both records. A retry returns the already-created logical result; conflicting evidence is rejected.

### Error verification variant

1. Load and validate the scoped error card and its private occurrence binding.
2. Require the existing correct-redo lifecycle gate and no conflicting linked variant.
3. Resolve the exact source question and generate one independent question through the Agent client.
4. Validate the output, create deterministic set/task records, and link the exact error in one transaction.
5. Existing verification and mastery endpoints remain deterministic Student-Backend operations.

## Error handling

Public errors retain the common `{ code, message, data: null }` envelope.

- invalid public input or lifecycle: existing `400`/`409` domain errors;
- missing scoped resource: `404`;
- Agent unavailable or timed out: `503 AGENT_UNAVAILABLE`;
- Agent returned invalid/untrusted output: `502 AGENT_OUTPUT_INVALID`;
- corrupted stored data: existing safe `500 STORED_DATA_INVALID` or `INTERNAL_ERROR` policy.

Logs record a fixed event name, operation type, and safe correlation id. They must not include prompt text, generated raw payloads, upload contents, credentials, database URLs, or tenant data beyond the already-safe configured identifier policy.

Automatic retries are limited to transport failures that are safe under the stable idempotency key. Student-Backend re-reads state before committing, so a late response cannot overwrite cancellation or another successful variant.

## Configuration and runtime

Student-Backend adds validated server-only configuration:

- `AGENT_BASE_URL`: absolute HTTP(S) origin; loopback default may be used only outside production.
- `AGENT_TIMEOUT_MS`: bounded positive timeout.

The frontend keeps only `VITE_API_BASE_URL=http://localhost:3001`. No Agent URL or model credential is exposed to Vite.

The Python service must stop presenting its analysis-session endpoint as the public `/api/sessions` contract. This repository change will document the teammate handoff but will not implement prompts, memory, RAG, or Python Agent routes on the teammate's behalf.

## Testing strategy

Each functional module is developed and pushed independently:

1. **Agent client foundation**: config, strict transport/envelope parsing, timeout/abort, redacted logging, fake client, and no frontend change.
2. **Material process coordinator**: state matrix, cancellation race, invalid Agent output, failure persistence, idempotency, OpenAPI, and real SQLite tests.
3. **Question variant coordinator**: task/bank provenance, ambiguity, output validation, deterministic retry, concurrency, and atomic persistence tests.
4. **Error variant coordinator**: redo gate, exact error/source binding, chronology, retry/concurrency, atomic set/task/error persistence, and OpenAPI tests.
5. **Cross-service contract audit**: fake Agent end-to-end public flows, Python handoff fixtures, full Student-Backend and unchanged Student_Frontend regression suites.

For every module: capture RED first, implement the minimum production change, run focused tests, full backend tests, typecheck/build, Prisma validation/drift checks, and relevant frontend contract tests. Only a clean reviewed commit is non-force-pushed to `origin/main`.

## Collaboration boundaries

This work may change Student-Backend and contract/handoff documentation. It does not change Student_Frontend layout, Teacher code, Python prompts, model logic, memory, RAG, or Agent orchestration.

The teammate implements the internal Python endpoints against the versioned request/response fixtures produced by the Student-Backend contract module. If the teammate changes a contract, both sides update the fixture version explicitly; neither side silently weakens validation or reintroduces duplicate CRUD routes.

## Non-goals

- merging Teacher-Backend into Student-Backend in this workstream;
- sharing one SQLite file across processes;
- browser-to-Agent direct calls;
- authentication/tenant resolution beyond the current configured `STUDENT_ID` boundary;
- storing raw uploads, base64, prompts, or model secrets in Student-Backend;
- implementing or tuning teammate-owned Prompt/Memory/RAG/model behavior.
