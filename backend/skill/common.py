"""Common types and helpers shared across all skills."""

from enum import StrEnum, auto


class SkillDomain(StrEnum):
    """Known skill identifiers — used by orchestrator and planner."""

    PROGRESSIVE_HINT = auto()
    ERROR_DIAGNOSIS = auto()
    KNOWLEDGE_FRAMEWORK = auto()
