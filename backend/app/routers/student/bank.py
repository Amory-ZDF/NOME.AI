"""Bank router — question bank browse + recommendations.

Endpoint summary (API_INTERFACE.md §4):
    GET /api/bank/questions?subject=&difficulty=&type=&status=
    GET /api/bank/recommendations
    GET /api/bank/exercise/{setId}
"""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.models.domain import ApiResponse

router = APIRouter(tags=["bank"])


@router.get("/bank/questions", response_model=ApiResponse)
async def list_bank_questions(
    subject: str | None = None,
    difficulty: int | None = None,
    type: str | None = None,
    status: str | None = None,
):
    """List bank questions with optional filters.

    Stub: returns empty list. Production should query the question bank
    service with pagination and full-text search.
    """
    return ApiResponse(data=[])


@router.get("/bank/recommendations", response_model=ApiResponse)
async def get_recommendations():
    """Get AI-recommended questions based on error history.

    Stub: returns empty list. Production should call the agent's
    recommendation engine using error history + knowledge graph.
    """
    return ApiResponse(data=[])


@router.get("/bank/exercise/{set_id}", response_model=ApiResponse)
async def get_bank_exercise(set_id: str):
    """Get a bank exercise set by id.

    Stub: returns 404. Production should load from the question bank.
    """
    from fastapi import HTTPException
    raise HTTPException(status_code=404, detail=f"Bank exercise set {set_id} not found")
