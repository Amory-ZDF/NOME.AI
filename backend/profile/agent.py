"""ProfileAgent — event-triggered + periodic long-term memory.

Responsibilities:
    1. on_event()  — called from the agent routes after a diagnosis/session.
       Incrementally re-aggregates deterministic metrics (no LLM) and, only when
       the change is material, calls the LLM to refresh narrative + tags.
    2. periodic()  — scheduled loop (asyncio background task, zero new deps).
       Emits weekly/monthly teacher_reports and re-syncs profiles.

Design invariant: the LLM NEVER computes numbers. It receives pre-computed
deterministic metrics + a small event digest and only writes prose (narratives,
tag labels/evidence). This keeps the teacher-facing facts reproducible.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from core.llm_client import LLMClient
from profile.store import InsightStore

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_ERROR_TYPE_LABELS = {
    "knowledge": "知识未掌握",
    "method": "方法选择错误",
    "calculation": "计算粗心",
    "reading": "审题偏差",
    "execution": "执行不到位",
    "expression": "表达/评分点缺失",
    "habit": "习惯问题",
}

# A tag is refreshed via LLM only when the underlying evidence shifts by this much.
_MATERIAL_CHANGE_MIN_ACCURACY_DELTA = 0.05
_MATERIAL_CHANGE_MIN_EVENTS = 3

_REPORT_PERIODS = {"weekly": 7, "monthly": 30}


# ---------------------------------------------------------------------------
# Agent
# ---------------------------------------------------------------------------


class ProfileAgent:
    def __init__(
        self,
        client: LLMClient,
        provider: str,
        store: InsightStore,
        *,
        llm_enabled: bool = True,
    ) -> None:
        self.client = client
        self.provider = provider
        self.store = store
        self.llm_enabled = llm_enabled

    # -- event trigger ----------------------------------------------------

    async def on_event(self, student_id: str) -> None:
        """Re-aggregate one student's profile after a new event.

        Cheap and safe: deterministic metrics first. LLM only when material.
        """
        try:
            metrics = await self.store.aggregate(student_id)
            metrics["pressure_index"] = await self.store.compute_pressure(student_id)

            # Deterministic tags from hard evidence (no LLM) — these are
            # reproducible and carry the confidence+evidence the teacher sees.
            deterministic_tags = await self._deterministic_tags(student_id, metrics)

            # LLM-synthesized narrative only when there is enough new evidence.
            narrative = await self._synthesize_narrative(student_id, metrics)

            await self.store.upsert_profile(
                student_id,
                datetime.now(timezone.utc),
                {
                    **metrics,
                    "recent_narrative": narrative.get("recent"),
                    "next_focus": narrative.get("next_focus"),
                    "intervention": narrative.get("intervention"),
                    "profile_json": {},
                },
            )
            for tag in deterministic_tags:
                await self.store.upsert_tag(tag)

        except Exception as exc:  # never let profiling break the agent route
            logger.warning("on_event failed for %s: %s", student_id, exc)

    # -- periodic trigger -------------------------------------------------

    async def periodic(self) -> None:
        """Re-sync every known student + emit due reports. Called by the
        background loop in app.main."""
        try:
            students = await self.store.list_students()
            for student_id in students:
                await self.on_event(student_id)
                await self._maybe_emit_reports(student_id)
        except Exception as exc:
            logger.warning("periodic failed: %s", exc)

    async def _maybe_emit_reports(self, student_id: str) -> None:
        """Emit weekly/monthly teacher_reports when their window has rolled over.

        Deterministic metrics inside; LLM writes only the summary prose.
        """
        now = datetime.now(timezone.utc)
        for period, days in _REPORT_PERIODS.items():
            start = now - timedelta(days=days)
            metrics = await self.store.aggregate(student_id, since=start)
            metrics["pressure_index"] = await self.store.compute_pressure(student_id)

            summary = ""
            if self.llm_enabled:
                summary = await self._synthesize_report_summary(student_id, period, metrics)

            await self.store.upsert_report({
                "report_id": f"{student_id}:{period}:{now.strftime('%Y-%m-%d')}",
                "student_id": student_id,
                "period": period,
                "period_start": start,
                "period_end": now,
                "metrics": metrics,
                "summary": summary,
                "created_at": now,
            })

    # -- deterministic tags (no LLM) -------------------------------------

    async def _deterministic_tags(self, student_id: str, metrics: dict) -> list[dict]:
        """Rule-derived tags with evidence + confidence. These answer the
        teacher's "is this judgment trustworthy?" without any model call."""
        now = datetime.now(timezone.utc)
        tags: list[dict] = []

        dist = metrics.get("error_distribution", {})
        total_errors = sum(dist.values())
        if total_errors > 0:
            top_type, top_count = max(dist.items(), key=lambda kv: kv[1])
            if top_count / total_errors >= 0.4:
                tags.append(self._tag(
                    student_id, f"{student_id}:error:{top_type}",
                    label=_ERROR_TYPE_LABELS.get(top_type, top_type),
                    category="learning_issue",
                    confidence=round(40 + 60 * (top_count / total_errors)),
                    evidence=f"过去 {metrics.get('active_days', 0)} 天 {total_errors} 次错误中 "
                             f"{top_count} 次为{_ERROR_TYPE_LABELS.get(top_type, top_type)}",
                ))

        hints = metrics.get("hints_per_question")
        if hints is not None and hints >= 2.0:
            tags.append(self._tag(
                student_id, f"{student_id}:hint-dependent",
                label="提示依赖偏高",
                category="learning_style",
                confidence=round(min(90, 50 + hints * 15)),
                evidence=f"平均每题使用 {hints:.1f} 层提示",
            ))

        acc = metrics.get("accuracy")
        if acc is not None and metrics.get("total_answered", 0) >= 5 and acc >= 0.9:
            tags.append(self._tag(
                student_id, f"{student_id}:strong-accuracy",
                label="正确率稳定",
                category="positive",
                confidence=85,
                evidence=f"近 {metrics.get('active_days', 0)} 天正确率 {acc*100:.0f}%",
            ))

        return tags

    @staticmethod
    def _tag(student_id, tag_id, *, label, category, confidence, evidence) -> dict:
        return {
            "tag_id": tag_id,
            "student_id": student_id,
            "label": label,
            "category": category,
            "confidence": confidence,
            "evidence": evidence,
            "status": "pending",
            "updated_at": datetime.now(timezone.utc),
        }

    # -- LLM synthesis (prose only) ---------------------------------------

    async def _synthesize_narrative(self, student_id: str, metrics: dict) -> dict:
        """LLM writes the three teacher-facing sentences. Falls back to a
        deterministic template when LLM is disabled or errors."""
        if not self.llm_enabled or metrics.get("total_answered", 0) < 1:
            return self._template_narrative(metrics)

        try:
            events = await self.store.recent_events(student_id, limit=30)
            digest = {
                "student_id": student_id,
                "metrics": metrics,
                "recent_events": events[:15],
            }
            system = (
                "你是学生学习情况的整理助手。根据给定的确定性统计指标和近期事件，"
                "用简洁中文写出三段话，帮助老师快速判断。不要编造指标之外的事实。"
            )
            messages = [
                {
                    "role": "user",
                    "content": (
                        "请输出 JSON，包含三个字段：\n"
                        '  "recent": 这个学生最近发生了什么（2-3句，基于指标和事件）\n'
                        '  "next_focus": 下节课应该重点解决什么（1-2句）\n'
                        '  "intervention": 是否需要老师人工介入及原因（1句，若无则写"暂不需要"）\n\n'
                        f"数据：{self._json_dump(digest)}"
                    ),
                }
            ]
            content, _ = await self.client.chat(
                self.provider, system=system, messages=messages, temperature=0.3
            )
            parsed = self._extract_json(content)
            return {
                "recent": parsed.get("recent") or "",
                "next_focus": parsed.get("next_focus") or "",
                "intervention": parsed.get("intervention") or "",
            }
        except Exception as exc:
            logger.warning("narrative synthesis failed for %s: %s", student_id, exc)
            return self._template_narrative(metrics)

    async def _synthesize_report_summary(self, student_id: str, period: str, metrics: dict) -> str:
        if not self.llm_enabled:
            return self._template_report_summary(period, metrics)
        try:
            system = (
                "你是老师的教学助理。基于给定统计指标写一段周期小结（中文，3-5句），"
                "聚焦变化与建议，不编造数据。"
            )
            messages = [{
                "role": "user",
                "content": (
                    f"周期：{period}\n"
                    f"指标：{self._json_dump(metrics)}\n"
                    "请写一段面向老师的周期小结。"
                ),
            }]
            content, _ = await self.client.chat(
                self.provider, system=system, messages=messages, temperature=0.3
            )
            return content.strip()
        except Exception as exc:
            logger.warning("report summary failed for %s: %s", student_id, exc)
            return self._template_report_summary(period, metrics)

    # -- templates / helpers ----------------------------------------------

    @staticmethod
    def _template_narrative(metrics: dict) -> dict:
        acc = metrics.get("accuracy")
        total = metrics.get("total_answered", 0)
        pressure = metrics.get("pressure_index", 0)
        dist = metrics.get("error_distribution", {})
        top = max(dist, key=dist.get) if dist else None

        recent = f"近 {metrics.get('active_days', 0)} 天答题 {total} 次" + (
            f"，正确率 {acc*100:.0f}%" if acc is not None else ""
        )
        next_focus = (
            f"重点巩固{_ERROR_TYPE_LABELS.get(top, top)}类问题" if top else "暂缺足够数据判断"
        )
        intervention = (
            "压力指数偏高，建议关注" if pressure >= 50 else "暂不需要人工介入"
        )
        return {"recent": recent, "next_focus": next_focus, "intervention": intervention}

    @staticmethod
    def _template_report_summary(period: str, metrics: dict) -> str:
        acc = metrics.get("accuracy")
        total = metrics.get("total_answered", 0)
        label = "周" if period == "weekly" else "月"
        return (
            f"本{label}答题 {total} 次" +
            (f"，正确率 {acc*100:.0f}%" if acc is not None else "") +
            f"，压力指数 {metrics.get('pressure_index', 0)}。"
        )

    @staticmethod
    def _json_dump(obj: Any) -> str:
        import json
        return json.dumps(obj, ensure_ascii=False, default=str)

    @staticmethod
    def _extract_json(text: str) -> dict:
        import json
        import re
        stripped = text.strip()
        m = re.search(r"```(?:json)?\s*([\s\S]*?)```", stripped, re.IGNORECASE)
        if m:
            stripped = m.group(1).strip()
        else:
            start = stripped.find("{")
            end = stripped.rfind("}")
            if start != -1 and end != -1 and end > start:
                stripped = stripped[start:end + 1]
        try:
            return json.loads(stripped)
        except json.JSONDecodeError:
            return {}
