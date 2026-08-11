"""Hint output schema — matches progressive_hint/SKILL.md Output section."""

from pydantic import BaseModel, Field


class HintOutput(BaseModel):
    level: int = Field(..., ge=1, le=5, description="The hint layer being shown (1-5)")
    title: str = Field(
        ...,
        description=(
            "Short header: 'Clarify the Question' / 'Relevant Knowledge' / "
            "'Method Hint' / 'Key Step' / 'Full Solution'"
        ),
    )
    content: str = Field(
        ...,
        description="Student-facing hint text, 2-5 sentences. No markdown code fences.",
    )
    next_step: str | None = Field(
        default=None,
        description="Concrete action the student should try after reading this hint",
    )
