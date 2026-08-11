"""Pydantic domain models — complete REST contract matching API_INTERFACE.md.

All models use camelCase aliases so the JSON output matches what the
frontend expects. Python code uses snake_case internally.

Model organization:
    §1 Bootstrap response
    §2 Shared types (Student, Task, Question, Hint, ExerciseSet, etc.)
    §3 Request types (for write endpoints)
    §4 Response types
    §5 Agent-specific types
    §6 Common envelope
"""

from __future__ import annotations

from datetime import datetime
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


class TaskTypeEnum(StrEnum):
    TEACHER_ASSIGNED = "teacher_assigned"
    ERROR_REVIEW = "error_review"
    AI_RECOMMENDED = "ai_recommended"


class TaskPriorityEnum(StrEnum):
    P0 = "P0"
    P1 = "P1"
    P2 = "P2"


class TaskStatusEnum(StrEnum):
    PENDING = "pending"
    COMPLETED = "completed"


class SessionQuestionStatusEnum(StrEnum):
    CORRECT = "correct"
    WRONG = "wrong"
    UNANSWERED = "unanswered"


class ErrorStatusEnum(StrEnum):
    PENDING_REVIEW = "pending_review"
    REVIEWING = "reviewing"
    VERIFICATION_DUE = "verification_due"
    MASTERED = "mastered"


class NoteSourceEnum(StrEnum):
    TYPED = "typed"
    HANDWRITTEN = "handwritten"
    PHOTO = "photo"
    AI_ORGANIZED = "ai_organized"


class AdjustmentReasonEnum(StrEnum):
    TIME_CONFLICT = "time_conflict"
    DIFFICULTY = "difficulty"
    HEALTH = "health"
    OTHER = "other"


class BankSourceEnum(StrEnum):
    PAST_EXAM = "past_exam"
    MOCK = "mock"
    TEACHER_UPLOAD = "teacher_upload"


class BankStudentStatusEnum(StrEnum):
    NOT_ATTEMPTED = "not_attempted"
    CORRECT = "correct"
    WRONG = "wrong"


class AiSuggestionTypeEnum(StrEnum):
    SPLIT_NOTE = "split_note"
    LINK_TOPIC = "link_topic"
    RELATED_CONTENT = "related_content"


# ============================================================================
# Common envelope — API_INTERFACE.md Conventions
# ============================================================================

class ApiResponse(BaseModel):
    code: int = 0
    message: str = "ok"
    data: Any = None


# ============================================================================
# §2 Shared Types
# ============================================================================

class Student(BaseModel):
    id: str
    name: str
    avatar: str | None = None
    joined_days: int = Field(..., alias="joinedDays")
    grade_info: str = Field(..., alias="gradeInfo")


class Task(BaseModel):
    id: str
    title: str
    type: TaskTypeEnum
    subject: str
    estimated_minutes: float = Field(..., alias="estimatedMinutes")
    due_at: str | None = Field(default=None, alias="dueAt")
    assigned_by: str | None = Field(default=None, alias="assignedBy")
    priority: TaskPriorityEnum
    is_overdue: bool = Field(..., alias="isOverdue")
    status: TaskStatusEnum
    last_accuracy: float | None = Field(default=None, alias="lastAccuracy")
    exercise_set_id: str | None = Field(default=None, alias="exerciseSetId")
    topic_ids: list[str] | None = Field(default=None, alias="topicIds")
    completed_at: str | None = Field(default=None, alias="completedAt")
    adjustment_status: str | None = Field(default=None, alias="adjustmentStatus")
    source_question_id: str | None = Field(default=None, alias="sourceQuestionId")
    verification_for_error_id: str | None = Field(default=None, alias="verificationForErrorId")
    reason: str | None = None
    created_at: str | None = Field(default=None, alias="createdAt")


class TaskAdjustment(BaseModel):
    id: str
    task_id: str = Field(..., alias="taskId")
    reason: AdjustmentReasonEnum
    details: str = ""
    available_minutes: int = Field(..., alias="availableMinutes")
    proposed_due_at: str = Field(..., alias="proposedDueAt")
    created_at: str = Field(..., alias="createdAt")
    status: str = "submitted"


class Hint(BaseModel):
    level: int = Field(..., ge=1, le=5)
    title: str
    content: str


class Question(BaseModel):
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
    variant_of: str | None = Field(default=None, alias="variantOf")
    source_question_id: str | None = Field(default=None, alias="sourceQuestionId")
    understanding_explanation: str | None = Field(default=None, alias="understandingExplanation")
    scoring_explanation: str | None = Field(default=None, alias="scoringExplanation")
    passage_evidence: str | None = Field(default=None, alias="passageEvidence")
    error_pattern: str | None = Field(default=None, alias="errorPattern")


class ExerciseSet(BaseModel):
    id: str | None = None
    task_id: str | None = Field(default=None, alias="taskId")
    title: str = ""
    subject: str = ""
    questions: list[Question] = Field(default_factory=list)
    source_question_id: str | None = Field(default=None, alias="sourceQuestionId")
    created_at: str | None = Field(default=None, alias="createdAt")


class RedoAttempt(BaseModel):
    attempted_at: str = Field(..., alias="attemptedAt")
    answer: str
    is_correct: bool = Field(..., alias="isCorrect")
    time_spent: float = Field(..., alias="timeSpent")


class OccurrenceRecord(BaseModel):
    key: str
    occurred_at: str = Field(..., alias="occurredAt")


class VariantVerification(BaseModel):
    variant_id: str = Field(..., alias="variantId")
    is_correct: bool = Field(..., alias="isCorrect")
    verified_at: str = Field(..., alias="verifiedAt")


class ErrorItem(BaseModel):
    id: str
    question_id: str = Field(..., alias="questionId")
    session_id: str | None = Field(default=None, alias="sessionId")
    subject: str
    error_type: ErrorTypeEnum = Field(..., alias="errorType")
    question_summary: str = Field(..., alias="questionSummary")
    question_content: str = Field(..., alias="questionContent")
    type: QuestionTypeEnum | None = None
    difficulty: int | None = None
    error_description: str = Field(..., alias="errorDescription")
    related_topic: str = Field(..., alias="relatedTopic")
    topic_id: str | None = Field(default=None, alias="topicId")
    where_wrong: str = Field(default="", alias="whereWrong")
    why_wrong: str = Field(default="", alias="whyWrong")
    linked_ability: str = Field(default="", alias="linkedAbility")
    hint_dependency: int = Field(default=0, alias="hintDependency")
    first_occurred_at: str = Field(..., alias="firstOccurredAt")
    last_occurred_at: str = Field(..., alias="lastOccurredAt")
    occurrences: list[str] = Field(default_factory=list)
    occurrence_keys: list[str] = Field(default_factory=list, alias="occurrenceKeys")
    occurrence_records: list[OccurrenceRecord] = Field(default_factory=list, alias="occurrenceRecords")
    repeat_count: int = Field(..., alias="repeatCount")
    has_incomplete_occurrence_history: bool | None = Field(default=None, alias="hasIncompleteOccurrenceHistory")
    status: ErrorStatusEnum = ErrorStatusEnum.PENDING_REVIEW
    student_answer: str = Field(..., alias="studentAnswer")
    correct_answer: str = Field(..., alias="correctAnswer")
    analysis: str = ""
    accept_keywords: list[str] = Field(default_factory=list, alias="acceptKeywords")
    options: list[str] | None = None
    correct_index: int | None = Field(default=None, alias="correctIndex")
    redo_history: list[RedoAttempt] = Field(default_factory=list, alias="redoHistory")
    verification_variant_id: str | None = Field(default=None, alias="verificationVariantId")
    variant_verified_at: str | None = Field(default=None, alias="variantVerifiedAt")
    variant_verification: VariantVerification | None = Field(default=None, alias="variantVerification")
    understanding_explanation: str | None = Field(default=None, alias="understandingExplanation")
    scoring_explanation: str | None = Field(default=None, alias="scoringExplanation")
    mark_scheme_points: list[dict] | None = Field(default=None, alias="markSchemePoints")
    passage_evidence: str | list[str] | None = Field(default=None, alias="passageEvidence")
    error_pattern: str | None = Field(default=None, alias="errorPattern")


class NoteBlock(BaseModel):
    t: str  # 'p' | 'h' | 'formula'
    v: str


class AiSuggestion(BaseModel):
    type: AiSuggestionTypeEnum
    message: str


class Note(BaseModel):
    id: str
    title: str
    folder_id: str = Field(..., alias="folderId")
    folder_path: str = Field(..., alias="folderPath")
    tags: list[str] = Field(default_factory=list)
    linked_topics: list[str] = Field(default_factory=list, alias="linkedTopics")
    linked_errors: list[str] = Field(default_factory=list, alias="linkedErrors")
    source: NoteSourceEnum
    created_at: str = Field(..., alias="createdAt")
    updated_at: str = Field(..., alias="updatedAt")
    content: list[NoteBlock] = Field(default_factory=list)
    ai_suggestions: list[AiSuggestion] = Field(default_factory=list, alias="aiSuggestions")


class NoteFolder(BaseModel):
    id: str
    name: str = ""
    note_count: int = Field(default=0, alias="noteCount")
    auto_created: bool = Field(default=False, alias="autoCreated")
    children: list[NoteFolder] | None = None
    parent_id: str | None = Field(default=None, alias="parentId")


class Settings(BaseModel):
    tone: int = Field(default=50, ge=0, le=100)
    daily_goal_hours: int = Field(default=6, ge=1, le=12, alias="dailyGoalHours")
    reminder_task: bool = Field(default=True, alias="reminderTask")
    reminder_error_review: bool = Field(default=True, alias="reminderErrorReview")
    reminder_study_time: bool = Field(default=True, alias="reminderStudyTime")


class Greeting(BaseModel):
    message: str = ""
    fallback: str = ""


class ModuleStats(BaseModel):
    notes_count: int = Field(default=0, alias="notesCount")
    weekly_exercises: int = Field(default=0, alias="weeklyExercises")
    latest_accuracy: float = Field(default=0, alias="latestAccuracy")
    pending_error_review: int = Field(default=0, alias="pendingErrorReview")


class KnowledgeHeatmapEntry(BaseModel):
    topic_id: str = Field(..., alias="topicId")
    topic_name: str = Field(..., alias="topicName")
    mastery: float = 0


class LearningSummary(BaseModel):
    overall_mastery: float = Field(default=0, alias="overallMastery")
    weekly_completed: int = Field(default=0, alias="weeklyCompleted")
    weekly_total: int = Field(default=0, alias="weeklyTotal")
    overdue_tasks: int = Field(default=0, alias="overdueTasks")
    weak_topics: list[str] = Field(default_factory=list, alias="weakTopics")
    knowledge_heatmap: list[KnowledgeHeatmapEntry] = Field(default_factory=list, alias="knowledgeHeatmap")


class BankQuestion(BaseModel):
    id: str
    subject: str
    topic: str
    chapter: str
    type: QuestionTypeEnum
    difficulty: int = Field(ge=1, le=5)
    source: BankSourceEnum
    source_detail: str = Field(..., alias="sourceDetail")
    correct_rate: float = Field(..., alias="correctRate")
    attempt_count: int = Field(..., alias="attemptCount")
    student_status: BankStudentStatusEnum = Field(..., alias="studentStatus")
    set_id: str | None = Field(default=None, alias="setId")
    preview: str = ""


# ============================================================================
# §1 Bootstrap
# ============================================================================

class BootstrapData(BaseModel):
    student: Student
    tasks: list[Task] = Field(default_factory=list)
    task_adjustments: list[TaskAdjustment] = Field(default_factory=list, alias="taskAdjustments")
    exercise_sets: dict[str, ExerciseSet] = Field(default_factory=dict, alias="exerciseSets")
    bank_exercise_sets: dict[str, ExerciseSet] = Field(default_factory=dict, alias="bankExerciseSets")
    sessions: dict[str, Any] = Field(default_factory=dict)
    errors: list[ErrorItem] = Field(default_factory=list)
    notes: list[Note] = Field(default_factory=list)
    note_folders: list[NoteFolder] = Field(default_factory=list, alias="noteFolders")
    settings: Settings = Field(default_factory=Settings)
    greeting: Greeting = Field(default_factory=Greeting)
    module_stats: ModuleStats = Field(default_factory=ModuleStats, alias="moduleStats")
    learning_summary: LearningSummary = Field(default_factory=LearningSummary, alias="learningSummary")


# ============================================================================
# §3 Request types (write endpoints)
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
    """One question inside a session submission — API_INTERFACE.md SessionQuestion."""
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
    # Extra fields used by the agent pipeline but not in the public contract
    knowledge_node_id: str | None = Field(default=None, alias="knowledgeNodeId")


class SessionRequest(BaseModel):
    """POST /api/sessions — API_INTERFACE.md Session."""
    session_id: str = Field(..., min_length=1, alias="sessionId")
    student_id: str = Field(default="default", alias="studentId")
    task_id: str | None = Field(default=None, alias="taskId")
    task_title: str = Field(default="", alias="taskTitle")
    subject: str = ""
    completed_at: str = Field(default="", alias="completedAt")
    time_spent: int = Field(default=0, alias="timeSpent")
    time_spent_seconds: int = Field(default=0, alias="timeSpentSeconds")
    questions: list[SessionQuestion] = Field(..., min_length=1)


class TaskPatch(BaseModel):
    status: str = "completed"


class NotePatch(BaseModel):
    title: str | None = None
    folder_id: str | None = Field(default=None, alias="folderId")
    folder_path: str | None = Field(default=None, alias="folderPath")
    tags: list[str] | None = None
    linked_topics: list[str] | None = Field(default=None, alias="linkedTopics")
    linked_errors: list[str] | None = Field(default=None, alias="linkedErrors")
    source: NoteSourceEnum | None = None
    content: list[dict] | None = None
    ai_suggestions: list[dict] | None = Field(default=None, alias="aiSuggestions")
    updated_at: str | None = Field(default=None, alias="updatedAt")


class SettingsPatch(BaseModel):
    tone: int | None = Field(default=None, ge=0, le=100)
    daily_goal_hours: int | None = Field(default=None, ge=1, le=12, alias="dailyGoalHours")
    reminder_task: bool | None = Field(default=None, alias="reminderTask")
    reminder_error_review: bool | None = Field(default=None, alias="reminderErrorReview")
    reminder_study_time: bool | None = Field(default=None, alias="reminderStudyTime")


class ErrorBatchRequest(BaseModel):
    items: list[ErrorItem] = Field(..., min_length=1)


class ErrorStatusPatch(BaseModel):
    status: str  # 'mastered' or 'reviewing'


class ErrorRedoRequest(BaseModel):
    attempted_at: str = Field(..., alias="attemptedAt")
    answer: str
    is_correct: bool = Field(..., alias="isCorrect")
    time_spent: float = Field(..., alias="timeSpent")


class ErrorVariantRequest(BaseModel):
    pass  # No body needed


class ErrorVerificationRequest(BaseModel):
    variant_id: str = Field(..., alias="variantId")
    is_correct: bool = Field(..., alias="isCorrect")
    verified_at: str = Field(..., alias="verifiedAt")


# ---- Agent-specific types ----

class AnalyzeRequest(BaseModel):
    """POST /api/agent/analyze — full diagnosis -> framework -> hint for one question."""
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
# §4 Response types
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


class SessionResultQuestion(BaseModel):
    question_id: str = Field(..., alias="questionId")
    status: str
    diagnosis: DiagnosisResponse | None = None
    framework: FrameworkResponse | None = None
    hint: HintResponse | None = None
    counter_question: str | None = Field(default=None, alias="counterQuestion")


class SessionResponse(BaseModel):
    sessionId: str = Field(..., description="Canonical session id — frontend uses this")
    session_id: str = Field(..., alias="session_id", description="Original snake_case session id")
    questions: list[SessionResultQuestion] = Field(default_factory=list)
