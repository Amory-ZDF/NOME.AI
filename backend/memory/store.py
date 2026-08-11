"""MemoryStore — pluggable persistence backend.

Interface contract:
    - append(record) → writes one MemoryRecord
    - query_by_student(student_id, **filters) → list[MemoryRecord]
    - query_by_node(student_id, node_id) → list[MemoryRecord]
    - count(student_id) → total records

Current implementation: in-memory list (development/demo).
The interface is identical to the SQLite/Postgres variants — just
swap the constructor at startup.
"""

from __future__ import annotations

from memory.models import MemoryRecord


class MemoryStore:
    """In-memory record store. Replace for production."""

    def __init__(self) -> None:
        # student_id → list[MemoryRecord], most recent first
        self._records: dict[str, list[MemoryRecord]] = {}

    async def append(self, record: MemoryRecord) -> None:
        student_records = self._records.setdefault(record.student_id, [])
        student_records.insert(0, record)  # most recent first

    async def query_by_student(
        self,
        student_id: str,
        *,
        type: str | None = None,
        knowledge_node_id: str | None = None,
        error_type: str | None = None,
        limit: int = 50,
    ) -> list[MemoryRecord]:
        records = self._records.get(student_id, [])

        if type is not None:
            records = [r for r in records if r.type == type]
        if knowledge_node_id is not None:
            records = [r for r in records if r.knowledge_node_id == knowledge_node_id]
        if error_type is not None:
            records = [
                r
                for r in records
                if r.error_type is not None and r.error_type.value == error_type
            ]

        return records[:limit]

    async def query_by_node(
        self,
        student_id: str,
        node_id: str,
        limit: int = 30,
    ) -> list[MemoryRecord]:
        return await self.query_by_student(
            student_id,
            type="error",
            knowledge_node_id=node_id,
            limit=limit,
        )

    async def count(self, student_id: str) -> int:
        return len(self._records.get(student_id, []))
