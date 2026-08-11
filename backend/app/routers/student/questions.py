"""Question router — variant generation.

POST /api/questions/{questionId}/variant — generate L6 transfer variant.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models.domain import ApiResponse

router = APIRouter(tags=["questions"])


@router.post("/questions/{question_id}/variant", response_model=ApiResponse)
async def generate_variant(question_id: str):
    """Generate a deterministic L6 transfer variant for a question.

    In production this calls the variant factory with knowledge-graph
    context and creates a new exercise set + task atomically.
    Currently returns a placeholder — real generation requires an
    LLM-powered variant engine.
    """
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat()
    variant_id = f"variant-{question_id}-1"
    task_id = f"task-variant-{question_id}-1"

    return ApiResponse(data={
        "exerciseSet": {
            "id": variant_id,
            "taskId": task_id,
            "title": f"Variant exercise for {question_id}",
            "subject": "",
            "questions": [],
            "sourceQuestionId": question_id,
            "createdAt": now,
        },
        "task": {
            "id": task_id,
            "title": "Independent transfer check",
            "type": "error_review",
            "subject": "",
            "estimatedMinutes": 15,
            "priority": "P1",
            "isOverdue": False,
            "status": "pending",
            "exerciseSetId": variant_id,
            "sourceQuestionId": question_id,
            "createdAt": now,
        },
    })
