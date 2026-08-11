"""Settings router — PATCH /api/student/settings.

Updates student preferences (tone, reminders, daily goal).
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models.domain import (
    ApiResponse,
    Settings,
    SettingsPatch,
)

router = APIRouter(tags=["settings"])

_current_settings = Settings()


@router.patch("/student/settings", response_model=ApiResponse)
async def update_settings(patch: SettingsPatch):
    """Update student settings. Only provided fields are changed."""
    global _current_settings

    update_data = patch.model_dump(exclude_none=True, by_alias=True)
    field_map = {
        "dailyGoalHours": "daily_goal_hours",
        "reminderTask": "reminder_task",
        "reminderErrorReview": "reminder_error_review",
        "reminderStudyTime": "reminder_study_time",
    }
    snake_update = {field_map.get(k, k): v for k, v in update_data.items()}

    _current_settings = _current_settings.model_copy(update=snake_update)
    return ApiResponse(data={
        "settings": _current_settings.model_dump(by_alias=True, exclude_none=True),
    })
