"""Task router — PATCH /api/tasks/{id}, POST /api/tasks/{id}/adjustment-request, POST /api/tasks.

Endpoint summary (API_INTERFACE.md §3):
    PATCH /api/tasks/{id}                      — mark task completed
    POST /api/tasks/{id}/adjustment-request     — submit adjustment
    POST /api/tasks                             — create task (e.g. variant drill)
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models.domain import (
    ApiResponse,
    Task,
    TaskPatch,
    TaskAdjustment,
    TaskTypeEnum,
    TaskPriorityEnum,
    TaskStatusEnum,
)

router = APIRouter(tags=["tasks"])

# In-memory store (replace with DB in production)
_tasks: dict[str, Task] = {}
_adjustments: dict[str, TaskAdjustment] = {}


@router.patch("/tasks/{task_id}", response_model=ApiResponse)
async def complete_task(task_id: str, patch: TaskPatch):
    """Mark a task as completed. Returns updated task with completedAt + isOverdue: false."""
    if patch.status != "completed":
        raise HTTPException(status_code=400, detail="Only 'completed' status is supported")

    task = _tasks.get(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()

    updated = task.model_copy(update={
        "status": TaskStatusEnum.COMPLETED,
        "completed_at": now,
        "is_overdue": False,
    })
    _tasks[task_id] = updated
    return ApiResponse(data={"task": updated.model_dump(by_alias=True, exclude_none=True)})


@router.post("/tasks/{task_id}/adjustment-request", response_model=ApiResponse)
async def submit_adjustment(task_id: str, body: TaskAdjustment):
    """Submit a task adjustment request. Task stays pending with adjustmentStatus."""
    if body.task_id != task_id:
        raise HTTPException(status_code=400, detail="taskId must match the URL path")

    _adjustments[body.id] = body

    task = _tasks.get(task_id)
    if task is not None:
        updated = task.model_copy(update={"adjustment_status": "submitted"})
        _tasks[task_id] = updated
    else:
        # Create a skeleton task if it doesn't exist
        updated = None

    return ApiResponse(data={
        "request": body.model_dump(by_alias=True, exclude_none=True),
        "task": updated.model_dump(by_alias=True, exclude_none=True) if updated else None,
    })


@router.post("/tasks", response_model=ApiResponse)
async def create_task(task: Task):
    """Create a new task (e.g. variant drill from summary page)."""
    if task.id in _tasks:
        raise HTTPException(status_code=409, detail=f"Task {task.id} already exists")
    _tasks[task.id] = task
    return ApiResponse(data={"task": task.model_dump(by_alias=True, exclude_none=True)})
