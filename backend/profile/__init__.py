# backend/profile/__init__.py
"""Long-term memory / student-profile layer.

Owns the insight tables (student_events, student_profiles, student_tags,
teacher_reports) and the ProfileAgent that:
    - aggregates deterministic metrics (NO LLM) from the shared event stream,
    - applies a rule-engine pressure index,
    - reserves LLM calls for natural-language synthesis (narratives + tags).

The tables live in the same Postgres DB as memory_records (memory.pg_store),
so the Teacher-Backend reads the SAME rows directly — this is the "two ends
talk through the database" bridge.
"""

from profile.store import InsightStore
from profile.agent import ProfileAgent

__all__ = ["InsightStore", "ProfileAgent"]
