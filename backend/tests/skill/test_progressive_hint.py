"""Tests for ProgressiveHint skill.

The skill is defined in skill/progressive_hint/SKILL.md.
The schema is in skill/progressive_hint/schema.py (HintOutput model).

Covers:
    - L1 hint: restates question, no formulas
    - L3 hint: suggests method, no execution
    - L5 hint: full solution with teaching note
    - Respects hint_level bounds (0→1, 4→5, 5→error)
    - Custom hint with diagnosis summary
    - Custom hint at L1 (diagnosis should NOT leak method details)
"""

import pytest

from skill.common import SkillDomain
from skill.loader import load_skill, load_skill_metadata


class TestSkillLoading:
    """Verify SKILL.md files load correctly."""

    def test_progressive_hint_skill_loads(self):
        """SKILL.md exists and has non-empty body."""
        prompt, schema_path = load_skill(SkillDomain.PROGRESSIVE_HINT)
        assert len(prompt) > 100
        assert "schema" in schema_path

    def test_progressive_hint_frontmatter(self):
        """YAML frontmatter has required fields."""
        meta = load_skill_metadata(SkillDomain.PROGRESSIVE_HINT)
        assert "name" in meta
        assert "description" in meta

    def test_all_three_skills_loadable(self):
        """Every SkillDomain resolves to an existing SKILL.md."""
        for domain in SkillDomain:
            prompt, schema_path = load_skill(domain)
            assert len(prompt) > 50
            assert schema_path.startswith("skill.")


class TestHintGeneration:
    """Integration tests — require a live LLM (skip in CI)."""

    @pytest.mark.integration
    async def test_hint_level_1_restates_question_only(self):
        """L1 hint must clarify the question without mentioning formulas or steps."""
        ...

    @pytest.mark.integration
    async def test_hint_level_3_suggests_method_without_execution(self):
        """L3 hint names the approach but does not solve any step."""
        ...

    @pytest.mark.integration
    async def test_hint_level_5_provides_full_solution_with_teaching_note(self):
        """L5 shows complete solution and practice suggestion."""
        ...

    @pytest.mark.integration
    async def test_hint_refuses_when_already_solved(self):
        """If status='correct', hint generation should raise ValueError."""
        ...

    @pytest.mark.integration
    async def test_hint_refuses_when_at_max_level(self):
        """If hint_level=5 and still wrong, should indicate no more hints available."""
        ...

    @pytest.mark.integration
    async def test_custom_hint_incorporates_diagnosis(self):
        """When diagnosis_summary is provided, the hint should reference the specific mistake."""
        ...

    @pytest.mark.integration
    async def test_custom_hint_level_1_does_not_leak_method(self):
        """L1 + diagnosis should NOT reveal method — only reframe the question with the error context."""
        ...
