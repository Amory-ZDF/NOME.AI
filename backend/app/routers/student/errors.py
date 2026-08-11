"""Error book router — CRUD for ErrorItem.

Endpoint summary (API_INTERFACE.md §3):
    POST /api/errors/batch             — upsert fresh recurrence evidence
    POST /api/errors/{id}/redo         — record redo attempt
    POST /api/errors/{id}/variant      — schedule independent variant
    POST /api/errors/{id}/verification — verify variant result
    PATCH /api/errors/{id}             — mark mastered
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models.domain import (
    ApiResponse,
    ErrorBatchRequest,
    ErrorItem,
    ErrorRedoRequest,
    ErrorStatusEnum,
    ErrorStatusPatch,
    ErrorVerificationRequest,
)

router = APIRouter(tags=["errors"])

_errors: dict[str, ErrorItem] = {}


@router.post("/errors/batch", response_model=ApiResponse)
async def add_errors(batch: ErrorBatchRequest):
    """Upsert error cards by questionId. Each item must be fresh recurrence evidence:
    status=pending_review, empty redoHistory, no verification fields."""
    upserted: list[ErrorItem] = []
    for item in batch.items:
        # Upsert: replace existing card with same questionId
        existing_id = None
        for eid, existing in _errors.items():
            if existing.question_id == item.question_id:
                existing_id = eid
                break

        if existing_id:
            _errors[existing_id] = item
        else:
            _errors[item.id] = item
        upserted.append(item)

    return ApiResponse(data={
        "errors": [e.model_dump(by_alias=True, exclude_none=True) for e in upserted],
    })


@router.post("/errors/{error_id}/redo", response_model=ApiResponse)
async def submit_redo(error_id: str, attempt: ErrorRedoRequest):
    """Record a redo attempt. Correct -> verification_due, wrong -> pending_review."""
    error = _errors.get(error_id)
    if error is None:
        raise HTTPException(status_code=404, detail=f"Error {error_id} not found")

    new_status = ErrorStatusEnum.VERIFICATION_DUE if attempt.is_correct else ErrorStatusEnum.PENDING_REVIEW
    redo_history = list(error.redo_history)
    redo_history.insert(0, attempt)  # newest first

    updated = error.model_copy(update={
        "status": new_status,
        "redo_history": redo_history,
        "verification_variant_id": None,
        "variant_verified_at": None,
        "variant_verification": None,
    })
    _errors[error_id] = updated
    return ApiResponse(data={"error": updated.model_dump(by_alias=True, exclude_none=True)})


@router.post("/errors/{error_id}/variant", response_model=ApiResponse)
async def schedule_variant(error_id: str):
    """Schedule an independent verification variant for the error."""
    error = _errors.get(error_id)
    if error is None:
        raise HTTPException(status_code=404, detail=f"Error {error_id} not found")

    if error.verification_variant_id:
        raise HTTPException(status_code=409, detail="A verification variant is already scheduled")

    # Stub: create a placeholder variant
    variant_id = f"variant-{error_id}"
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()

    updated = error.model_copy(update={
        "status": ErrorStatusEnum.VERIFICATION_DUE,
        "verification_variant_id": variant_id,
    })
    _errors[error_id] = updated

    return ApiResponse(data={
        "exerciseSet": {
            "id": variant_id,
            "taskId": f"task-{variant_id}",
            "title": f"Verification for {error.error_description[:50]}",
            "subject": error.subject,
            "questions": [],
            "sourceQuestionId": error.question_id,
            "createdAt": now,
        },
        "task": {
            "id": f"task-{variant_id}",
            "title": f"Error verification — {error.error_description[:30]}",
            "type": "error_review",
            "subject": error.subject,
            "estimatedMinutes": 15,
            "priority": "P1",
            "isOverdue": False,
            "status": "pending",
            "exerciseSetId": variant_id,
            "sourceQuestionId": error.question_id,
            "verificationForErrorId": error_id,
            "reason": "Independent transfer check",
            "createdAt": now,
        },
        "error": updated.model_dump(by_alias=True, exclude_none=True),
    })


@router.post("/errors/{error_id}/verification", response_model=ApiResponse)
async def verify_variant(error_id: str, result: ErrorVerificationRequest):
    """Verify an independent variant. Correct + correct redo -> allows mastery."""
    error = _errors.get(error_id)
    if error is None:
        raise HTTPException(status_code=404, detail=f"Error {error_id} not found")

    if result.variant_id != error.verification_variant_id:
        raise HTTPException(status_code=400, detail="Verification result does not match linked variant")

    updated = error.model_copy(update={
        "variant_verified_at": result.verified_at if result.is_correct else None,
        "variant_verification": result,
        "status": ErrorStatusEnum.VERIFICATION_DUE if not result.is_correct else error.status,
    })
    _errors[error_id] = updated
    return ApiResponse(data={"error": updated.model_dump(by_alias=True, exclude_none=True)})


@router.patch("/errors/{error_id}", response_model=ApiResponse)
async def mark_mastered(error_id: str, patch: ErrorStatusPatch):
    """Mark an error as mastered. Only valid after correct redo + correct independent variant."""
    error = _errors.get(error_id)
    if error is None:
        raise HTTPException(status_code=404, detail=f"Error {error_id} not found")

    if patch.status != "mastered":
        raise HTTPException(status_code=400, detail="Only 'mastered' status is supported")

    # Check mastery gate: must have a correct redo + correct variant verification
    has_correct_redo = any(a.is_correct for a in error.redo_history)
    has_correct_verification = (
        error.variant_verification is not None and error.variant_verification.is_correct
    )
    if not (has_correct_redo and has_correct_verification):
        raise HTTPException(
            status_code=409,
            detail="Complete the independent variant before marking this mastered",
        )

    updated = error.model_copy(update={"status": ErrorStatusEnum.MASTERED})
    _errors[error_id] = updated
    return ApiResponse(data={"error": updated.model_dump(by_alias=True, exclude_none=True)})
