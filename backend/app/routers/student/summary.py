"""Summary router — GET /api/summary/{sessionId}.

Returns a server-computed session summary with accuracy, distribution,
and AI suggestions.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models.domain import ApiResponse

router = APIRouter(tags=["summary"])


@router.get("/summary/{session_id}", response_model=ApiResponse)
async def get_session_summary(session_id: str):
    """Get session summary data.

    API_INTERFACE.md §4: server-computed summary with accuracy,
    distribution, and suggestions.

    Stub: returns placeholder. Production should load session data from
    the session store and compute the summary (accuracy, question-type
    breakdown, weak areas, AI suggestions).
    """
    return ApiResponse(data={
        "sessionId": session_id,
        "taskTitle": "",
        "subject": "",
        "completedAt": "",
        "timeSpent": 0,
        "timeSpentSeconds": 0,
        "totalQuestions": 0,
        "correctCount": 0,
        "wrongCount": 0,
        "unansweredCount": 0,
        "accuracy": 0,
        "questionResults": [],
        "byType": {},
        "suggestions": [],
    })
