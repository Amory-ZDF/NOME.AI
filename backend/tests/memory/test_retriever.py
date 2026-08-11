"""Tests for MemoryRetriever — decay-weighted queries.

Covers:
    - query_decayed returns 1.0 for recent correct-only evidence
    - query_decayed returns ~0.0 for old failures only
    - query_decayed mixes recent and old with correct weighting
    - Half-life: weight at exactly half-life days ≈ 0.5
    - get_error_history returns most recent first
    - get_session_context filters by session_id
    - record_session writes both session and error records
    - Empty store returns 0.0 for any query
"""


async def test_decayed_mastery_recent_correct_only():
    """All evidence is recent correct → mastery close to 1.0."""
    ...


async def test_decayed_mastery_old_failures_only():
    """All evidence is old failures → mastery close to 0.0."""
    ...


async def test_decayed_mastery_mixed_weights():
    """Recent correct + old failure → weighted average, recent dominates."""
    ...


async def test_half_life_weight():
    """At exactly half_life_days, weight = 0.5."""
    ...


async def test_error_history_ordered_by_time():
    """get_error_history returns most recent first."""
    ...


async def test_session_context_filters_correctly():
    """get_session_context only returns records for that session."""
    ...


async def test_record_session_writes_both_types():
    """record_session creates session-level and per-question error records."""
    ...


async def test_empty_store_returns_zero():
    """query_decayed on empty store returns 0.0, not error."""
    ...
