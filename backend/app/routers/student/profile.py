"""Profile router — GET /api/student/profile.

Returns the student profile overview with mastery visualization data.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.models.domain import ApiResponse

router = APIRouter(tags=["profile"])


@router.get("/student/profile", response_model=ApiResponse)
async def get_profile():
    """Get student profile overview.

    API_INTERFACE.md §4 specifies:
        profileOverview + knowledgeGraph + progressTimeline +
        errorPatterns + achievements

    Stub: returns placeholder structure. Production should aggregate from
    memory/store service, session history, and error book.
    """
    return ApiResponse(data={
        "profileOverview": {
            "totalStudyHours": 0,
            "questionsCompleted": 0,
            "overallAccuracy": 0,
            "errorReviewRate": 0,
            "activeDays": 0,
            "streak": 0,
        },
        "knowledgeGraph": {
            "nodes": [],
            "edges": [],
        },
        "progressTimeline": [],
        "errorPatterns": [],
        "achievements": [],
    })
