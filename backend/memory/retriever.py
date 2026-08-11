"""MemoryRetriever — decay-weighted queries for agent consumption.

The core function is query_decayed(): for a given knowledge node,
compute exponential-decay-weighted mastery from all historical
error events on that node.

    mastery = Σ (w_i × is_correct_i) / Σ w_i
    w_i = 2^(-age_days / half_life_days)

This is the retrieval interface consumed by:
    - Orchestrator (error_history for plan/execute context)
    - KnowledgeFramework skill (weakness detection via node_states)
    - Future: student profile agent (label confidence)
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
import math

from core.types import ErrorRecord, DiagnosisResult, ErrorStatus
from memory.store import MemoryStore
from memory.models import MemoryRecord

logger = logging.getLogger(__name__)


class MemoryRetriever:
    """Decay-weighted retrieval over stored records."""

    def __init__(self, store: MemoryStore, half_life_days: float = 21.0) -> None:
        self._store = store
        self._half_life = half_life_days  # days

    # ------------------------------------------------------------------
    # Public API — consumed by orchestrator
    # ------------------------------------------------------------------

    async def get_error_history(
        self,
        student_id: str,
        limit: int = 20,
    ) -> list[ErrorRecord]:
        """Most recent error records as core.types.ErrorRecord for orchestrator.

        These feed into:
            - orchestrator.handle() as the error_history parameter
            - knowledge_framework's input (via orchestrator)
        """
        records = await self._store.query_by_student(
            student_id, type="error", limit=limit
        )
        return [self._memory_to_error_record(r) for r in records]

    async def get_node_states(
        self,
        student_id: str,
        node_ids: list[str],
        now: datetime | None = None,
    ) -> dict[str, float]:
        """Compute decay-weighted mastery for multiple nodes in one call.

        Returns: {node_id: mastery_score} for every node_id in the input.
        Used by orchestrator to populate knowledge_framework's node_states input.
        """
        now = now or datetime.now(timezone.utc)
        result: dict[str, float] = {}
        for node_id in node_ids:
            result[node_id] = await self.query_decayed(
                student_id, node_id, now=now
            )
        return result

    async def query_decayed(
        self,
        student_id: str,
        node_id: str,
        now: datetime | None = None,
    ) -> float:
        """Compute decay-weighted mastery for a single knowledge node.

        Returns 0.0-1.0:
            1.0 = recently demonstrated mastery, no recent errors
            0.0 = no evidence or only old failures

        Formula:
            For each event record on this node:
                w_i = 2^(-age_days / half_life_days)
                score_i = w_i × is_correct(record)
            mastery = Σ score_i / Σ w_i

        If no records exist for this node, return 0.0 (no evidence).
        """
        now = now or datetime.now(timezone.utc)
        records = await self._store.query_by_node(student_id, node_id)

        if not records:
            return 0.0

        total_weight = 0.0
        weighted_score = 0.0

        for record in records:
            if record.timestamp is None:
                continue

            age_days = (now - record.timestamp).total_seconds() / 86400.0
            weight = 2.0 ** (-age_days / self._half_life)

            # A record where the student answered correctly = positive evidence
            # A record where the student answered wrong = negative evidence
            is_correct = record.raw_data.get("is_correct", False)
            mastery = 1.0 if is_correct else 0.0

            total_weight += weight
            weighted_score += weight * mastery

        if total_weight == 0:
            return 0.0

        return weighted_score / total_weight

    # ------------------------------------------------------------------
    # Public API — write
    # ------------------------------------------------------------------

    async def record_error(
        self,
        student_id: str,
        error: ErrorRecord,
    ) -> None:
        """Write a single error event to memory.

        Called after error_diagnosis returns a confident diagnosis.
        """
        record = MemoryRecord(
            record_id=error.id,
            student_id=student_id,
            type="error",
            timestamp=error.occurred_at or datetime.now(timezone.utc),
            session_id=None,
            question_id=error.question_id,
            knowledge_node_id=error.knowledge_node_id,
            error_type=error.error_type,
            error_status=error.status,
            summary=(
                f"{error.error_type.value}: {error.question_summary} — "
                f"{error.error_description[:120]}"
            ),
            raw_data={
                "question_id": error.question_id,
                "subject": error.subject,
                "related_topic": error.related_topic,
                "repeat_count": error.repeat_count,
                "is_correct": False,
            },
        )
        await self._store.append(record)

    async def record_mastery_event(
        self,
        student_id: str,
        question_id: str,
        knowledge_node_id: str,
        is_correct: bool,
    ) -> None:
        """Write a mastery event (correct answer or verified retry).

        Called when a student answers correctly or completes a variant.
        These positive events raise the decay-weighted mastery score.
        """
        import uuid

        record = MemoryRecord(
            record_id=str(uuid.uuid4()),
            student_id=student_id,
            type="mastery_change",
            timestamp=datetime.now(timezone.utc),
            session_id=None,
            question_id=question_id,
            knowledge_node_id=knowledge_node_id,
            error_type=None,
            error_status=None,
            summary=(
                "Correct answer" if is_correct else "Incorrect answer after review"
            ),
            raw_data={"question_id": question_id, "is_correct": is_correct},
        )
        await self._store.append(record)

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    @staticmethod
    def _memory_to_error_record(mem: MemoryRecord) -> ErrorRecord:
        """Convert a MemoryRecord (storage format) → ErrorRecord (core type).

        Memory records are the storage primitive; ErrorRecords are the
        agent-internal type that orchestrator and skills consume. This
        conversion is lossy by design — the raw_data dict carries
        overflow fields.
        """
        return ErrorRecord(
            id=mem.record_id,
            question_id=mem.question_id or mem.raw_data.get("question_id", ""),
            subject=mem.raw_data.get("subject", ""),
            error_type=mem.error_type,
            question_summary=mem.raw_data.get("question_summary", mem.summary),
            error_description=mem.raw_data.get("error_description", ""),
            related_topic=mem.raw_data.get("related_topic", ""),
            knowledge_node_id=mem.knowledge_node_id,
            occurred_at=mem.timestamp,
            repeat_count=mem.raw_data.get("repeat_count", 1),
            status=mem.error_status,
            redo_history=mem.raw_data.get("redo_history", []),
        )
