# backend/app/models/__init__.py
"""Pydantic domain models — the REST contract matching API_INTERFACE.md.

These models are shared between:
    - app/routers/   (request/response validation)
    - agent/         (input/output types — agent uses core.types internally,
                      but the router layer converts between Pydantic and dataclasses)

All enums and field definitions MUST stay in sync with API_INTERFACE.md §2.

Status: skeleton — full models will be filled in as routers are built.
"""

from pydantic import BaseModel
from enum import StrEnum


class ErrorTypeEnum(StrEnum):
    KNOWLEDGE = "knowledge"
    METHOD = "method"
    CALCULATION = "calculation"
    READING = "reading"
    EXECUTION = "execution"
    EXPRESSION = "expression"
    HABIT = "habit"


# TODO: Student, Task, TaskAdjustment, Question, Hint, ExerciseSet,
#       ErrorItem, RedoAttempt, VariantVerification, Note, NoteBlock,
#       AiSuggestion, NoteFolder, Settings, Greeting, ModuleStats,
#       LearningSummary
#       (see API_INTERFACE.md §2 for field tables)
