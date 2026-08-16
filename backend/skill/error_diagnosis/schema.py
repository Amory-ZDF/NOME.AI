"""Diagnosis output schema — matches error_diagnosis/SKILL.md Output section."""

from pydantic import BaseModel, Field


class DiagnosisOutput(BaseModel):
    is_correct: bool | None = Field(
        default=None,
        description=(
            "Grading verdict: whether the student's answer is correct against "
            "the mark scheme / correct answer. Only filled when the caller has "
            "NOT pre-graded the answer (free-response questions graded by LLM). "
            "Null when grading is already settled (e.g. choice questions)."
        ),
    )
    error_type: str | None = Field(
        default=None,
        description=(
            "One of: knowledge, method, calculation, reading, execution, "
            "expression, habit. Null when confidence < 0.7 — orchestrator "
            "must then read counter_question instead."
        ),
    )
    confidence: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description=(
            "0.0-1.0. Threshold 0.7: below → error_type is null and "
            "counter_question is filled. Above → error_type is set."
        ),
    )
    counter_question: str | None = Field(
        default=None,
        description=(
            "When confidence < 0.7: one concrete question for the student "
            "to resolve the ambiguity. Null when confident."
        ),
    )
    where_wrong: str = Field(
        default="",
        description="Concrete location of the mistake, quoting the student's answer",
    )
    why_wrong: str = Field(
        default="",
        description="Root cause explanation of why the student made this error",
    )
    linked_knowledge: list[str] = Field(
        default_factory=list,
        description="1-3 knowledge graph node IDs this error relates to",
    )
    understanding_explanation: str | None = Field(
        default=None,
        description="A-Level conceptual explanation from first principles",
    )
    scoring_explanation: str | None = Field(
        default=None,
        description="A-Level mark-scheme layer — which scoring points were missed",
    )
