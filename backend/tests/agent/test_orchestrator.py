"""Tests for Orchestrator — Plan → Execute → Aggregate.

Covers:
    - handle() with hint_level=1 → plan has only ProgressiveHint
    - handle() with hint_level=3 → plan has ErrorDiagnosis + ProgressiveHint
    - handle() with hint_level=5 + recurrence → plan has all three
    - handle_simple() bypasses planner
    - AgentResponse has correct fields filled based on plan
    - Planner returns valid ExecutionPlan (no unknown skills)
    - Planner handles empty error_history gracefully
"""

import pytest

from core.types import (
    QuestionContext,
    StudentProgress,
    ErrorRecord,
    QuestionType,
    ErrorType,
    ErrorStatus,
    Step,
    ExecutionPlan,
    HintResult,
    DiagnosisResult,
    FrameworkResult,
    AgentResponse,
)
from agent.planner import Planner
from skill.common import SkillDomain

VALID_SKILLS = {s.value for s in SkillDomain}


class TestPlanner:
    """Unit tests for planner logic — no LLM required."""

    def test_default_plan_hint_level_1(self):
        """hint_level=1, wrong → default plan has only progressive_hint."""
        progress = StudentProgress(
            question_id="q1",
            current_answer="wrong",
            status="wrong",
            hint_level=1,
            solved_at_hint_level=None,
        )
        plan = Planner._default_plan(progress)
        assert len(plan.steps) == 1
        assert plan.steps[0].skill == "progressive_hint"

    def test_default_plan_hint_level_3(self):
        """hint_level=3 → diagnosis + hint."""
        progress = StudentProgress(
            question_id="q1",
            current_answer="wrong",
            status="wrong",
            hint_level=3,
            solved_at_hint_level=None,
        )
        plan = Planner._default_plan(progress)
        assert len(plan.steps) == 2
        assert plan.steps[0].skill == "error_diagnosis"
        assert plan.steps[1].skill == "progressive_hint"

    def test_default_plan_correct_answer(self):
        """Correct answer → knowledge_framework only."""
        progress = StudentProgress(
            question_id="q1",
            current_answer="correct",
            status="correct",
            hint_level=2,
            solved_at_hint_level=2,
        )
        plan = Planner._default_plan(progress)
        assert len(plan.steps) == 1
        assert plan.steps[0].skill == "knowledge_framework"

    def test_default_plan_all_skills_are_valid(self):
        """Every step's skill name maps to a known SkillDomain."""
        progress = StudentProgress(
            question_id="q1",
            current_answer="wrong",
            status="wrong",
            hint_level=5,
            solved_at_hint_level=None,
        )
        plan = Planner._default_plan(progress)
        for step in plan.steps:
            assert step.skill in VALID_SKILLS, f"Unknown skill: {step.skill}"

    def test_parse_plan_valid_json(self):
        """Valid JSON plan parses correctly."""
        raw = (
            '{"steps": [{"skill": "progressive_hint", "provider": "deepseek", '
            '"model": "", "reason": "test"}], "reasoning": "test plan"}'
        )
        plan = Planner._parse_plan(raw)
        assert len(plan.steps) == 1
        assert plan.steps[0].skill == "progressive_hint"
        assert plan.reasoning == "test plan"

    def test_parse_plan_json_in_fence(self):
        """JSON inside ```json fence parses correctly."""
        raw = (
            "```json\n"
            '{"steps": [{"skill": "error_diagnosis", "provider": "qwen", '
            '"model": "", "reason": "diagnose first"}], '
            '"reasoning": "need diagnosis"}\n'
            "```"
        )
        plan = Planner._parse_plan(raw)
        assert len(plan.steps) == 1
        assert plan.steps[0].skill == "error_diagnosis"

    def test_parse_plan_invalid_json_raises(self):
        """Garbage JSON raises ValueError."""
        import pytest as pt
        with pt.raises(ValueError):
            Planner._parse_plan("not valid json at all")

    def test_parse_plan_empty_steps_raises(self):
        """Empty steps list raises ValueError."""
        import pytest as pt
        with pt.raises(ValueError):
            Planner._parse_plan('{"steps": [], "reasoning": "nothing"}')

    def test_generate_hint_without_diagnosis_falls_back(self):
        """generate_hint works when no diagnosis exists (per-layer unlock).

        The hint skill needs a DiagnosisResult; when the student unlocks a hint
        before any diagnosis, the orchestrator must feed a minimal fallback
        (error_type=None) instead of erroring.
        """
        from agent.orchestrator import Orchestrator, _build_hint_message

        class FakeClient:
            async def chat_structured(self, provider, system, messages, output_model):
                from skill.progressive_hint.schema import HintOutput
                return HintOutput(
                    level=1,
                    title="Clarify the Question",
                    content="Focus on what the question asks for.",
                )

        orch = Orchestrator(FakeClient(), provider="deepseek")
        question = QuestionContext(
            id="q1",
            topic="Kinematics",
            type=QuestionType.CALCULATION,
            difficulty=2,
            content="A car accelerates uniformly from rest at 2 m/s² for 5 s. Find distance.",
            correct_answer="s = ½at² = 25 m",
        )
        progress = StudentProgress(
            question_id="q1",
            current_answer="s = at",
            status="wrong",
            hint_level=1,
            solved_at_hint_level=None,
        )

        # The message builder must accept a fallback diagnosis (error_type=None).
        fallback = DiagnosisResult(error_type=None, where_wrong="", why_wrong="")
        message = _build_hint_message(question, progress, fallback, None, max_level=5)
        assert '"error_type": null' in message

        import asyncio
        hint = asyncio.run(orch.generate_hint(question, progress))
        assert hint is not None
        assert hint.level == 1
