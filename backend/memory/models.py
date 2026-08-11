"""Memory data models — plain dataclasses, no framework dependency."""

from dataclasses import dataclass, field
from datetime import datetime
from core.types import ErrorType, ErrorStatus


@dataclass
class MemoryRecord:
    """One memory entry — either a session or an error event.

    Structured fields (error_type, knowledge_node_id, status) support
    fast filtering without vector search.
    """
    record_id: str
    student_id: str
    type: str                        # "session" | "error" | "mastery_change"
    timestamp: datetime

    # Structured metadata for retrieval
    session_id: str | None = None
    question_id: str | None = None
    knowledge_node_id: str | None = None
    error_type: ErrorType | None = None
    error_status: ErrorStatus | None = None

    # Unstructured for LLM context assembly
    summary: str = ""                # 1-2 sentence human-readable summary
    raw_data: dict = field(default_factory=dict)  # original payload for debugging
