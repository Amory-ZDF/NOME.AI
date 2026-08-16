"""Agent-internal types — decoupled from FastAPI / Pydantic.

These are plain dataclasses used inside agent/core/skill/memory.
The Pydantic models in app.models.domain are the REST contract;
this module is the agent's internal vocabulary.
"""

from dataclasses import dataclass, field
from enum import StrEnum
from datetime import datetime
from typing import Any


# ---------------------------------------------------------------------------
# Enums — MUST stay in sync with API_INTERFACE.md §2
# ---------------------------------------------------------------------------
class ErrorType(StrEnum):
    KNOWLEDGE = "knowledge"
    METHOD = "method"
    CALCULATION = "calculation"
    READING = "reading"
    EXECUTION = "execution"
    EXPRESSION = "expression"
    HABIT = "habit"


class QuestionType(StrEnum):
    CHOICE = "choice"
    CALCULATION = "calculation"
    PROOF = "proof"
    FILL_BLANK = "fill_blank"
    READING = "reading"
    WRITING = "writing"


class ErrorStatus(StrEnum):
    PENDING_REVIEW = "pending_review"
    REVIEWING = "reviewing"
    VERIFICATION_DUE = "verification_due"
    MASTERED = "mastered"


# ---------------------------------------------------------------------------
# Agent input types
# ---------------------------------------------------------------------------
@dataclass
class QuestionContext:
    """Minimal question info needed by agent skills."""
    id: str
    topic: str
    type: QuestionType
    difficulty: int          # 1-5
    content: str             # HTML
    correct_answer: str
    accept_keywords: list[str] = field(default_factory=list)
    error_type: ErrorType = ErrorType.KNOWLEDGE
    knowledge_node_id: str | None = None
    mark_scheme: Any = None  # structured list or string — LLM grading standard
    image_description: str | None = None  # qwen-translated text for image-based prompts
    options: list[str] | None = None  # choice questions — the answer candidates
    correct_index: int | None = None  # choice questions — index of the correct option


@dataclass
class StudentProgress:
    """Current state of the student on one question."""
    question_id: str
    current_answer: str
    status: str              # unanswered | wrong | correct | ungraded (free-response pending LLM)
    hint_level: int          # 0-5, 0 = no hint seen
    solved_at_hint_level: int | None
    attempts: list[dict] = field(default_factory=list)  # [{answer, submitted_at, is_correct}]


@dataclass
class ErrorRecord:
    """One error card — mirrors API_INTERFACE.md ErrorItem."""
    id: str
    question_id: str
    subject: str
    error_type: ErrorType
    question_summary: str
    error_description: str
    related_topic: str
    knowledge_node_id: str | None = None
    occurred_at: datetime | None = None
    repeat_count: int = 1
    status: ErrorStatus = ErrorStatus.PENDING_REVIEW
    redo_history: list[dict] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Agent output types
# ---------------------------------------------------------------------------
@dataclass
class HintResult:
    """Output of ProgressiveHint skill."""
    level: int               # 1-5
    title: str
    content: str
    next_step: str | None = None  # concrete action for student


@dataclass
class DiagnosisResult:
    """Output of ErrorDiagnosis skill."""
    error_type: ErrorType | None   # null when confidence < 0.7 → use counter_question
    confidence: float = 1.0        # 0.0-1.0, threshold 0.7
    counter_question: str | None = None   # filled when confidence < 0.7
    where_wrong: str = ""          # concrete location
    why_wrong: str = ""            # root cause
    linked_knowledge: list[str] = field(default_factory=list)  # knowledge_node_ids
    understanding_explanation: str | None = None  # A-Level conceptual layer
    scoring_explanation: str | None = None        # A-Level mark-scheme layer
    is_correct: bool | None = None  # LLM grading verdict (free-response questions)


@dataclass
class WeakLink:
    """One weak prerequisite node found by KnowledgeFramework."""
    node_id: str
    node_name: str
    depth: int               # hops from the error node
    mastery: float           # 0-1 weighted estimate
    evidence: list[str]      # error ids that support this


@dataclass
class FrameworkResult:
    """Output of KnowledgeFramework skill."""
    weak_links: list[WeakLink]
    explanation: str         # human-readable evidence-chain narrative


# ---------------------------------------------------------------------------
# Execution plan (agent internal)
# ---------------------------------------------------------------------------
@dataclass
class Step:
    skill: str               # "progressive_hint" | "error_diagnosis" | "knowledge_framework"
    provider: str            # which LLM to use
    model: str
    reason: str              # why this step was planned


@dataclass
class ExecutionPlan:
    steps: list[Step]
    reasoning: str           # full LLM reasoning for auditability


# ---------------------------------------------------------------------------
# Routing constants — orchestrator uses these, not LLM judgment
# ---------------------------------------------------------------------------

# Question types that support the full 5-layer progressive hint
PROGRESSIVE_HINT_TYPES: tuple[QuestionType, ...] = (
    QuestionType.CALCULATION,
    QuestionType.PROOF,
    QuestionType.FILL_BLANK,
)

# Question types that support a simplified (≤3 layer) variant
SIMPLIFIED_HINT_TYPES: tuple[QuestionType, ...] = (
    QuestionType.CHOICE,
)

# Question types that should NEVER get progressive hints
# — use subject-specific feedback instead
NON_HINT_TYPES: tuple[QuestionType, ...] = (
    QuestionType.READING,
    QuestionType.WRITING,
)

# Error types that trigger knowledge_framework (field constraint, not LLM)
FRAMEWORK_ELIGIBLE_ERROR_TYPES: tuple[ErrorType, ...] = (
    ErrorType.KNOWLEDGE,
    ErrorType.METHOD,
)

# ---------------------------------------------------------------------------
# Orchestrator aggregate response
# ---------------------------------------------------------------------------
@dataclass
class AgentResponse:
    hint: HintResult | None = None
    diagnosis: DiagnosisResult | None = None
    framework: FrameworkResult | None = None
    counter_question: str | None = None  # orchestrator sets this when confidence < 0.7
    is_correct: bool | None = None       # LLM grading verdict (free-response questions)
