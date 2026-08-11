# Agent service handoff

This document defines a service boundary, not an Agent implementation. The teammate Agent service supplies classification and variant outputs. Student-Backend owns strict validation, configured-student scoping, deterministic state transitions, and persistence.

## Route ownership

The following routes are owned by the teammate service/integration layer and are deliberately **not registered** in Student-Backend (therefore 404 here, never 501):

- `POST /api/material-uploads/{id}/process`
- `POST /api/questions/{questionId}/variant`
- `POST /api/errors/{id}/variant`

Student-Backend does not implement, proxy, import, or persist Agent prompts, model credentials, raw uploads/base64, or Agent internals. Results cross a strict JSON boundary only.

## Required contracts

Use the canonical schemas, not a weaker copy: `Student-Backend/src/contracts/student-contracts.ts` names `materialClassificationResultSchema`, `MaterialClassificationResult`, `noteBlockSchema`, and the student-domain error categories. The frontend-facing contract is [Student_Frontend/API_INTERFACE.md](../Student_Frontend/API_INTERFACE.md).

`MaterialClassificationResult` is exactly `suggestedTitle`, `materialType`, `examBoard`, `subject`, `chapter`, `folderId`, `folderPath`, `questionBlocks`, `answerBlocks`, non-empty `content`, `linkedTopics`, `linkedErrors`, and `confidence` (inclusive 0–1). Question ids are unique; answer ids are unique and reference known question ids. `content` uses every canonical `NoteBlock` variant: `{ t: 'p' | 'h' | 'formula', v: string }`; `{ t: 'list' | 'highlight', v: string, reference?: string, alt?: string }`; or `{ t: 'image', v: string, reference: non-empty string, alt: non-empty string }`. References/values cannot be raw or base64 carriers.

The student domain already expects six progressive hint levels: L1–L5 are ordered stored hints, and L6 is an independent transfer variant. The seven canonical error categories are `knowledge`, `method`, `calculation`, `reading`, `execution`, `expression`, and `habit`.

## Transaction and safety expectations

For material confirmation, validate the full classification result and atomically persist the completed job plus its deterministic linked Note; no half-state is observable. For variants, preserve provenance from source question/error through the independent set and task, make retries idempotent, and enforce the chronology: correct redo precedes the exact linked independent verification, which precedes mastery. Reject mismatched tenant/student scope, replay, out-of-order evidence, and invalid payloads using the common `{ code, message, data }` error envelope; roll back failed transactions completely.

Integration must retain durable provenance/object references only, enforce idempotency keys where retries cross services, and never weaken Student-Backend validation or fixed student scoping. Authentication/tenant identity is a future boundary: the current service's configured `STUDENT_ID` is not request authentication.
