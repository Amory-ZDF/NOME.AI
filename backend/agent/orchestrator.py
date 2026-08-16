"""Orchestrator — Diagnose → Route → Execute.

The orchestrator is the single entry point for agent interactions.
It owns the Planner, reads SKILL.md files via the skill loader, and
runs each skill by sending the skill's system prompt + structured
user message to the LLM and validating against Pydantic schemas.

Core flow (DIAGNOSIS ALWAYS FIRST):
    Student submits wrong answer
        → error_diagnosis (mandatory)
        → if confidence < 0.7: return counter_question, wait for reply, re-diagnose
        → if diagnosis confirms knowledge/method gap + node_id + history:
            → knowledge_framework
        → if question type supports hints:
            → progressive_hint
        → return response

The Planner is retained ONLY for the hint-generation decision (which
layer, what tone) — not for deciding WHETHER to run diagnosis or framework.
Those decisions are field-constrained, not LLM-judged.
"""

from __future__ import annotations

import importlib
import logging
from typing import Any

from pydantic import BaseModel

from core.types import (
    AgentResponse,
    DiagnosisResult,
    ErrorRecord,
    ErrorType,
    FrameworkResult,
    HintResult,
    QuestionContext,
    QuestionType,
    StudentProgress,
    PROGRESSIVE_HINT_TYPES,
    SIMPLIFIED_HINT_TYPES,
    NON_HINT_TYPES,
    FRAMEWORK_ELIGIBLE_ERROR_TYPES,
)
from core.llm_client import LLMClient
from skill.common import SkillDomain
from skill.loader import load_skill, SkillLoadError
from tool.knowledge_graph import KnowledgeGraph
from memory.retriever import MemoryRetriever

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Schema resolution — map SkillDomain → Pydantic model class + result dataclass
# ---------------------------------------------------------------------------

_SKILL_SCHEMA_MODULES: dict[SkillDomain, str] = {
    SkillDomain.PROGRESSIVE_HINT: "skill.progressive_hint.schema",
    SkillDomain.ERROR_DIAGNOSIS: "skill.error_diagnosis.schema",
    SkillDomain.KNOWLEDGE_FRAMEWORK: "skill.knowledge_framework.schema",
}

_SKILL_OUTPUT_CLASS: dict[SkillDomain, str] = {
    SkillDomain.PROGRESSIVE_HINT: "HintOutput",
    SkillDomain.ERROR_DIAGNOSIS: "DiagnosisOutput",
    SkillDomain.KNOWLEDGE_FRAMEWORK: "FrameworkOutput",
}


def _resolve_output_model(domain: SkillDomain) -> type[BaseModel]:
    module_name = _SKILL_SCHEMA_MODULES[domain]
    class_name = _SKILL_OUTPUT_CLASS[domain]
    module = importlib.import_module(module_name)
    return getattr(module, class_name)


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------


class Orchestrator:
    """Top-level agent — owns skill execution.

    The orchestrator reads SKILL.md instructions at construction time
    and caches them. Each skill invocation:
        1. Looks up the cached system prompt (SKILL.md body).
        2. Sends system + structured user message to the LLM via LLMClient.
        3. Validates the response against the skill's Pydantic schema.
        4. Converts the Pydantic model into a core.types dataclass.
    """

    def __init__(
        self,
        client: LLMClient,
        provider: str = "deepseek",
        knowledge_graph: KnowledgeGraph | None = None,
        memory_retriever: MemoryRetriever | None = None,
    ) -> None:
        self.client = client
        self.provider = provider
        # Optional graph + memory wiring. When present, the framework skill is fed
        # deterministically-computed node_states / prerequisite chains instead of an
        # empty stub (LLM brain-drawing is the fallback, not the source of truth).
        self._knowledge_graph = knowledge_graph
        self._memory_retriever = memory_retriever

        self._skill_prompts: dict[SkillDomain, str] = {}
        self._skill_schemas: dict[SkillDomain, type[BaseModel]] = {}

        for domain in SkillDomain:
            try:
                prompt, _ = load_skill(domain)
                self._skill_prompts[domain] = prompt
                self._skill_schemas[domain] = _resolve_output_model(domain)
                logger.info("Loaded skill: %s", domain.value)
            except (SkillLoadError, ImportError, AttributeError) as exc:
                logger.warning("Skill %s unavailable: %s", domain.value, exc)

    # ---- Public API: multi-question entry (线上试卷答题) ----------------

    async def handle_session(
        self,
        student_id: str,
        session_id: str,
        questions: list[tuple[QuestionContext, StudentProgress]],
        error_history: list[ErrorRecord] | None = None,
    ) -> list[AgentResponse]:
        """Handle a full session of multiple questions.

        Each question gets its own diagnosis→framework→hint loop,
        but all share the same memory context (student_id, session_id).
        """
        results: list[AgentResponse] = []
        for question, progress in questions:
            response = await self.handle(student_id, question, progress, error_history)
            results.append(response)
        return results

    # ---- Public API: single question ----------------------------------

    async def handle(
        self,
        student_id: str,
        question: QuestionContext,
        progress: StudentProgress,
        error_history: list[ErrorRecord] | None = None,
    ) -> AgentResponse:
        """Handle one question submission.

        Flow:
            1. If answer is correct → return immediately (no skills needed).
            2. error_diagnosis (MANDATORY for any wrong answer).
            3. If confidence < 0.7 → return counter_question.
            4. Route: error_type determines framework, question.type determines hint.
        """
        # Already graded correct by the caller (choice questions pre-grade locally)
        if progress.status == "correct":
            return AgentResponse(is_correct=True)

        # Free-response questions are NOT pre-graded by the caller, so the
        # diagnosis run doubles as the grader: the LLM first decides whether the
        # answer is correct, then only diagnoses when it is wrong.
        grade_answer = progress.status not in ("correct", "wrong")

        # Step 1: Diagnosis always runs first (with grading when ungraded)
        diagnosis = await self._run_diagnosis(
            question, progress, error_history, grade_answer=grade_answer
        )
        if diagnosis is None:
            return AgentResponse()

        # LLM grading verdict for an ungraded submission
        if grade_answer and diagnosis.is_correct is True:
            return AgentResponse(is_correct=True)

        # Step 2: Counter-question when uncertain
        if diagnosis.counter_question is not None:
            return AgentResponse(
                diagnosis=diagnosis,
                counter_question=diagnosis.counter_question,
                is_correct=diagnosis.is_correct,
            )

        # Step 3: Framework — only when field-constrained conditions are met
        framework = None
        if self._should_run_framework(diagnosis, question, error_history):
            try:
                framework = await self._run_framework(
                    student_id, question, progress, diagnosis, error_history
                )
            except Exception as exc:
                logger.warning("Framework failed, continuing without it: %s", exc)

        # Step 4: Hint — depends on question type
        hint = await self._generate_hint(
            question, progress, diagnosis, framework
        )

        return AgentResponse(
            hint=hint,
            diagnosis=diagnosis,
            framework=framework,
            is_correct=diagnosis.is_correct,
        )

    async def handle_counter_reply(
        self,
        student_id: str,
        question: QuestionContext,
        progress: StudentProgress,
        error_history: list[ErrorRecord] | None,
        counter_reply: str,
    ) -> AgentResponse:
        """Re-run diagnosis with the student's reply to a counter-question.

        After the orchestrator returns a counter_question, the frontend
        collects the student's reply and calls this method to re-diagnose.
        """
        diagnosis = await self._run_diagnosis(
            question, progress, error_history, counter_reply=counter_reply
        )
        if diagnosis is None:
            return AgentResponse()

        # Check if we're STILL uncertain (rare — if so, escalate)
        if diagnosis.counter_question is not None:
            return AgentResponse(
                diagnosis=diagnosis,
                counter_question=diagnosis.counter_question,
            )

        framework = None
        if self._should_run_framework(diagnosis, question, error_history):
            try:
                framework = await self._run_framework(
                    student_id, question, progress, diagnosis, error_history
                )
            except Exception as exc:
                logger.warning("Framework failed: %s", exc)

        hint = await self._generate_hint(
            question, progress, diagnosis, framework
        )

        return AgentResponse(
            hint=hint,
            diagnosis=diagnosis,
            framework=framework,
        )

    # ---- Public API: isolated hint generation ----------------------------

    async def generate_hint(
        self,
        question: QuestionContext,
        progress: StudentProgress,
    ) -> HintResult | None:
        """Generate the next hint layer for a question, independent of diagnosis.

        Called by the per-layer unlock endpoint. The hint is generated from the
        question + attempt context alone; no diagnosis is required (the hint
        skill falls back to generic guidance when none exists).
        """
        return await self._generate_hint(question, progress, None, None)

    # ---- Internal: field-constrained routing ---------------------------

    @staticmethod
    def _should_run_framework(
        diagnosis: DiagnosisResult,
        question: QuestionContext,
        error_history: list[ErrorRecord] | None,
    ) -> bool:
        """Field constraint (not LLM judgment) for knowledge_framework trigger.

        All three conditions must be true:
            1. error_type ∈ {knowledge, method}
            2. question has a knowledge_node_id
            3. student has prior error history (evidence exists)
        """
        if diagnosis.error_type is None:
            return False
        if diagnosis.error_type not in FRAMEWORK_ELIGIBLE_ERROR_TYPES:
            return False
        if question.knowledge_node_id is None:
            return False
        if not error_history:
            return False
        return True

    @staticmethod
    def _hint_level_for_type(question_type: QuestionType) -> int:
        """Max hint layers based on question type."""
        if question_type in PROGRESSIVE_HINT_TYPES:
            return 5
        if question_type in SIMPLIFIED_HINT_TYPES:
            return 3
        return 0  # reading/writing — don't use progressive_hint

    # ---- Internal: skill execution ------------------------------------

    async def _run_diagnosis(
        self,
        question: QuestionContext,
        progress: StudentProgress,
        error_history: list[ErrorRecord] | None = None,
        counter_reply: str | None = None,
        grade_answer: bool = False,
    ) -> DiagnosisResult | None:
        """Execute error_diagnosis skill."""
        domain = SkillDomain.ERROR_DIAGNOSIS
        prompt = self._skill_prompts.get(domain)
        output_model = self._skill_schemas.get(domain)
        if prompt is None or output_model is None:
            logger.error("ErrorDiagnosis skill not available")
            return None

        user_message = _build_diagnosis_message(
            question=question,
            progress=progress,
            error_history=error_history,
            counter_reply=counter_reply,
            grade_answer=grade_answer,
        )

        pydantic_result = await self.client.chat_structured(
            self.provider,
            system=prompt,
            messages=[{"role": "user", "content": user_message}],
            output_model=output_model,
        )
        return _pydantic_to_diagnosis_result(pydantic_result)

    async def _run_framework(
        self,
        student_id: str,
        question: QuestionContext,
        progress: StudentProgress,
        diagnosis: DiagnosisResult,
        error_history: list[ErrorRecord] | None = None,
    ) -> FrameworkResult | None:
        """Execute knowledge_framework skill.

        Pre-computes the graph traversal + decay-weighted mastery deterministically
        (via KnowledgeGraph.get_prerequisite_chain + MemoryRetriever.get_node_states)
        and hands the result to the LLM, which only writes the narrative. Without a
        wired graph/memory, node_states falls back to {} and the LLM has nothing to
        ground its weak-link claims in.
        """
        domain = SkillDomain.KNOWLEDGE_FRAMEWORK
        prompt = self._skill_prompts.get(domain)
        output_model = self._skill_schemas.get(domain)
        if prompt is None or output_model is None:
            logger.error("KnowledgeFramework skill not available")
            return None

        prerequisite_chain, node_states, weak_links = await self._precompute_framework(
            student_id, question.knowledge_node_id
        )

        user_message = _build_framework_message(
            question=question,
            diagnosis=diagnosis,
            error_history=error_history,
            node_states=node_states,
            prerequisite_chain=prerequisite_chain,
            weak_links=weak_links,
        )

        pydantic_result = await self.client.chat_structured(
            self.provider,
            system=prompt,
            messages=[{"role": "user", "content": user_message}],
            output_model=output_model,
        )
        return _pydantic_to_framework_result(pydantic_result)

    async def _precompute_framework(
        self,
        student_id: str,
        node_id: str | None,
    ) -> tuple[list[dict[str, Any]], dict[str, float], list[dict[str, Any]]]:
        """Deterministically compute the framework's evidence inputs.

        Returns (prerequisite_chain, node_states, weak_links):
            - prerequisite_chain: upstream nodes (with depth) from the graph BFS.
            - node_states: {node_id: decay-weighted mastery} from memory.
            - weak_links: chain nodes with mastery < 0.6, sorted (depth, mastery).

        All three are empty when the graph/memory are unwired (pre-Flow C), so the
        LLM falls back to its own judgment rather than fabricating grounded data.
        """
        graph = self._knowledge_graph
        memory = self._memory_retriever

        if graph is None or node_id is None:
            return [], {}, []

        chain = graph.get_prerequisite_chain(node_id)
        if not chain:
            return [], {}, []

        node_ids = [node.get("id", "") for node in chain]
        node_ids = [nid for nid in node_ids if nid]

        node_states: dict[str, float] = {}
        if memory is not None:
            try:
                node_states = await memory.get_node_states(student_id, node_ids)
            except Exception as exc:
                logger.warning("node_states computation failed: %s", exc)

        weak_links: list[dict[str, Any]] = []
        try:
            weak_links = graph.find_weak_links(node_id, node_states, threshold=0.6)
        except Exception as exc:
            logger.warning("find_weak_links failed: %s", exc)

        return chain, node_states, weak_links

    async def _generate_hint(
        self,
        question: QuestionContext,
        progress: StudentProgress,
        diagnosis: DiagnosisResult,
        framework: FrameworkResult | None = None,
    ) -> HintResult | None:
        """Generate a hint if the question type supports it.

        For NON_HINT_TYPES (reading, writing), returns None — the
        frontend should route to subject-specific feedback instead.
        """
        max_level = self._hint_level_for_type(question.type)
        if max_level == 0:
            return None  # reading/writing

        if progress.hint_level >= max_level:
            # Ceiling reached — don't generate more hints
            return HintResult(
                level=progress.hint_level,
                title="No more hints available",
                content=(
                    "You've reached the deepest hint level for this question. "
                    "I recommend reviewing what we've covered and talking to "
                    "your teacher if you're still stuck."
                ),
                next_step="Talk to your teacher or try a similar practice question.",
            )

        domain = SkillDomain.PROGRESSIVE_HINT
        prompt = self._skill_prompts.get(domain)
        output_model = self._skill_schemas.get(domain)
        if prompt is None or output_model is None:
            logger.error("ProgressiveHint skill not available")
            return None

        # A hint can be requested on its own (per-layer unlock) before any
        # diagnosis exists. Feed the hint skill a minimal fallback so it still
        # generates generic, level-appropriate guidance instead of erroring.
        effective_diagnosis = diagnosis or DiagnosisResult(
            error_type=None,
            confidence=1.0,
            where_wrong="",
            why_wrong="",
        )

        user_message = _build_hint_message(
            question=question,
            progress=progress,
            diagnosis=effective_diagnosis,
            framework=framework,
            max_level=max_level,
        )

        pydantic_result = await self.client.chat_structured(
            self.provider,
            system=prompt,
            messages=[{"role": "user", "content": user_message}],
            output_model=output_model,
        )
        return _pydantic_to_hint_result(pydantic_result)


# ---------------------------------------------------------------------------
# Message builders — convert internal types → LLM-readable JSON
# ---------------------------------------------------------------------------


def _build_diagnosis_message(
    question: QuestionContext,
    progress: StudentProgress,
    error_history: list[ErrorRecord] | None = None,
    counter_reply: str | None = None,
    grade_answer: bool = False,
) -> str:
    """Build the user message for error_diagnosis.

    Matches the Input schema in error_diagnosis/SKILL.md:
    { question, student, memory, counter_reply }.
    """
    payload: dict[str, Any] = {
        "question": {
            "id": question.id,
            "topic": question.topic,
            "type": question.type.value,
            "difficulty": question.difficulty,
            "content": question.content,
            "correct_answer": question.correct_answer,
            "mark_scheme": question.mark_scheme,
            "image_description": question.image_description,
            "options": question.options,
            "correct_index": question.correct_index,
            "knowledge_node_id": question.knowledge_node_id,
        },
        "student": {
            "current_answer": progress.current_answer,
            "hint_level": progress.hint_level,
            "attempts": progress.attempts,
        },
        "memory": {
            "error_history": (
                [
                    {
                        "id": e.id,
                        "error_type": e.error_type.value,
                        "knowledge_node_id": e.knowledge_node_id,
                        "occurred_at": e.occurred_at.isoformat() if e.occurred_at else None,
                    }
                    for e in error_history
                ]
                if error_history
                else []
            ),
        },
        "counter_reply": counter_reply,
        "grade_answer": grade_answer,
    }
    import json
    return json.dumps(payload, ensure_ascii=False, indent=2)


def _build_framework_message(
    question: QuestionContext,
    diagnosis: DiagnosisResult,
    error_history: list[ErrorRecord] | None = None,
    node_states: dict[str, float] | None = None,
    prerequisite_chain: list[dict[str, Any]] | None = None,
    weak_links: list[dict[str, Any]] | None = None,
) -> str:
    """Build the user message for knowledge_framework.

    Matches knowledge_framework/SKILL.md Input schema. `node_states`,
    `prerequisite_chain` and `weak_links` are pre-computed deterministically by the
    orchestrator (graph BFS + decay-weighted memory), NOT hallucinated by the LLM.
    """
    payload: dict[str, Any] = {
        "error_node_id": question.knowledge_node_id,
        "diagnosis": {
            "error_type": diagnosis.error_type.value if diagnosis.error_type else None,
            "where_wrong": diagnosis.where_wrong,
            "why_wrong": diagnosis.why_wrong,
            "linked_knowledge": diagnosis.linked_knowledge,
        },
        "question_type": question.type.value,
        "memory": {
            "error_history": (
                [
                    {
                        "id": e.id,
                        "error_type": e.error_type.value,
                        "knowledge_node_id": e.knowledge_node_id,
                        "occurred_at": e.occurred_at.isoformat() if e.occurred_at else None,
                    }
                    for e in error_history
                ]
                if error_history
                else []
            ),
            "node_states": node_states or {},
        },
        "graph": {
            "prerequisite_chain": prerequisite_chain or [],
            "weak_links": weak_links or [],
        },
    }
    import json
    return json.dumps(payload, ensure_ascii=False, indent=2)


def _build_hint_message(
    question: QuestionContext,
    progress: StudentProgress,
    diagnosis: DiagnosisResult,
    framework: FrameworkResult | None = None,
    max_level: int = 5,
) -> str:
    """Build the user message for progressive_hint.

    Matches progressive_hint/SKILL.md Input schema:
    { question, student, diagnosis, framework, tone_preference }.
    """
    payload: dict[str, Any] = {
        "question": {
            "id": question.id,
            "topic": question.topic,
            "type": question.type.value,
            "difficulty": question.difficulty,
            "content": question.content,
            "correct_answer": question.correct_answer,
        },
        "student": {
            "current_answer": progress.current_answer,
            "hint_level": min(progress.hint_level, max_level),
            "attempts": progress.attempts,
        },
        "diagnosis": {
            "error_type": diagnosis.error_type.value if diagnosis.error_type else None,
            "where_wrong": diagnosis.where_wrong,
            "why_wrong": diagnosis.why_wrong,
        },
        "framework": (
            {"explanation": framework.explanation}
            if framework
            else None
        ),
        "tone_preference": None,
    }
    import json
    return json.dumps(payload, ensure_ascii=False, indent=2)


# ---------------------------------------------------------------------------
# Conversion helpers — Pydantic schema model → core.types dataclass
# ---------------------------------------------------------------------------


def _pydantic_to_hint_result(model: BaseModel) -> HintResult:
    return HintResult(
        level=model.level,
        title=model.title,
        content=model.content,
        next_step=getattr(model, "next_step", None),
    )


def _pydantic_to_diagnosis_result(model: BaseModel) -> DiagnosisResult:
    error_type_raw = getattr(model, "error_type", None)
    return DiagnosisResult(
        error_type=ErrorType(error_type_raw) if error_type_raw else None,
        confidence=float(getattr(model, "confidence", 1.0)),
        counter_question=getattr(model, "counter_question", None),
        where_wrong=getattr(model, "where_wrong", ""),
        why_wrong=getattr(model, "why_wrong", ""),
        linked_knowledge=getattr(model, "linked_knowledge", []),
        understanding_explanation=getattr(model, "understanding_explanation", None),
        scoring_explanation=getattr(model, "scoring_explanation", None),
        is_correct=getattr(model, "is_correct", None),
    )


def _pydantic_to_framework_result(model: BaseModel) -> FrameworkResult:
    from core.types import WeakLink
    weak_links = [
        WeakLink(
            node_id=wl.node_id,
            node_name=wl.node_name,
            depth=wl.depth,
            mastery=wl.mastery,
            evidence=wl.evidence,
        )
        for wl in model.weak_links
    ]
    return FrameworkResult(
        weak_links=weak_links,
        explanation=model.explanation,
    )
