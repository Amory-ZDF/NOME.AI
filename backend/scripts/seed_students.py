"""Seed 5 example students with a realistic event history.

Writes directly into the shared insight tables (student_events) then runs the
ProfileAgent to produce student_profiles / student_tags / teacher_reports.

The 5 students are crafted to exercise the pain points the teacher dashboard
solves (repeated errors, hint dependency, pressure, a strong performer, and a
quiet/inactive one). `stu-001` is the real live-link student; the other four
are synthetic.

Run:
    .venv/bin/python -m scripts.seed_students
"""

from __future__ import annotations

import asyncio
import json
import os
import random
import uuid
from datetime import datetime, timedelta, timezone

from app.config import AppConfig
from core.llm_client import create_llm_client
from profile.store import InsightStore
from profile.agent import ProfileAgent

# ---------------------------------------------------------------------------
# Five persona definitions
# ---------------------------------------------------------------------------
# Each persona: name + an error-type bias + behavioral traits. The seed
# generates a plausible event stream from these, then ProfileAgent derives
# deterministic metrics + (LLM) narrative.
PERSONAS = [
    {
        "id": "stu-001", "name": "李明",
        "bias": {"calculation": 0.45, "method": 0.20, "knowledge": 0.15, "reading": 0.10, "execution": 0.10},
        "days": 14, "per_day": (3, 6), "accuracy": 0.62,
        "hint_dependent": True, "stress_signals": True,
    },
    {
        "id": "stu-002", "name": "王雅静",
        "bias": {"knowledge": 0.40, "method": 0.30, "calculation": 0.15, "reading": 0.15},
        "days": 14, "per_day": (2, 4), "accuracy": 0.78,
        "hint_dependent": False, "stress_signals": False,
    },
    {
        "id": "stu-003", "name": "赵子豪",
        "bias": {"calculation": 0.10, "method": 0.15, "knowledge": 0.15, "reading": 0.20, "execution": 0.40},
        "days": 10, "per_day": (1, 3), "accuracy": 0.91,
        "hint_dependent": False, "stress_signals": False,
    },
    {
        "id": "stu-004", "name": "陈思雨",
        "bias": {"knowledge": 0.50, "method": 0.30, "calculation": 0.10, "expression": 0.10},
        "days": 7, "per_day": (2, 5), "accuracy": 0.55,
        "hint_dependent": True, "stress_signals": True,
    },
    {
        "id": "stu-005", "name": "刘一帆",
        "bias": {"calculation": 0.35, "reading": 0.25, "knowledge": 0.20, "method": 0.20},
        "days": 3, "per_day": (1, 2), "accuracy": 0.70,
        "hint_dependent": False, "stress_signals": False,
    },
]

ERROR_TYPES = list(PERSONAS[0]["bias"].keys())

NODE_POOL = [
    "si-units", "derived-units", "homogeneous-equation", "prefixes",
    "precision", "accuracy", "scalar", "vector", "resultant-force",
    "vector-addition", "distance", "displacement", "speed", "velocity",
    "acceleration", "homogeneous-equation", "percentage-uncertainty",
]

# Deterministic RNG so the seed is reproducible (Date.now()/random are fine in
# a CLI script — this is not a workflow).
_rng = random.Random(20260816)


def _weighted_choice(bias: dict) -> str:
    items = list(bias.items())
    r = _rng.random() * sum(w for _, w in items)
    for key, w in items:
        r -= w
        if r <= 0:
            return key
    return items[0][0]


async def _seed_student(store: InsightStore, persona: dict) -> int:
    student_id = persona["id"]
    now = datetime.now(timezone.utc)
    count = 0

    for day_offset in range(persona["days"], 0, -1):
        day = now - timedelta(days=day_offset)
        n_questions = _rng.randint(*persona["per_day"])

        for _ in range(n_questions):
            # Random-ish hour within the day.
            day = day.replace(hour=_rng.randint(8, 22), minute=_rng.randint(0, 59),
                              second=_rng.randint(0, 59), microsecond=0)
            node_id = _rng.choice(NODE_POOL)
            is_correct = _rng.random() < persona["accuracy"]

            if is_correct:
                event_type = "mastery"
                error_type = None
            else:
                event_type = "error"
                error_type = _weighted_choice(persona["bias"])

            await store.append_event(
                event_id=str(uuid.uuid4()),
                student_id=student_id,
                event_type=event_type,
                occurred_at=day,
                question_id=f"seed-{student_id}-{count}",
                knowledge_node_id=node_id,
                error_type=error_type,
                subject="A-Level Physics",
                payload={"is_correct": is_correct, "hints_used": _rng.randint(0, 3)},
            )
            count += 1

        # A session_completed event each day to feed timing metrics.
        await store.append_event(
            event_id=str(uuid.uuid4()),
            student_id=student_id,
            event_type="session_completed",
            occurred_at=day.replace(hour=21, minute=_rng.randint(0, 59)),
            subject="A-Level Physics",
            payload={
                "time_spent_seconds": _rng.randint(180, 900),
                "hints_used": _rng.randint(2, 5) if persona["hint_dependent"] else _rng.randint(0, 2),
            },
        )
        count += 1

    # Stress / habit signals for personas flagged as at-risk.
    if persona["stress_signals"]:
        for _ in range(3):
            await store.append_event(
                event_id=str(uuid.uuid4()),
                student_id=student_id,
                event_type="habit_signal",
                occurred_at=now - timedelta(days=_rng.randint(0, 3)),
                payload={"signal": _rng.choice(["skip", "abandon", "exit_midway"])},
            )
            count += 1
        await store.append_event(
            event_id=str(uuid.uuid4()),
            student_id=student_id,
            event_type="state_report",
            occurred_at=now - timedelta(days=1),
            payload={"mood": _rng.choice(["stressed", "frustrated"])},
        )
        count += 1

    return count


async def main() -> None:
    config = AppConfig()
    if not config.database_url:
        print("DATABASE_URL not set — cannot seed insight tables.")
        return

    store = InsightStore(config.database_url)
    await store.connect()

    client = create_llm_client(config)
    agent = ProfileAgent(client, config.llm_provider, store, llm_enabled=True)

    for persona in PERSONAS:
        n = await _seed_student(store, persona)
        print(f"seeded {persona['name']} ({persona['id']}): {n} events")

    # Run the profile agent once to produce profiles/tags/reports.
    print("running profile agent …")
    await agent.periodic()

    await store.close()
    await client.close()
    print("done.")


if __name__ == "__main__":
    asyncio.run(main())
