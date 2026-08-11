"""Exercise set router — GET /api/exercise-sets/{taskId}.

Loads the exercise set for a given task id.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models.domain import ApiResponse

router = APIRouter(tags=["exercise-sets"])


@router.get("/exercise-sets/{task_id}", response_model=ApiResponse)
async def get_exercise_set(task_id: str):
    """Get the exercise set associated with a task.

    Stub: returns 404. Production should load from the exercise set store
    (populated via POST /api/sessions and variant generation).
    """
    raise HTTPException(
        status_code=404,
        detail=f"Exercise set for task {task_id} not found",
    )
