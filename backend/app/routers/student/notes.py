"""Note router — CREATE + UPDATE notes.

Endpoint summary (API_INTERFACE.md §3):
    POST /api/notes            — create note (typed, OCR, AI-organized)
    PATCH /api/notes/{id}      — update note (title, tags, content, etc.)
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models.domain import (
    ApiResponse,
    Note,
    NotePatch,
)

router = APIRouter(tags=["notes"])

_notes: dict[str, Note] = {}


@router.post("/notes", response_model=ApiResponse)
async def create_note(note: Note):
    """Create a new note. Includes OCR-created notes and AI-organized notes."""
    if note.id in _notes:
        raise HTTPException(status_code=409, detail=f"Note {note.id} already exists")
    _notes[note.id] = note
    return ApiResponse(data={"note": note.model_dump(by_alias=True, exclude_none=True)})


@router.patch("/notes/{note_id}", response_model=ApiResponse)
async def update_note(note_id: str, patch: NotePatch):
    """Update note fields (title, tags, content, AI suggestions, etc.)."""
    note = _notes.get(note_id)
    if note is None:
        raise HTTPException(status_code=404, detail=f"Note {note_id} not found")

    update_data = patch.model_dump(exclude_none=True, by_alias=True)
    # Map camelCase aliases back to snake_case for model_update
    field_map = {
        "folderId": "folder_id",
        "folderPath": "folder_path",
        "linkedTopics": "linked_topics",
        "linkedErrors": "linked_errors",
        "aiSuggestions": "ai_suggestions",
        "updatedAt": "updated_at",
    }
    snake_update = {field_map.get(k, k): v for k, v in update_data.items()}

    from datetime import datetime, timezone
    snake_update["updated_at"] = datetime.now(timezone.utc).isoformat()

    updated = note.model_copy(update=snake_update)
    _notes[note_id] = updated
    return ApiResponse(data={"note": updated.model_dump(by_alias=True, exclude_none=True)})
