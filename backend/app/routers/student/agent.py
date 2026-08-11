"""Agent API router — HTTP interface to the orchestrator.

Endpoints:
    POST /api/agent/analyze       -> diagnosis -> framework -> hint for one question
    POST /api/agent/counter-reply -> respond to counter-question, re-diagnose
    POST /api/sessions            -> multi-question session submission (full pipeline)

All endpoints use the global orchestrator singleton from app.main.
Response follows API_INTERFACE.md envelope: { code: 0, data: {...} }.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException

from app.models.domain import (
    AnalyzeRequest,
    ApiResponse,
    AnalyzeResponse,
    CounterReplyRequest,
    DiagnosisResponse,
    FrameworkResponse,
    HintResponse,
    SessionRequest,
    SessionResponse,
    SessionResultQuestion,
    SessionQuestionStatusEnum,
    WeakLinkResponse,
)
from core.types import (
    AgentResponse,
    ErrorRecord,
    QuestionContext,
    QuestionType,
    StudentProgress,
    ErrorType,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["agent"])


def get_orchestrator():
    """Dependency — returns the global orchestrator from app.main."""
    from app.main import orchestrator
    if orchestrator is None:
        raise HTTPException(status_code=503, detail="Orchestrator not initialised")
    return orchestrator


def get_memory_retriever():
    """Dependency — returns the global memory retriever from app.main."""
    from app.main import memory_retriever
    return memory_retriever  # may be None


# ---------------------------------------------------------------------------
# Helpers: convert between HTTP models and agent-internal types
# ---------------------------------------------------------------------------

def _question_type_from_str(raw: str | QuestionTypeEnum) -> QuestionType:
    s = raw.value if hasattr(raw, "value") else raw
    try:
        return QuestionType(s)
    except ValueError:
        return QuestionType.CALCULATION


def _error_type_from_str(raw: str | None) -> ErrorType | None:
    if raw is None:
        return None
    s = raw.value if hasattr(raw, "value") else raw
    try:
        return ErrorType(s)
    except ValueError:
        return None


def _question_to_context(q) -> QuestionContext:
    """Convert a SessionQuestion -> QuestionContext."""
    return QuestionContext(
        id=q.id,
        topic=q.topic,
        type=_question_type_from_str(q.type),
        difficulty=q.difficulty,
        content=q.content,
        correct_answer=q.correct_display,
        accept_keywords=q.accept_keywords,
        knowledge_node_id=q.knowledge_node_id,
    )


def _question_to_progress(q) -> StudentProgress:
    """Convert a SessionQuestion.result -> StudentProgress."""
    last_answer = q.result.attempts[-1].answer if q.result.attempts else ""
    return StudentProgress(
        question_id=q.id,
        current_answer=last_answer,
        status=q.result.status.value,
        hint_level=q.result.hints_used,
        solved_at_hint_level=q.result.solved_at_hint_level,
        attempts=[
            {"answer": a.answer, "submitted_at": a.submitted_at, "is_correct": a.is_correct}
            for a in q.result.attempts
        ],
    )


def _response_to_analyze(ar: AgentResponse) -> AnalyzeResponse:
    """Convert AgentResponse -> AnalyzeResponse (HTTP model)."""
    diag = None
    if ar.diagnosis is not None:
        diag = DiagnosisResponse(
            error_type=ar.diagnosis.error_type.value if ar.diagnosis.error_type else None,
            confidence=ar.diagnosis.confidence,
            counter_question=ar.diagnosis.counter_question,
            where_wrong=ar.diagnosis.where_wrong,
            why_wrong=ar.diagnosis.why_wrong,
            linked_knowledge=ar.diagnosis.linked_knowledge,
            understanding_explanation=ar.diagnosis.understanding_explanation,
            scoring_explanation=ar.diagnosis.scoring_explanation,
        )

    fw = None
    if ar.framework is not None:
        fw = FrameworkResponse(
            weak_links=[
                WeakLinkResponse(
                    node_id=wl.node_id,
                    node_name=wl.node_name,
                    depth=wl.depth,
                    mastery=wl.mastery,
                    evidence=wl.evidence,
                )
                for wl in ar.framework.weak_links
            ],
            explanation=ar.framework.explanation,
        )

    hint = None
    if ar.hint is not None:
        hint = HintResponse(
            level=ar.hint.level,
            title=ar.hint.title,
            content=ar.hint.content,
            next_step=ar.hint.next_step,
        )

    return AnalyzeResponse(
        diagnosis=diag,
        framework=fw,
        hint=hint,
        counter_question=ar.counter_question,
    )


# ---------------------------------------------------------------------------
# POST /api/agent/analyze — single question full pipeline
# ---------------------------------------------------------------------------

@router.post("/agent/analyze", response_model=ApiResponse)
async def full_analysis(
    body: AnalyzeRequest,
    orch=Depends(get_orchestrator),
    memory=Depends(get_memory_retriever),
):
    question = body.question
    progress = body.progress
    student_id = body.student_id

    ctx = QuestionContext(
        id=question.get("id", ""),
        topic=question.get("topic", ""),
        type=_question_type_from_str(question.get("type", "calculation")),
        difficulty=question.get("difficulty", 3),
        content=question.get("content", ""),
        correct_answer=question.get("correct_answer", ""),
        accept_keywords=question.get("accept_keywords", question.get("acceptKeywords", [])),
        knowledge_node_id=question.get("knowledge_node_id", question.get("knowledgeNodeId")),
    )

    prog = StudentProgress(
        question_id=progress.get("question_id", progress.get("questionId", question.get("id", ""))),
        current_answer=progress.get("current_answer", progress.get("currentAnswer", "")),
        status=progress.get("status", "wrong"),
        hint_level=progress.get("hint_level", progress.get("hintLevel", 0)),
        solved_at_hint_level=progress.get("solved_at_hint_level", progress.get("solvedAtHintLevel")),
        attempts=progress.get("attempts", []),
    )

    error_history = None
    if memory is not None:
        try:
            error_history = await memory.get_error_history(student_id)
        except Exception as exc:
            logger.warning("Memory read failed: %s", exc)

    result = await orch.handle(ctx, prog, error_history)

    if memory is not None and result.diagnosis is not None and result.diagnosis.error_type is not None:
        try:
            import uuid
            from core.types import ErrorRecord, ErrorStatus
            err = ErrorRecord(
                id=str(uuid.uuid4()),
                question_id=ctx.id,
                subject=ctx.topic,
                error_type=result.diagnosis.error_type,
                question_summary=ctx.content[:100] if ctx.content else "",
                error_description=result.diagnosis.why_wrong,
                related_topic=ctx.topic,
                knowledge_node_id=ctx.knowledge_node_id,
                status=ErrorStatus.PENDING_REVIEW,
            )
            await memory.record_error(student_id, err)
        except Exception as exc:
            logger.warning("Memory write failed: %s", exc)

    return ApiResponse(data=_response_to_analyze(result).model_dump(by_alias=True, exclude_none=True))


# ---------------------------------------------------------------------------
# POST /api/sessions — multi-question session (线上试卷答题入口)
# ---------------------------------------------------------------------------

@router.post("/sessions", response_model=ApiResponse)
async def submit_session(
    body: SessionRequest,
    orch=Depends(get_orchestrator),
    memory=Depends(get_memory_retriever),
):
    results: list[SessionResultQuestion] = []

    error_history = None
    if memory is not None:
        try:
            error_history = await memory.get_error_history(body.student_id)
        except Exception as exc:
            logger.warning("Memory read failed for session %s: %s", body.session_id, exc)

    for q in body.questions:
        ctx = _question_to_context(q)
        prog = _question_to_progress(q)

        if q.result.status == SessionQuestionStatusEnum.CORRECT:
            if memory is not None:
                try:
                    await memory.record_mastery_event(
                        student_id=body.student_id,
                        question_id=q.id,
                        knowledge_node_id=q.knowledge_node_id or "",
                        is_correct=True,
                    )
                except Exception as exc:
                    logger.warning("Mastery record failed: %s", exc)

            results.append(SessionResultQuestion(
                question_id=q.id,
                status="correct",
            ))
            continue

        try:
            agent_response = await orch.handle(ctx, prog, error_history)
        except Exception as exc:
            logger.error(
                "Agent pipeline failed for question %s in session %s: %s",
                q.id, body.session_id, exc,
            )
            results.append(SessionResultQuestion(
                question_id=q.id,
                status="error",
            ))
            continue

        analyze = _response_to_analyze(agent_response)
        results.append(SessionResultQuestion(
            question_id=q.id,
            status=prog.status,
            diagnosis=analyze.diagnosis,
            framework=analyze.framework,
            hint=analyze.hint,
            counter_question=analyze.counter_question,
        ))

        if memory is not None and agent_response.diagnosis is not None and agent_response.diagnosis.error_type is not None:
            try:
                import uuid
                from core.types import ErrorRecord, ErrorStatus
                d = agent_response.diagnosis
                err = ErrorRecord(
                    id=str(uuid.uuid4()),
                    question_id=q.id,
                    subject=q.topic or body.subject,
                    error_type=d.error_type,
                    question_summary=q.content[:100] if q.content else "",
                    error_description=d.why_wrong,
                    related_topic=q.topic or body.subject,
                    knowledge_node_id=q.knowledge_node_id,
                    status=ErrorStatus.PENDING_REVIEW,
                )
                await memory.record_error(body.student_id, err)
            except Exception as exc:
                logger.warning("Memory write failed for question %s: %s", q.id, exc)

    return ApiResponse(data=SessionResponse(
        sessionId=body.session_id,
        session_id=body.session_id,
        questions=results,
    ).model_dump(by_alias=True))


# ---------------------------------------------------------------------------
# POST /api/agent/counter-reply-ext
# ---------------------------------------------------------------------------

@router.post("/agent/counter-reply-ext", response_model=ApiResponse)
async def counter_reply_ext(
    body: dict,
    orch=Depends(get_orchestrator),
    memory=Depends(get_memory_retriever),
):
    student_id = body.get("student_id", body.get("studentId", "default"))
    question_data = body.get("question", {})
    progress_data = body.get("progress", {})
    counter_reply = body.get("counter_reply", body.get("counterReply", ""))

    ctx = QuestionContext(
        id=question_data.get("id", ""),
        topic=question_data.get("topic", ""),
        type=_question_type_from_str(question_data.get("type", "calculation")),
        difficulty=question_data.get("difficulty", 3),
        content=question_data.get("content", ""),
        correct_answer=question_data.get("correct_answer", ""),
        accept_keywords=question_data.get("accept_keywords", question_data.get("acceptKeywords", [])),
        knowledge_node_id=question_data.get("knowledge_node_id", question_data.get("knowledgeNodeId")),
    )

    prog = StudentProgress(
        question_id=progress_data.get("question_id", progress_data.get("questionId", question_data.get("id", ""))),
        current_answer=progress_data.get("current_answer", progress_data.get("currentAnswer", "")),
        status=progress_data.get("status", "wrong"),
        hint_level=progress_data.get("hint_level", progress_data.get("hintLevel", 0)),
        solved_at_hint_level=progress_data.get("solved_at_hint_level", progress_data.get("solvedAtHintLevel")),
        attempts=progress_data.get("attempts", []),
    )

    error_history = None
    if memory is not None:
        try:
            error_history = await memory.get_error_history(student_id)
        except Exception:
            pass

    result = await orch.handle_counter_reply(ctx, prog, error_history, counter_reply)

    if memory is not None and result.diagnosis is not None and result.diagnosis.error_type is not None:
        try:
            import uuid
            from core.types import ErrorRecord, ErrorStatus
            d = result.diagnosis
            err = ErrorRecord(
                id=str(uuid.uuid4()),
                question_id=ctx.id,
                subject=ctx.topic,
                error_type=d.error_type,
                question_summary=ctx.content[:100] if ctx.content else "",
                error_description=d.why_wrong,
                related_topic=ctx.topic,
                knowledge_node_id=ctx.knowledge_node_id,
                status=ErrorStatus.PENDING_REVIEW,
            )
            await memory.record_error(student_id, err)
        except Exception:
            pass

    return ApiResponse(data=_response_to_analyze(result).model_dump(by_alias=True, exclude_none=True))
