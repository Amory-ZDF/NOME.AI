"""InsightStore — PostgreSQL persistence for the long-term memory layer.

Owns four tables (all in the shared `nome` DB, same server as memory_records):

    student_events    — append-only event stream (session/error/mastery/
                        chat_question/habit_signal/state_report)
    student_profiles  — one row per student: deterministic metrics + LLM narrative
    student_tags      — dynamic tags with evidence + confidence + status
    teacher_reports   — periodic (weekly/monthly) report snapshots

Deterministic aggregation reads ONLY from student_events (plus the existing
memory_records decay-weighted mastery via MemoryRetriever). The LLM never
touches raw numbers — it only writes the `narrative_*` / tag label text.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import asyncpg

logger = logging.getLogger(__name__)

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS student_events (
    event_id     TEXT PRIMARY KEY,
    student_id   TEXT NOT NULL,
    event_type   TEXT NOT NULL,          -- session_completed | error | mastery |
                                         -- chat_question | habit_signal | state_report
    occurred_at  TIMESTAMPTZ NOT NULL,
    question_id  TEXT,
    knowledge_node_id TEXT,
    error_type   TEXT,
    subject      TEXT,
    payload      JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS student_events_student_idx
    ON student_events (student_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS student_events_type_idx
    ON student_events (student_id, event_type, occurred_at DESC);

CREATE TABLE IF NOT EXISTS student_profiles (
    student_id       TEXT PRIMARY KEY,
    updated_at       TIMESTAMPTZ NOT NULL,
    -- deterministic metrics (rule/SQL computed, no LLM)
    accuracy         REAL,
    total_answered   INT NOT NULL DEFAULT 0,
    total_correct    INT NOT NULL DEFAULT 0,
    error_distribution JSONB NOT NULL DEFAULT '{}'::jsonb,  -- error_type -> count
    avg_time_seconds REAL,
    hints_per_question REAL,
    pressure_index   INT,               -- 0-100, rule engine
    active_days      INT NOT NULL DEFAULT 0,
    -- LLM-synthesized narrative (teacher-facing)
    recent_narrative TEXT,              -- "最近发生了什么"
    next_focus       TEXT,              -- "下节课重点"
    intervention     TEXT,              -- "谁需要人工介入" (per-student flag text)
    profile_json     JSONB NOT NULL DEFAULT '{}'::jsonb  -- overflow / raw
);

CREATE INDEX IF NOT EXISTS student_profiles_updated_idx
    ON student_profiles (updated_at DESC);

CREATE TABLE IF NOT EXISTS student_tags (
    tag_id      TEXT PRIMARY KEY,
    student_id  TEXT NOT NULL,
    label       TEXT NOT NULL,
    category    TEXT NOT NULL,          -- learning_issue | learning_style |
                                        -- psychological | positive
    confidence  REAL NOT NULL DEFAULT 0,
    evidence    TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'pending',  -- pending | confirmed |
                                                  -- rejected | modified
    updated_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS student_tags_student_idx
    ON student_tags (student_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS teacher_reports (
    report_id    TEXT PRIMARY KEY,
    student_id   TEXT NOT NULL,
    period       TEXT NOT NULL,         -- 'weekly' | 'monthly'
    period_start TIMESTAMPTZ NOT NULL,
    period_end   TIMESTAMPTZ NOT NULL,
    metrics      JSONB NOT NULL DEFAULT '{}'::jsonb,
    summary      TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS teacher_reports_student_idx
    ON teacher_reports (student_id, period, period_end DESC);
"""


def _dump_json(value: Any) -> str:
    return json.dumps(value, default=str, ensure_ascii=False)


def _loads_json(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value
    return value


class InsightStore:
    """Postgres store for the student-insight layer."""

    def __init__(self, database_url: str) -> None:
        self._database_url = database_url
        self._pool: asyncpg.Pool | None = None

    # -- lifecycle ---------------------------------------------------------

    async def connect(self) -> None:
        self._pool = await asyncpg.create_pool(
            self._database_url, min_size=1, max_size=5
        )
        async with self._pool.acquire() as conn:
            await conn.execute(SCHEMA_SQL)
        logger.info("InsightStore connected")

    async def close(self) -> None:
        if self._pool is not None:
            await self._pool.close()
            self._pool = None

    def _require_pool(self) -> asyncpg.Pool:
        if self._pool is None:
            raise RuntimeError("InsightStore is not connected")
        return self._pool

    # -- events ------------------------------------------------------------

    async def append_event(
        self,
        *,
        event_id: str,
        student_id: str,
        event_type: str,
        occurred_at: datetime,
        question_id: str | None = None,
        knowledge_node_id: str | None = None,
        error_type: str | None = None,
        subject: str | None = None,
        payload: dict | None = None,
    ) -> None:
        pool = self._require_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO student_events (
                    event_id, student_id, event_type, occurred_at, question_id,
                    knowledge_node_id, error_type, subject, payload
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (event_id) DO NOTHING
                """,
                event_id,
                student_id,
                event_type,
                occurred_at,
                question_id,
                knowledge_node_id,
                error_type,
                subject,
                _dump_json(payload or {}),
            )

    # -- deterministic aggregation (NO LLM) --------------------------------

    async def aggregate(self, student_id: str, since: datetime | None = None) -> dict:
        """Compute deterministic metrics for one student from the event stream.

        Returns a dict of metrics; every field is derived from SQL/rule logic.
        The caller (ProfileAgent) decides whether the change warrants an LLM call.
        """
        pool = self._require_pool()
        since = since or datetime.min.replace(tzinfo=timezone.utc)

        async with pool.acquire() as conn:
            answered = await conn.fetchrow(
                """
                SELECT COUNT(*) AS total,
                       COUNT(*) FILTER (WHERE payload->>'is_correct' = 'true') AS correct
                FROM student_events
                WHERE student_id = $1
                  AND event_type IN ('error', 'mastery')
                  AND occurred_at >= $2
                """,
                student_id,
                since,
            )

            error_dist = await conn.fetch(
                """
                SELECT error_type, COUNT(*) AS cnt
                FROM student_events
                WHERE student_id = $1
                  AND event_type = 'error'
                  AND error_type IS NOT NULL
                  AND occurred_at >= $2
                GROUP BY error_type
                """,
                student_id,
                since,
            )

            timing = await conn.fetchrow(
                """
                SELECT AVG((payload->>'time_spent_seconds')::real) AS avg_time,
                       AVG((payload->>'hints_used')::real) AS avg_hints
                FROM student_events
                WHERE student_id = $1
                  AND event_type = 'session_completed'
                  AND payload->>'time_spent_seconds' IS NOT NULL
                  AND occurred_at >= $2
                """,
                student_id,
                since,
            )

            active_days = await conn.fetchval(
                """
                SELECT COUNT(DISTINCT occurred_at::date)
                FROM student_events
                WHERE student_id = $1 AND occurred_at >= $2
                """,
                student_id,
                since,
            )

        total = answered["total"] if answered else 0
        correct = answered["correct"] if answered else 0
        accuracy = round(correct / total, 4) if total else None

        error_distribution = {r["error_type"]: r["cnt"] for r in error_dist}

        return {
            "total_answered": total,
            "total_correct": correct,
            "accuracy": accuracy,
            "error_distribution": error_distribution,
            "avg_time_seconds": (timing["avg_time"] if timing and timing["avg_time"] else None),
            "hints_per_question": (timing["avg_hints"] if timing and timing["avg_hints"] else None),
            "active_days": active_days,
        }

    async def recent_events(self, student_id: str, limit: int = 100) -> list[dict]:
        """Return the most recent events (for LLM context assembly)."""
        pool = self._require_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT event_type, occurred_at, question_id, knowledge_node_id,
                       error_type, subject, payload
                FROM student_events
                WHERE student_id = $1
                ORDER BY occurred_at DESC
                LIMIT $2
                """,
                student_id,
                limit,
            )
        return [
            {
                "event_type": r["event_type"],
                "occurred_at": r["occurred_at"].isoformat(),
                "question_id": r["question_id"],
                "knowledge_node_id": r["knowledge_node_id"],
                "error_type": r["error_type"],
                "subject": r["subject"],
                "payload": _loads_json(r["payload"]),
            }
            for r in rows
        ]

    # -- pressure index (rule engine) -------------------------------------

    async def compute_pressure(self, student_id: str, now: datetime | None = None) -> int:
        """Rule-engine pressure index 0-100, from the signals in §4.3.2 of the
        product doc. Deterministic — no LLM. Higher = more likely needs a teacher.

        Signals (each +points):
            - error-rate spike in last 3 days vs prior 7 days (+30)
            - avg time-per-question up >40% (+20)
            - skipped/abandoned sessions in last 3 days (+20)
            - repeated same-error-type in last 3 days (+15)
            - negative state_report in last 3 days (+15)
        Clamped to 0-100.
        """
        now = now or datetime.now()
        pool = self._require_pool()

        def at(days_ago: int) -> datetime:
            return now.replace(microsecond=0) - timedelta(days=days_ago)

        async with pool.acquire() as conn:
            last3_error = await conn.fetchval(
                "SELECT COUNT(*) FROM student_events WHERE student_id=$1 "
                "AND event_type='error' AND occurred_at >= $2",
                student_id, at(3),
            )
            last3_answered = await conn.fetchval(
                "SELECT COUNT(*) FROM student_events WHERE student_id=$1 "
                "AND event_type IN ('error','mastery') AND occurred_at >= $2",
                student_id, at(3),
            )
            prior7_error = await conn.fetchval(
                "SELECT COUNT(*) FROM student_events WHERE student_id=$1 "
                "AND event_type='error' AND occurred_at < $2 AND occurred_at >= $3",
                student_id, at(3), at(10),
            )
            prior7_answered = await conn.fetchval(
                "SELECT COUNT(*) FROM student_events WHERE student_id=$1 "
                "AND event_type IN ('error','mastery') AND occurred_at < $2 AND occurred_at >= $3",
                student_id, at(3), at(10),
            )

            last3_time = await conn.fetchval(
                "SELECT AVG((payload->>'time_spent_seconds')::real) FROM student_events "
                "WHERE student_id=$1 AND event_type='session_completed' "
                "AND payload->>'time_spent_seconds' IS NOT NULL AND occurred_at >= $2",
                student_id, at(3),
            )
            prior7_time = await conn.fetchval(
                "SELECT AVG((payload->>'time_spent_seconds')::real) FROM student_events "
                "WHERE student_id=$1 AND event_type='session_completed' "
                "AND payload->>'time_spent_seconds' IS NOT NULL AND occurred_at < $2",
                student_id, at(3),
            )

            skip_count = await conn.fetchval(
                "SELECT COUNT(*) FROM student_events WHERE student_id=$1 "
                "AND event_type='habit_signal' AND occurred_at >= $2 "
                "AND payload->>'signal' IN ('skip','abandon','exit_midway')",
                student_id, at(3),
            )

            repeat_count = await conn.fetchval(
                "SELECT COUNT(*) FROM student_events e WHERE student_id=$1 "
                "AND event_type='error' AND occurred_at >= $2 "
                "AND EXISTS (SELECT 1 FROM student_events e2 WHERE e2.student_id=$1 "
                "AND e2.event_type='error' AND e2.error_type=e.error_type "
                "AND e2.occurred_at < e.occurred_at)",
                student_id, at(3),
            )

            negative_report = await conn.fetchval(
                "SELECT COUNT(*) FROM student_events WHERE student_id=$1 "
                "AND event_type='state_report' AND occurred_at >= $2 "
                "AND payload->>'mood' IN ('stressed','frustrated','anxious','overwhelmed')",
                student_id, at(3),
            )

        score = 0
        # error-rate spike
        last3_rate = last3_error / last3_answered if last3_answered else 0
        prior7_rate = prior7_error / prior7_answered if prior7_answered else 0
        if last3_rate > prior7_rate + 0.2 and last3_answered >= 3:
            score += 30
        # time per question up
        if last3_time and prior7_time and prior7_time > 0 and last3_time > prior7_time * 1.4:
            score += 20
        # skips/abandons
        if skip_count and skip_count >= 1:
            score += min(20, 10 * skip_count)
        # repeated same error
        if repeat_count and repeat_count >= 1:
            score += min(15, 5 * repeat_count)
        # negative self-report
        if negative_report and negative_report >= 1:
            score += 15

        return min(100, score)

    # -- profiles / tags / reports (write side) ---------------------------

    async def upsert_profile(self, student_id: str, updated_at: datetime, profile: dict) -> None:
        pool = self._require_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO student_profiles (
                    student_id, updated_at, accuracy, total_answered, total_correct,
                    error_distribution, avg_time_seconds, hints_per_question,
                    pressure_index, active_days, recent_narrative, next_focus,
                    intervention, profile_json
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
                ON CONFLICT (student_id) DO UPDATE SET
                    updated_at = EXCLUDED.updated_at,
                    accuracy = EXCLUDED.accuracy,
                    total_answered = EXCLUDED.total_answered,
                    total_correct = EXCLUDED.total_correct,
                    error_distribution = EXCLUDED.error_distribution,
                    avg_time_seconds = EXCLUDED.avg_time_seconds,
                    hints_per_question = EXCLUDED.hints_per_question,
                    pressure_index = EXCLUDED.pressure_index,
                    active_days = EXCLUDED.active_days,
                    recent_narrative = EXCLUDED.recent_narrative,
                    next_focus = EXCLUDED.next_focus,
                    intervention = EXCLUDED.intervention,
                    profile_json = EXCLUDED.profile_json
                """,
                student_id,
                updated_at,
                profile.get("accuracy"),
                profile.get("total_answered", 0),
                profile.get("total_correct", 0),
                _dump_json(profile.get("error_distribution", {})),
                profile.get("avg_time_seconds"),
                profile.get("hints_per_question"),
                profile.get("pressure_index"),
                profile.get("active_days", 0),
                profile.get("recent_narrative"),
                profile.get("next_focus"),
                profile.get("intervention"),
                _dump_json(profile.get("profile_json", {})),
            )

    async def upsert_tag(self, tag: dict) -> None:
        pool = self._require_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO student_tags (
                    tag_id, student_id, label, category, confidence, evidence, status, updated_at
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                ON CONFLICT (tag_id) DO UPDATE SET
                    label = EXCLUDED.label,
                    category = EXCLUDED.category,
                    confidence = EXCLUDED.confidence,
                    evidence = EXCLUDED.evidence,
                    status = EXCLUDED.status,
                    updated_at = EXCLUDED.updated_at
                """,
                tag["tag_id"],
                tag["student_id"],
                tag["label"],
                tag["category"],
                tag["confidence"],
                tag["evidence"],
                tag["status"],
                tag["updated_at"],
            )

    async def upsert_report(self, report: dict) -> None:
        pool = self._require_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO teacher_reports (
                    report_id, student_id, period, period_start, period_end,
                    metrics, summary, created_at
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                ON CONFLICT (report_id) DO UPDATE SET
                    metrics = EXCLUDED.metrics,
                    summary = EXCLUDED.summary,
                    created_at = EXCLUDED.created_at
                """,
                report["report_id"],
                report["student_id"],
                report["period"],
                report["period_start"],
                report["period_end"],
                _dump_json(report.get("metrics", {})),
                report.get("summary", ""),
                report["created_at"],
            )

    async def list_students(self) -> list[str]:
        pool = self._require_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT DISTINCT student_id FROM student_events ORDER BY student_id"
            )
        return [r["student_id"] for r in rows]
