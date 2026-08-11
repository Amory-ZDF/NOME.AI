"""Planner — LLM decides which skills to invoke for a given learning context.

This is the "intelligence" layer: instead of hard-coding if-then rules,
we ask the LLM to examine the student's current state and produce an
execution plan consisting of one or more skill invocations.

Input:
    - question: QuestionContext
    - progress: StudentProgress
    - error_history: list[ErrorRecord] (for recurrence detection)

Output:
    - ExecutionPlan: ordered list of Steps with reasoning
"""

from __future__ import annotations

import json
import logging

from core.types import (
    ExecutionPlan,
    QuestionContext,
    StudentProgress,
    ErrorRecord,
    Step,
)
from core.llm_client import LLMClient

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Planner system prompt — the LLM's planning instructions
# ---------------------------------------------------------------------------

PLANNER_SYSTEM_PROMPT = """You are a learning strategy planner for a Physics A-Level tutoring system.

You have access to three skills:
1. **progressive_hint** — Generates layered hints (L1 clarify → L2 knowledge → L3 method → L4 key step → L5 full solution → L6 variant). Use when the student is stuck or answered incorrectly and needs guidance.
2. **error_diagnosis** — Diagnoses why the student made a mistake (knowledge gap, method error, calculation slip, etc.). Use when the student answered incorrectly and the error type is unclear, or when hint level >= 3.
3. **knowledge_framework** — Traverses the knowledge graph to find weak prerequisite nodes and builds an evidence-chain explanation. Use when the error may stem from earlier knowledge gaps, or when the student has repeated errors in the same topic area.

## Planning Rules

Analyze the student's state and output an execution plan:

- **hint_level 1-2 + first attempt wrong**: Plan = [progressive_hint]
  - Student needs light guidance, no deep diagnosis yet.

- **hint_level 3-4 + still wrong**: Plan = [error_diagnosis, progressive_hint]
  - Diagnose first so the hint addresses the specific error type.

- **hint_level 5 + recurrence (repeat_count >= 2)**: Plan = [error_diagnosis, knowledge_framework, progressive_hint]
  - Deep diagnosis → trace weak foundations → targeted variant.

- **Student answered correctly**: Plan = [knowledge_framework]
  - Consolidation: check for hidden weak links even when answer is correct.

- **Uncertain**: Default to [progressive_hint] and set reasoning to explain uncertainty.

## Output Format

Output ONLY a JSON object:
{
  "steps": [
    {"skill": "progressive_hint", "provider": "<provider>", "model": "<model>", "reason": "<why this step>"}
  ],
  "reasoning": "<brief explanation of the plan>"
}

Available providers: deepseek, qwen
Use the provider specified in the input. Use the model that matches the provider.
"""


class Planner:
    """LLM-driven execution planner."""

    def __init__(self, client: LLMClient, provider: str = "deepseek") -> None:
        self.client = client
        self.provider = provider

    async def plan(
        self,
        question: QuestionContext,
        progress: StudentProgress,
        error_history: list[ErrorRecord] | None = None,
    ) -> ExecutionPlan:
        """Given student state, return an ordered execution plan.

        The plan may include 1-3 steps depending on context:
            - hint_level 1-2 + no recurrence → [ProgressiveHint]
            - hint_level 3-4               → [ErrorDiagnosis → ProgressiveHint]
            - hint_level 5 + recurrence     → [ErrorDiagnosis → KnowledgeFramework → ProgressiveHint]
            - student answered correctly    → [KnowledgeFramework] (consolidation)
        """
        # Build a lightweight message describing the current state
        state = {
            "question": {
                "id": question.id,
                "topic": question.topic,
                "type": question.type.value,
                "difficulty": question.difficulty,
                "knowledge_node_id": question.knowledge_node_id,
            },
            "student": {
                "status": progress.status,
                "hint_level": progress.hint_level,
                "attempt_count": len(progress.attempts),
            },
            "error_history": (
                [
                    {
                        "id": e.id,
                        "error_type": e.error_type.value,
                        "related_topic": e.related_topic,
                        "repeat_count": e.repeat_count,
                        "knowledge_node_id": e.knowledge_node_id,
                    }
                    for e in error_history
                ]
                if error_history
                else []
            ),
        }

        user_message = json.dumps(state, ensure_ascii=False, indent=2)

        try:
            content, _ = await self.client.chat(
                self.provider,
                system=PLANNER_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_message}],
                temperature=0.2,
                max_tokens=512,
            )

            plan = self._parse_plan(content)
            logger.debug("Plan parsed: %d steps — %s", len(plan.steps), plan.reasoning)
            return plan

        except Exception as exc:
            logger.warning("Planner failed, falling back to default: %s", exc)
            return self._default_plan(progress)

    # ---- Internal ------------------------------------------------------------

    @staticmethod
    def _parse_plan(raw: str) -> ExecutionPlan:
        """Parse the LLM's JSON plan. Falls back to default on parse error."""
        import re

        # Strip markdown code fences if present
        fence_pattern = re.compile(r"```(?:json)?\s*([\s\S]*?)```", re.IGNORECASE)
        m = fence_pattern.search(raw)
        json_str = m.group(1).strip() if m else raw.strip()

        try:
            data = json.loads(json_str)
        except json.JSONDecodeError:
            raise ValueError(f"Planner returned invalid JSON: {raw[:200]}")

        steps = [
            Step(
                skill=s["skill"],
                provider=s.get("provider", "deepseek"),
                model=s.get("model", ""),
                reason=s.get("reason", ""),
            )
            for s in data.get("steps", [])
        ]
        reasoning = data.get("reasoning", "")

        if not steps:
            raise ValueError("Planner returned empty steps list")

        return ExecutionPlan(steps=steps, reasoning=reasoning)

    @staticmethod
    def _default_plan(progress: StudentProgress) -> ExecutionPlan:
        """Safe fallback when the planner LLM is unavailable.

        Simple rule-based logic identical to the LLM prompt's decision tree.
        """
        if progress.status == "correct":
            steps = [
                Step(
                    skill="knowledge_framework",
                    provider="deepseek",
                    model="",
                    reason="Student answered correctly; check for hidden weak links",
                )
            ]
            reasoning = "Default: consolidation after correct answer"
        elif progress.hint_level >= 3:
            steps = [
                Step(
                    skill="error_diagnosis",
                    provider="deepseek",
                    model="",
                    reason="Student stuck at hint level >= 3; diagnose error type",
                ),
                Step(
                    skill="progressive_hint",
                    provider="deepseek",
                    model="",
                    reason="Generate hint informed by diagnosis",
                ),
            ]
            reasoning = "Default: diagnosis + hint for high hint level"
        else:
            steps = [
                Step(
                    skill="progressive_hint",
                    provider="deepseek",
                    model="",
                    reason="Student stuck at low hint level; provide next layer of guidance",
                )
            ]
            reasoning = "Default: progressive hint for initial difficulty"

        return ExecutionPlan(steps=steps, reasoning=reasoning)
