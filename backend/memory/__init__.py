# backend/memory/__init__.py
"""Long-term memory — session and error recording with decay-weighted retrieval.

Design:
    - Store: pluggable backend (in-memory dict now, SQLite/Postgres later).
    - Retriever: decay-weighted queries for agent consumption.
    - Models: plain dataclasses, no Pydantic dependency.
"""

from memory.store import MemoryStore
from memory.retriever import MemoryRetriever
from memory.models import MemoryRecord

__all__ = ["MemoryStore", "MemoryRetriever", "MemoryRecord"]
