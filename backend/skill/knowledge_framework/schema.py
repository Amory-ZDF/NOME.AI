"""Framework output schema — matches knowledge_framework/SKILL.md Output section."""

from pydantic import BaseModel, Field


class WeakLinkOutput(BaseModel):
    node_id: str = Field(..., description="Graph node ID of the weak prerequisite")
    node_name: str = Field(..., description="Human-readable name, e.g. 'Vector Decomposition'")
    depth: int = Field(..., ge=1, description="Hops from the error node")
    mastery: float = Field(..., ge=0.0, le=1.0, description="Decay-weighted mastery score")
    evidence: list[str] = Field(
        default_factory=list,
        description="Error IDs with date and brief: 'err-042: sign error in derivative (2026-08-03)'",
    )


class FrameworkOutput(BaseModel):
    weak_links: list[WeakLinkOutput] = Field(
        default_factory=list,
        description="Weak prerequisite nodes sorted by (depth ASC, mastery ASC). Max 5.",
    )
    explanation: str = Field(
        ...,
        description="3-5 sentence evidence-chain narrative — student-facing English",
    )
