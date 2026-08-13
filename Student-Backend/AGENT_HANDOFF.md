# Student Agent v1 handoff

This document is the implementation boundary between `Student-Backend` and the teammate-owned Python Agent service. It does not prescribe prompts, memory, RAG, model choice, or orchestration.

## Service ownership

`Student-Backend` is the one browser-facing Student API. It owns every public `/api/*` route, configured-student scoping, validation, lifecycle/provenance rules, deterministic identifiers, Prisma transactions, and persistence. This includes:

- `POST /api/material-uploads/:id/process`
- `POST /api/questions/:questionId/variant`
- `POST /api/errors/:id/variant`
- deterministic session persistence at `POST /api/sessions`

The Python service is an internal capability provider. Its existing public `POST /api/sessions` conflicts with the deterministic Student contract and the teammate must rename or remove that route. The browser must never call the Python service directly.

## Transport contract

Student-Backend sends `POST` JSON to the following internal endpoints:

| Client responsibility | Internal path | Request fixture | Successful `data` fixture |
|---|---|---|---|
| `classifyMaterial` | `/internal/v1/student-agent/material-classifications` | `contracts/student-agent-v1/material-classification.request.json` | `contracts/student-agent-v1/material-classification.response.json` |
| `generateQuestionVariant` | `/internal/v1/student-agent/question-variants` | `contracts/student-agent-v1/question-variant.request.json` | `contracts/student-agent-v1/question-variant.response.json` |
| `generateErrorVariant` | `/internal/v1/student-agent/error-variants` | `contracts/student-agent-v1/error-variant.request.json` | `contracts/student-agent-v1/error-variant.response.json` |

Every request has:

```http
Content-Type: application/json
X-NOME-Agent-Contract-Version: 1
```

The request body must match its fixture exactly. The Agent success response uses the common envelope, with the matching response fixture as `data`:

```json
{
  "code": 0,
  "message": "ok",
  "data": { "question": { "type": "calculation" } }
}
```

The abbreviated value above only illustrates the envelope. Implementations must return every field shown by the checked-in response fixture. Domain failures use `{ "code": "<safe known code>", "message": "<bounded message>", "data": null }`. Student-Backend rejects non-JSON, oversized, malformed, redirected, or schema-incompatible responses.

## Idempotency and authority

The Agent must be idempotent for an identical `operationKey`: the same request produces the same logical generated content. The key is opaque and must not be parsed as authorization. `studentId` is bounded context, not trusted authentication.

The Agent returns generated content only. It must never choose tenant identity, database ids, question `id`, question `order`, `variantOf`, `sourceQuestionId`, task/set ids, or persistence state. Student-Backend constructs those authoritative values, re-reads current state after the Agent call, validates the untrusted output, and persists atomically. A late Agent response cannot overwrite cancellation, a newer redo, or an already-created conflicting variant.

## Material ingestion boundary

The public upload contract currently carries safe metadata only; Student-Backend never stores or forwards file bytes or base64. Real OCR/classification therefore requires a teammate-owned ingestion mechanism that gives the Agent an opaque ingestion reference. Until that reference exists, the Agent must fail explicitly rather than fabricate a classification from filename metadata.

An ingestion reference must be opaque, bounded, non-secret, non-`data:`/`raw:`/`base64:`, and must not expose a filesystem path, database URL, browser authorization, cookie, prompt, or model credential. Introducing that reference requires a versioned contract change on both sides.

## Logging and security

Neither service may log raw uploads, base64, prompt bodies, generated raw responses, authorization/cookies, database URLs, API keys, or model credentials. Safe logs are limited to fixed event names, operation type, bounded error codes, and safe correlation identifiers.

Fixtures are synthetic and contain no secrets. Contract changes are explicit: add a new version and update both runtime schemas and fixtures. Do not silently make v1 more permissive.

## Teammate acceptance checklist

1. Implement all three `/internal/v1/student-agent/*` endpoints with the version header above.
2. Validate v1 requests strictly and return the common envelope with fixture-compatible `data`.
3. Make each operation idempotent by `operationKey` and return generated content only.
4. Rename or remove Python's conflicting public `POST /api/sessions` route.
5. Keep Prompt/Memory/RAG/model code and credentials entirely inside the Python service.
6. Add the opaque material-ingestion reference as a future versioned contract before attempting OCR.
