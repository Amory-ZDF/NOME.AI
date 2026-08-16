"""Agent API router — HTTP interface to the orchestrator.

Endpoints:
    POST /api/agent/analyze       -> diagnosis -> framework -> hint for one question
    POST /api/agent/counter-reply -> respond to counter-question, re-diagnose
    POST /api/agent/chat          -> multi-question agent chat (full pipeline, reserved)

All endpoints use the global orchestrator singleton from app.main.
Response follows API_INTERFACE.md envelope: { code: 0, data: {...} }.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from app.models.domain import (
    AnalyzeRequest,
    ApiResponse,
    AnalyzeResponse,
    CounterReplyRequest,
    DiagnosisResponse,
    FrameworkResponse,
    GraphChatRequest,
    HintResponse,
    SessionRequest,
    SessionResponse,
    SessionResultQuestion,
    SessionQuestionStatusEnum,
    TutorChatRequest,
    TutorChatResponse,
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


def get_knowledge_graph():
    """Dependency — returns the global knowledge graph from app.main."""
    from app.main import knowledge_graph
    if knowledge_graph is None:
        raise HTTPException(status_code=503, detail="Knowledge graph not initialised")
    return knowledge_graph


def get_memory_retriever():
    """Dependency — returns the global memory retriever from app.main."""
    from app.main import memory_retriever
    return memory_retriever  # may be None


def get_profile_agent():
    """Dependency — returns the global profile agent from app.main."""
    from app.main import profile_agent, insight_store
    return profile_agent, insight_store  # either may be None


async def _record_event_and_refresh(
    *,
    student_id: str,
    event_type: str,
    question_id: str | None = None,
    knowledge_node_id: str | None = None,
    error_type: str | None = None,
    subject: str | None = None,
    payload: dict | None = None,
    profile_agent=None,
    insight_store=None,
) -> None:
    """Append a long-term-memory event and trigger a profile refresh.

    Best-effort: a profiling failure must never break the agent route.
    """
    import uuid
    from datetime import datetime, timezone

    if insight_store is not None:
        try:
            await insight_store.append_event(
                event_id=str(uuid.uuid4()),
                student_id=student_id,
                event_type=event_type,
                occurred_at=datetime.now(timezone.utc),
                question_id=question_id,
                knowledge_node_id=knowledge_node_id,
                error_type=error_type,
                subject=subject,
                payload=payload or {},
            )
        except Exception as exc:
            logger.warning("event append failed: %s", exc)

    if profile_agent is not None:
        try:
            await profile_agent.on_event(student_id)
        except Exception as exc:
            logger.warning("profile refresh failed: %s", exc)


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


def _pick(mapping: dict, *keys: str) -> object:
    """Return the first present, non-None value among `keys` (snake_case → camelCase).

    The frontend sends camelCase (API_INTERFACE.md). The session path uses
    snake_case Pydantic models. Both may appear depending on the caller, so we
    accept either — reading the first key that is present and not None.
    """
    for key in keys:
        if key in mapping and mapping[key] is not None:
            return mapping[key]
    return None


def _question_from_dict(q: dict) -> QuestionContext:
    """Convert a raw question dict (frontend shape) → QuestionContext.

    Frontend question carries the correct answer as `correctDisplay`
    (API_INTERFACE.md §2), NOT `correct_answer`/`correctAnswer` — so that is
    the first key probed for the mark scheme.
    """
    return QuestionContext(
        id=_pick(q, "id") or "",
        topic=_pick(q, "topic") or "",
        type=_question_type_from_str(_pick(q, "type") or "calculation"),
        difficulty=_pick(q, "difficulty") or 3,
        content=_pick(q, "content") or "",
        correct_answer=(
            _pick(q, "correct_display", "correctDisplay", "correct_answer", "correctAnswer")
            or ""
        ),
        accept_keywords=_pick(q, "accept_keywords", "acceptKeywords") or [],
        knowledge_node_id=_pick(q, "knowledge_node_id", "knowledgeNodeId"),
        mark_scheme=_pick(q, "mark_scheme", "markScheme"),
        image_description=_pick(q, "image_description", "imageDescription"),
        options=_pick(q, "options"),
        correct_index=_pick(q, "correct_index", "correctIndex"),
    )


def _progress_from_dict(p: dict, question_id: str) -> StudentProgress:
    """Convert a raw progress dict (frontend shape) → StudentProgress.

    The exercise engine stores the student's answer under `answer` and the
    attempts as camelCase `{answer, submittedAt, isCorrect}`. There is no
    `currentAnswer`/`current_answer` — the last attempt's answer is the
    authoritative current answer, so we fall back to it.
    """
    attempts_raw = _pick(p, "attempts") or []
    normalized_attempts: list[dict] = []
    last_answer = ""
    for attempt in attempts_raw:
        answer = _pick(attempt, "answer") or ""
        last_answer = answer
        normalized_attempts.append({
            "answer": answer,
            "submitted_at": _pick(attempt, "submitted_at", "submittedAt"),
            "is_correct": _pick(attempt, "is_correct", "isCorrect"),
        })

    return StudentProgress(
        question_id=_pick(p, "question_id", "questionId") or question_id,
        current_answer=(
            _pick(p, "current_answer", "currentAnswer", "answer") or last_answer
        ),
        status=_pick(p, "status") or "wrong",
        hint_level=_pick(p, "hint_level", "hintLevel", "hints_used", "hintsUsed") or 0,
        solved_at_hint_level=_pick(p, "solved_at_hint_level", "solvedAtHintLevel"),
        attempts=normalized_attempts,
    )


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
        options=q.options,
        correct_index=q.correct_index,
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
            is_correct=ar.diagnosis.is_correct,
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
        is_correct=ar.is_correct if ar.is_correct is not None else (diag.is_correct if diag else None),
        diagnosis=diag,
        framework=fw,
        hint=hint,
        counter_question=ar.counter_question,
    )


# ---------------------------------------------------------------------------
# GET /api/agent/similar-nodes — related nodes for a knowledge-graph node
# ---------------------------------------------------------------------------

@router.get("/agent/similar-nodes", response_model=ApiResponse)
async def similar_nodes(
    node_id: str = Query(..., min_length=1),
    graph=Depends(get_knowledge_graph),
):
    """Return nodes related to `node_id` for similar-question retrieval.

    Groups the deterministic graph traversal results by relationship:
        contrasted  — CONTRASTED_WITH (commonly-confused concepts)
        siblings    — same-topic-chapter concepts (BELONGS_TO)
        children    — downstream nodes that depend on this node
    """
    def _node(n: dict) -> dict:
        return {"id": n.get("id", ""), "name": n.get("name", ""), "type": n.get("type", "")}

    contrasted = [_node(n) for n in graph.get_related(node_id)]
    siblings = [_node(n) for n in graph.get_siblings(node_id)]
    children = [_node(n) for n in graph.get_children(node_id)]

    return ApiResponse(data={
        "node_id": node_id,
        "contrasted": contrasted,
        "siblings": siblings,
        "children": children,
    })


# ---------------------------------------------------------------------------
# POST /api/agent/analyze — single question full pipeline
# ---------------------------------------------------------------------------
@router.post("/agent/analyze", response_model=ApiResponse)
async def full_analysis(
    body: AnalyzeRequest,
    orch=Depends(get_orchestrator),
    memory=Depends(get_memory_retriever),
    profile=Depends(get_profile_agent),
):
    question = body.question
    progress = body.progress
    student_id = body.student_id
    profile_agent, insight_store = profile

    ctx = _question_from_dict(question)
    prog = _progress_from_dict(progress, ctx.id)

    error_history = None
    if memory is not None:
        try:
            error_history = await memory.get_error_history(student_id)
        except Exception as exc:
            logger.warning("Memory read failed: %s", exc)

    result = await orch.handle(student_id, ctx, prog, error_history)

    if memory is not None:
        if result.is_correct is True:
            try:
                await memory.record_mastery_event(
                    student_id=student_id,
                    question_id=ctx.id,
                    knowledge_node_id=ctx.knowledge_node_id or "",
                    is_correct=True,
                )
            except Exception as exc:
                logger.warning("Mastery record failed: %s", exc)
        elif result.diagnosis is not None and result.diagnosis.error_type is not None:
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

    # Long-term memory: event + profile refresh (best-effort).
    if result.is_correct is True:
        await _record_event_and_refresh(
            student_id=student_id,
            event_type="mastery",
            question_id=ctx.id,
            knowledge_node_id=ctx.knowledge_node_id,
            subject=ctx.topic,
            payload={"is_correct": True},
            profile_agent=profile_agent,
            insight_store=insight_store,
        )
    elif result.diagnosis is not None and result.diagnosis.error_type is not None:
        await _record_event_and_refresh(
            student_id=student_id,
            event_type="error",
            question_id=ctx.id,
            knowledge_node_id=ctx.knowledge_node_id,
            error_type=result.diagnosis.error_type.value,
            subject=ctx.topic,
            payload={"is_correct": False},
            profile_agent=profile_agent,
            insight_store=insight_store,
        )

    return ApiResponse(data=_response_to_analyze(result).model_dump(by_alias=True, exclude_none=True))


# ---------------------------------------------------------------------------
# POST /api/agent/hint — generate the next progressive hint layer
# ---------------------------------------------------------------------------
# Independent of diagnosis: the frontend calls this when the student unlocks a
# hint level. It generates ONLY the hint for progress.hint_level + 1, so the
# student gets a per-layer, progress-appropriate nudge without re-running the
# full diagnosis pipeline.

@router.post("/agent/hint", response_model=ApiResponse)
async def agent_hint(
    body: AnalyzeRequest,
    orch=Depends(get_orchestrator),
):
    ctx = _question_from_dict(body.question)
    prog = _progress_from_dict(body.progress, ctx.id)
    hint = await orch.generate_hint(ctx, prog)
    return ApiResponse(data=_response_to_analyze(
        # Wrap the bare hint in the AnalyzeResponse shape the frontend already
        # parses (data.hint). The frontend reads only data.hint for unlock.
        AgentResponse(hint=hint)
    ).model_dump(by_alias=True, exclude_none=True))


# ---------------------------------------------------------------------------
# POST /api/agent/diagnose — one-shot diagnosis at question "settlement"
# ---------------------------------------------------------------------------
# Runs the full diagnosis -> framework -> hint pipeline ONCE, when a question's
# outcome is settled: solved-with-hints, or still-wrong at submit. The result
# feeds the error book. The counter-question is deliberately dropped here — the
# student is not interrupted mid-flow; where_wrong/why_wrong fall back.

@router.post("/agent/diagnose", response_model=ApiResponse)
async def agent_diagnose(
    body: AnalyzeRequest,
    orch=Depends(get_orchestrator),
    memory=Depends(get_memory_retriever),
    profile=Depends(get_profile_agent),
):
    question = body.question
    progress = body.progress
    student_id = body.student_id
    profile_agent, insight_store = profile

    ctx = _question_from_dict(question)
    prog = _progress_from_dict(progress, ctx.id)

    # Assisted solves (correct only after hints) arrive with status="correct" and
    # a correct current_answer. The orchestrator would short-circuit and return no
    # diagnosis. To surface the error, diagnose the last WRONG attempt instead —
    # the attempts history carries it, and error_diagnosis reads it as the answer.
    if prog.status == "correct" and prog.hint_level > 0:
        wrong_attempts = [a for a in prog.attempts if a.get("is_correct") is False]
        if wrong_attempts:
            last_wrong = wrong_attempts[-1]
            prog.status = "wrong"
            prog.current_answer = last_wrong.get("answer", "") or prog.current_answer

    error_history = None
    if memory is not None:
        try:
            error_history = await memory.get_error_history(student_id)
        except Exception as exc:
            logger.warning("Memory read failed: %s", exc)

    result = await orch.handle(student_id, ctx, prog, error_history)

    # Long-term memory: append the error event + profile refresh (best-effort).
    if result.diagnosis is not None and result.diagnosis.error_type is not None:
        if memory is not None:
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
        await _record_event_and_refresh(
            student_id=student_id,
            event_type="error",
            question_id=ctx.id,
            knowledge_node_id=ctx.knowledge_node_id,
            error_type=result.diagnosis.error_type.value,
            subject=ctx.topic,
            payload={"is_correct": False},
            profile_agent=profile_agent,
            insight_store=insight_store,
        )

    return ApiResponse(data=_response_to_analyze(result).model_dump(by_alias=True, exclude_none=True))


# ---------------------------------------------------------------------------
# POST /api/agent/chat — multi-question agent chat (reserved; single-question
# diagnosis/counter-reply above is the active path)
# ---------------------------------------------------------------------------

@router.post("/agent/chat", response_model=ApiResponse)
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
            agent_response = await orch.handle(body.student_id, ctx, prog, error_history)
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
    profile=Depends(get_profile_agent),
):
    student_id = body.get("student_id", body.get("studentId", "default"))
    question_data = body.get("question", {})
    progress_data = body.get("progress", {})
    counter_reply = body.get("counter_reply", body.get("counterReply", ""))
    profile_agent, insight_store = profile

    ctx = _question_from_dict(question_data)
    prog = _progress_from_dict(progress_data, ctx.id)

    error_history = None
    if memory is not None:
        try:
            error_history = await memory.get_error_history(student_id)
        except Exception:
            pass

    result = await orch.handle_counter_reply(student_id, ctx, prog, error_history, counter_reply)

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

    # Long-term memory: event + profile refresh (best-effort).
    if result.diagnosis is not None and result.diagnosis.error_type is not None:
        await _record_event_and_refresh(
            student_id=student_id,
            event_type="error",
            question_id=ctx.id,
            knowledge_node_id=ctx.knowledge_node_id,
            error_type=result.diagnosis.error_type.value,
            subject=ctx.topic,
            payload={"is_correct": False},
            profile_agent=profile_agent,
            insight_store=insight_store,
        )

    return ApiResponse(data=_response_to_analyze(result).model_dump(by_alias=True, exclude_none=True))


# ---------------------------------------------------------------------------
# POST /api/agent/tutor-chat — student-initiated chat (explain / general Q&A)
# ---------------------------------------------------------------------------

def _build_tutor_chat_system() -> str:
    return (
        "你是学生的 AI 私教。原则：先引导思考，不直接给答案；"
        "讲解要针对学生可能卡住的地方；语气耐心、不评判。"
    )


def _build_tutor_chat_messages(body: TutorChatRequest, error_history) -> list[dict]:
    messages: list[dict] = []
    # Carry prior turns verbatim (role/content only) for context.
    for turn in body.history[-10:]:
        role = turn.get("role")
        content = turn.get("content")
        if role in ("user", "assistant") and isinstance(content, str) and content:
            messages.append({"role": role, "content": content})

    if body.question:
        # "讲解这道题" mode — the question context is the anchor.
        q = body.question
        q_block = (
            f"题目：{q.get('content', '')}\n"
            f"类型：{q.get('type', '')}，学科：{q.get('topic', '')}\n"
            f"知识点节点：{q.get('knowledgeNodeId', q.get('knowledge_node_id', '')) or '无'}"
        )
        # The student's answer + the AI's diagnosis give the tutor context to
        # answer questions like "why isn't C correct?" — without them it can
        # only restate the question.
        student_answer = q.get("studentAnswer", "")
        if student_answer:
            q_block += f"\n学生答案：{student_answer}"
        diag = q.get("diagnosis")
        if isinstance(diag, dict):
            parts = []
            error_type = diag.get("errorType", diag.get("error_type"))
            if error_type:
                parts.append(f"错因类型：{error_type}")
            why_wrong = diag.get("whyWrong", diag.get("why_wrong"))
            if why_wrong:
                parts.append(f"AI 判断：{why_wrong}")
            if parts:
                q_block += "\n" + "\n".join(parts)
        if error_history:
            q_block += "\n该生历史错因：" + "、".join(
                f"{e.error_type.value if e.error_type else '?'}" for e in error_history[:5]
            )
        messages.append({
            "role": "user",
            "content": f"针对下面这道题，学生问：{body.message}\n\n{q_block}",
        })
    else:
        # General Q&A mode — free question, possibly a pasted question.
        messages.append({"role": "user", "content": body.message})

    return messages


@router.post("/agent/tutor-chat", response_model=ApiResponse)
async def tutor_chat(
    body: TutorChatRequest,
    orch=Depends(get_orchestrator),
    memory=Depends(get_memory_retriever),
    profile=Depends(get_profile_agent),
):
    student_id = body.student_id
    profile_agent, insight_store = profile

    error_history = None
    if memory is not None:
        try:
            error_history = await memory.get_error_history(student_id)
        except Exception:
            pass

    messages = _build_tutor_chat_messages(body, error_history)
    content, _ = await orch.client.chat(
        orch.provider,
        system=_build_tutor_chat_system(),
        messages=messages,
        temperature=0.5,
    )

    # Long-term memory: a chat turn is a signal of engagement (best-effort).
    await _record_event_and_refresh(
        student_id=student_id,
        event_type="chat_question",
        question_id=body.question.get("id") if body.question else None,
        payload={"message": body.message[:200]},
        profile_agent=profile_agent,
        insight_store=insight_store,
    )

    return ApiResponse(data=TutorChatResponse(reply=content).model_dump(by_alias=True))


# ---------------------------------------------------------------------------
# GET /api/agent/graph-data — full graph for the interactive demo page
# ---------------------------------------------------------------------------

@router.get("/agent/graph-data", response_model=ApiResponse)
async def graph_data(
    graph=Depends(get_knowledge_graph),
):
    nodes = graph.list_nodes()
    edges = graph.list_edges()
    return ApiResponse(data={"nodes": nodes, "edges": edges})


# ---------------------------------------------------------------------------
# POST /api/agent/graph-chat — graph-grounded Q&A for the knowledge-graph demo
# ---------------------------------------------------------------------------
# Answers student questions about concept relationships and root causes USING the
# knowledge graph (nodes, edges, prerequisite chains, weak links). The LLM writes
# the narrative; the graph supplies the facts it must not invent.

def _node_for_context(node: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": node.get("id", ""),
        "name": node.get("name", ""),
        "type": node.get("type", ""),
    }


def _match_nodes_from_message(message: str, graph, limit: int = 5) -> list[str]:
    """Fuzzy-match node ids by lowercase token/name containment."""
    lowered = message.lower()
    matches: list[tuple[int, str]] = []
    for node in graph.list_nodes():
        nid = node.get("id", "")
        name = str(node.get("name", "") or "")
        if not nid:
            continue
        if lowered in nid.lower() or (name and lowered in name.lower()):
            matches.append((len(nid) + len(name), nid))
        elif name:
            for token in name.lower().split():
                if len(token) >= 3 and token in lowered:
                    matches.append((len(nid) + len(name), nid))
                    break
    matches.sort(key=lambda item: item[0])
    return [nid for _, nid in matches[:limit]]


async def _build_graph_context(
    graph,
    memory,
    student_id: str,
    node_ids: list[str],
) -> dict[str, Any]:
    """Collect per-node facts + relationships + weak links for the LLM."""
    node_ids = [nid for nid in node_ids if graph.get_node(nid)]
    context_nodes: list[dict[str, Any]] = []
    relationships: list[dict[str, Any]] = []
    weak_links: list[dict[str, Any]] = []
    seen_pairs: set[tuple[str, str]] = set()

    node_states: dict[str, float] = {}
    if memory is not None and node_ids:
        try:
            node_states = await memory.get_node_states(student_id, node_ids)
        except Exception as exc:
            logger.warning("graph-chat node_states failed: %s", exc)

    for nid in node_ids:
        node = graph.get_node(nid)
        if node:
            context_nodes.append(_node_for_context(node))

        # Prerequisite chain (upstream) — root cause / "what to review first".
        chain = graph.get_prerequisite_chain(nid)
        if chain:
            relationships.append({
                "node": nid,
                "kind": "prerequisite_chain",
                "items": [
                    {**_node_for_context(n), "depth": n.get("depth", 1)}
                    for n in chain
                ],
            })

        # Immediate relationships with other context nodes.
        related = graph.get_related(nid)
        siblings = graph.get_siblings(nid)
        children = graph.get_children(nid)
        for group, rel_name in (
            (related, "contrasted_with"),
            (siblings, "sibling_of"),
            (children, "child_of"),
        ):
            for other in group:
                other_id = other.get("id", "")
                if not other_id:
                    continue
                pair = tuple(sorted((nid, other_id)))
                if pair in seen_pairs:
                    continue
                seen_pairs.add(pair)
                relationships.append({
                    "node": nid,
                    "other": other_id,
                    "other_name": other.get("name", other_id),
                    "kind": rel_name,
                })

        if node_states:
            for weak in graph.find_weak_links(nid, node_states, threshold=0.6):
                weak_links.append({
                    "node": nid,
                    "weak_prerequisite": weak,
                })

    return {
        "nodes": context_nodes,
        "relationships": relationships,
        "weak_links": weak_links,
    }


def _build_graph_chat_system() -> str:
    return (
        "你是基于知识图谱的 AI 辅导助手。学生问的是概念关系、根因定位、复习顺序这类问题。\n"
        "你必须只依据提供的图谱 JSON 数据回答：节点、边、前置链、弱链。\n"
        "规则：\n"
        "1. 图谱里没有的关系，明说『图谱中没有记录』，不要编造。\n"
        "2. 提到前置/根因时，明确引用图谱里的节点 id 和名称。\n"
        "3. 回答结构：先直接回答，再给出图谱依据（关系/前置链/弱链），最后如涉及薄弱点给『建议先复习』。\n"
        "4. 语言与学生问题一致（中文问中文答）。"
    )


@router.post("/agent/graph-chat", response_model=ApiResponse)
async def graph_chat(
    body: GraphChatRequest,
    orch=Depends(get_orchestrator),
    graph=Depends(get_knowledge_graph),
    memory=Depends(get_memory_retriever),
):
    node_ids = list(body.graph_node_ids)
    if not node_ids:
        node_ids = _match_nodes_from_message(body.message, graph)

    context = await _build_graph_context(graph, memory, body.student_id, node_ids)

    user_payload = {
        "student_question": body.message,
        "graph_context": context,
    }
    import json
    content, _ = await orch.client.chat(
        orch.provider,
        system=_build_graph_chat_system(),
        messages=[{"role": "user", "content": json.dumps(user_payload, ensure_ascii=False, indent=2)}],
        temperature=0.3,
    )

    return ApiResponse(data=TutorChatResponse(reply=content).model_dump(by_alias=True))
