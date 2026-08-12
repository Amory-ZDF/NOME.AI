"""Pydantic domain models — Agent-only REST contract.

This module contains ONLY models needed by the AI Agent endpoints
(POST /api/agent/analyze, POST /api/agent/counter-reply-ext, POST /api/sessions).

CRUD models (Student, Task, Note, ErrorItem, Settings, etc.) belong to the
TypeScript Student-Backend — see Student-Backend/prisma/schema.prisma.

All models use camelCase aliases so the JSON output matches what the
frontend expects. Python code uses snake_case internally.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


# ============================================================================
# Enums
# ============================================================================

class QuestionTypeEnum(StrEnum):
    CHOICE = "choice"
    CALCULATION = "calculation"
    PROOF = "proof"
    FILL_BLANK = "fill_blank"
    READING = "reading"
    WRITING = "writing"


class ErrorTypeEnum(StrEnum):
    KNOWLEDGE = "knowledge"
    METHOD = "method"
    CALCULATION = "calculation"
    READING = "reading"
    EXECUTION = "execution"
    EXPRESSION = "expression"
    HABIT = "habit"


class SessionQuestionStatusEnum(StrEnum):
    CORRECT = "correct"
    WRONG = "wrong"
    UNANSWERED = "unanswered"


# ============================================================================
# Common envelope — API_INTERFACE.md Conventions
# ============================================================================

class ApiResponse(BaseModel):
    code: int = 0
    message: str = "ok"
    data: Any = None


# ============================================================================
# Shared types (Agent-only subset)
# ============================================================================

class Hint(BaseModel):
    level: int = Field(..., ge=1, le=5)
    title: str
    content: str


# ============================================================================
# Session types (POST /api/sessions)
# ============================================================================

class SessionAttempt(BaseModel):
    answer: str
    submitted_at: str = Field(..., alias="submittedAt")
    is_correct: bool = Field(..., alias="isCorrect")


class SessionQuestionResult(BaseModel):
    status: SessionQuestionStatusEnum
    attempts: list[SessionAttempt] = Field(default_factory=list)
    hints_used: int = Field(default=0, alias="hintsUsed")
    solved_at_hint_level: int | None = Field(default=None, alias="solvedAtHintLevel")
    handwriting_used: bool | None = Field(default=None, alias="handwritingUsed")


class SessionQuestion(BaseModel):
    """One question inside a session submission."""
    id: str
    order: int = 0
    type: QuestionTypeEnum
    topic: str = ""
    difficulty: int = Field(default=3, ge=1, le=5)
    content: str = ""
    options: list[str] | None = None
    correct_index: int | None = Field(default=None, alias="correctIndex")
    accept_keywords: list[str] = Field(default_factory=list, alias="acceptKeywords")
    correct_display: str = Field(default="", alias="correctDisplay")
    error_type: ErrorTypeEnum = Field(default=ErrorTypeEnum.KNOWLEDGE, alias="errorType")
    hints: list[Hint] = Field(default_factory=list)
    result: SessionQuestionResult
    variant_of: str | None = Field(default=None, alias="variantOf")
    source_question_id: str | None = Field(default=None, alias="sourceQuestionId")
    understanding_explanation: str | None = Field(default=None, alias="understandingExplanation")
    scoring_explanation: str | None = Field(default=None, alias="scoringExplanation")
    passage_evidence: str | None = Field(default=None, alias="passageEvidence")
    error_pattern: str | None = Field(default=None, alias="errorPattern")
    knowledge_node_id: str | None = Field(default=None, alias="knowledgeNodeId")


class SessionRequest(BaseModel):
    """POST /api/sessions — multi-question session submission."""
    session_id: str = Field(..., min_length=1, alias="sessionId")
    student_id: str = Field(default="default", alias="studentId")
    task_id: str | None = Field(default=None, alias="taskId")
    task_title: str = Field(default="", alias="taskTitle")
    subject: str = ""
    completed_at: str = Field(default="", alias="completedAt")
    time_spent: int = Field(default=0, alias="timeSpent")
    time_spent_seconds: int = Field(default=0, alias="timeSpentSeconds")
    questions: list[SessionQuestion] = Field(..., min_length=1)


# ============================================================================
# Agent request types
# ============================================================================

class AnalyzeRequest(BaseModel):
    """POST /api/agent/analyze — full diagnosis -> framework -> hint pipeline."""
    student_id: str = Field(default="default", alias="studentId")
    question: dict = Field(..., description="QuestionContext fields")
    progress: dict = Field(..., description="StudentProgress fields")


class CounterReplyRequest(BaseModel):
    """POST /api/agent/counter-reply — student responds to counter-question."""
    session_id: str = Field(..., min_length=1, alias="sessionId")
    question_id: str = Field(..., min_length=1, alias="questionId")
    student_id: str = Field(default="default", alias="studentId")
    counter_reply: str = Field(..., min_length=1, alias="counterReply")


# ============================================================================
# Agent response types
# ============================================================================

class HintResponse(BaseModel):
    level: int
    title: str
    content: str
    next_step: str | None = Field(default=None, alias="nextStep")


class DiagnosisResponse(BaseModel):
    error_type: str | None = Field(default=None, alias="errorType")
    confidence: float = 1.0
    counter_question: str | None = Field(default=None, alias="counterQuestion")
    where_wrong: str = Field(default="", alias="whereWrong")
    why_wrong: str = Field(default="", alias="whyWrong")
    linked_knowledge: list[str] = Field(default_factory=list, alias="linkedKnowledge")
    understanding_explanation: str | None = Field(default=None, alias="understandingExplanation")
    scoring_explanation: str | None = Field(default=None, alias="scoringExplanation")


class WeakLinkResponse(BaseModel):
    node_id: str = Field(..., alias="nodeId")
    node_name: str = Field(..., alias="nodeName")
    depth: int
    mastery: float
    evidence: list[str] = Field(default_factory=list)


class FrameworkResponse(BaseModel):
    weak_links: list[WeakLinkResponse] = Field(default_factory=list, alias="weakLinks")
    explanation: str = ""


class AnalyzeResponse(BaseModel):
    diagnosis: DiagnosisResponse | None = None
    framework: FrameworkResponse | None = None
    hint: HintResponse | None = None
    counter_question: str | None = Field(default=None, alias="counterQuestion")


# ============================================================================
# Session response types (must follow Agent response types above)
# ============================================================================

class SessionResultQuestion(BaseModel):
    question_id: str = Field(..., alias="questionId")
    status: str
    diagnosis: DiagnosisResponse | None = None
    framework: FrameworkResponse | None = None
    hint: HintResponse | None = None
    counter_question: str | None = Field(default=None, alias="counterQuestion")


class SessionResponse(BaseModel):
    sessionId: str
    session_id: str = Field(..., alias="session_id")
    questions: list[SessionResultQuestion] = Field(default_factory=list)
