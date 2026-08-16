"""PgStore — PostgreSQL-backed MemoryStore.

Implements the same interface contract as MemoryStore (append /
query_by_student / query_by_node / count) but persists to a
`memory_records` table instead of an in-memory dict.

    store = PgStore("postgresql://nome:nome@localhost:5432/nome")
    await store.connect()
    ...
    await store.close()

The table schema mirrors MemoryRecord fields; structured enums
(error_type / error_status) are stored as TEXT, raw_data as JSONB.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime

import asyncpg

from core.types import ErrorStatus, ErrorType
from memory.models import MemoryRecord
from memory.store import MemoryStore

logger = logging.getLogger(__name__)

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS memory_records (
    record_id         TEXT PRIMARY KEY,
    student_id        TEXT NOT NULL,
    type              TEXT NOT NULL,
    timestamp         TIMESTAMPTZ NOT NULL,
    session_id        TEXT,
    question_id       TEXT,
    knowledge_node_id TEXT,
    error_type        TEXT,
    error_status      TEXT,
    summary           TEXT NOT NULL DEFAULT '',
    raw_data          JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS memory_records_student_idx
    ON memory_records (student_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS memory_records_node_idx
    ON memory_records (student_id, knowledge_node_id);
"""


def _dump_json(value: dict) -> str:
    return json.dumps(value, default=str)


def _loads_json(value: object) -> dict:
    if value is None:
        return {}
    if isinstance(value, str):
        return json.loads(value)
    return value if isinstance(value, dict) else {}


def _enum_or_none(enum_cls, value: str | None):
    if value is None:
        return None
    try:
        return enum_cls(value)
    except ValueError:
        return None


class PgStore(MemoryStore):
    """PostgreSQL persistence backend for memory records."""

    def __init__(self, database_url: str) -> None:
        super().__init__()
        self._database_url = database_url
        self._pool: asyncpg.Pool | None = None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def connect(self) -> None:
        self._pool = await asyncpg.create_pool(
            self._database_url,
            min_size=1,
            max_size=5,
        )
        async with self._pool.acquire() as conn:
            await conn.execute(SCHEMA_SQL)
        logger.info("PgStore connected to %s", self._redacted_url())

    async def close(self) -> None:
        if self._pool is not None:
            await self._pool.close()
            self._pool = None
            logger.info("PgStore closed")

    def _redacted_url(self) -> str:
        # Never log credentials.
        try:
            return self._database_url.split("@")[-1] if "@" in self._database_url else self._database_url
        except Exception:
            return "<redacted>"

    def _require_pool(self) -> asyncpg.Pool:
        if self._pool is None:
            raise RuntimeError("PgStore is not connected — call connect() first")
        return self._pool

    # ------------------------------------------------------------------
    # MemoryStore interface
    # ------------------------------------------------------------------

    async def append(self, record: MemoryRecord) -> None:
        pool = self._require_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO memory_records (
                    record_id, student_id, type, timestamp, session_id,
                    question_id, knowledge_node_id, error_type, error_status,
                    summary, raw_data
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                ON CONFLICT (record_id) DO NOTHING
                """,
                record.record_id,
                record.student_id,
                record.type,
                record.timestamp,
                record.session_id,
                record.question_id,
                record.knowledge_node_id,
                record.error_type.value if record.error_type else None,
                record.error_status.value if record.error_status else None,
                record.summary,
                _dump_json(record.raw_data),
            )

    async def query_by_student(
        self,
        student_id: str,
        *,
        type: str | None = None,
        knowledge_node_id: str | None = None,
        error_type: str | None = None,
        limit: int = 50,
    ) -> list[MemoryRecord]:
        pool = self._require_pool()

        where = ["student_id = $1"]
        params: list[object] = [student_id]

        if type is not None:
            params.append(type)
            where.append(f"type = ${len(params)}")
        if knowledge_node_id is not None:
            params.append(knowledge_node_id)
            where.append(f"knowledge_node_id = ${len(params)}")
        if error_type is not None:
            params.append(error_type)
            where.append(f"error_type = ${len(params)}")

        params.append(limit)
        sql = (
            "SELECT * FROM memory_records WHERE "
            + " AND ".join(where)
            + f" ORDER BY timestamp DESC LIMIT ${len(params)}"
        )

        async with pool.acquire() as conn:
            rows = await conn.fetch(sql, *params)
        return [self._row_to_record(row) for row in rows]

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
        pool = self._require_pool()
        async with pool.acquire() as conn:
            return await conn.fetchval(
                "SELECT COUNT(*) FROM memory_records WHERE student_id = $1",
                student_id,
            )

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    @staticmethod
    def _row_to_record(row: asyncpg.Record) -> MemoryRecord:
        return MemoryRecord(
            record_id=row["record_id"],
            student_id=row["student_id"],
            type=row["type"],
            timestamp=row["timestamp"],
            session_id=row["session_id"],
            question_id=row["question_id"],
            knowledge_node_id=row["knowledge_node_id"],
            error_type=_enum_or_none(ErrorType, row["error_type"]),
            error_status=_enum_or_none(ErrorStatus, row["error_status"]),
            summary=row["summary"],
            raw_data=_loads_json(row["raw_data"]),
        )
