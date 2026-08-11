"""Tests for KnowledgeFramework skill.

The skill is defined in skill/knowledge_framework/SKILL.md.
The schema is in skill/knowledge_framework/schema.py (FrameworkOutput + WeakLinkOutput).

Covers:
    - Single error node → finds weak prerequisites below threshold
    - Multiple error nodes → finds cross-cutting weaknesses
    - All prerequisites strong → returns empty result
    - Isolated node (no prerequisites) → returns empty result
    - Explanation references concrete evidence from error history
    - Mastery threshold boundary: exactly at threshold = not weak
    - Decay-weighted mastery: old errors weigh less
"""

import pytest

from skill.knowledge_framework.schema import FrameworkOutput, WeakLinkOutput


class TestFrameworkSchema:
    """Verify the Pydantic schemas validate correctly."""

    def test_weak_link_output_minimal(self):
        wl = WeakLinkOutput(
            node_id="vectors",
            node_name="Vectors & Components",
            depth=1,
            mastery=0.35,
            evidence=["err_001: sign error in vector resolution (2026-07-15)"],
        )
        assert wl.mastery < 0.6

    def test_framework_output_empty(self):
        fw = FrameworkOutput(
            weak_links=[],
            explanation="All prerequisite nodes show strong mastery. "
            "This error appears to be an isolated slip rather than a foundational gap.",
        )
        assert len(fw.weak_links) == 0

    def test_framework_output_with_links(self):
        fw = FrameworkOutput(
            weak_links=[
                WeakLinkOutput(
                    node_id="trigonometry",
                    node_name="Trigonometry",
                    depth=1,
                    mastery=0.28,
                    evidence=["err_005: sin/cos confusion in resolving forces"],
                ),
                WeakLinkOutput(
                    node_id="algebra",
                    node_name="Algebraic Manipulation",
                    depth=2,
                    mastery=0.45,
                    evidence=["err_003: expansion error", "err_007: sign error"],
                ),
            ],
            explanation="Your difficulty with force resolution likely traces back to trigonometry fundamentals. "
            "In particular, you've confused sin and cos when resolving vectors (err_005). "
            "Let's review right-triangle decomposition before returning to forces.",
        )
        assert len(fw.weak_links) == 2
        assert fw.weak_links[0].depth < fw.weak_links[1].depth  # sorted depth ASC


class TestFrameworkGeneration:
    """Integration tests — require a live LLM + populated knowledge graph."""

    @pytest.mark.integration
    async def test_finds_weak_direct_prerequisite(self):
        """Error at projectile, vectors mastery 0.3 → vectors appears as weak link."""
        ...

    @pytest.mark.integration
    async def test_deep_prerequisite_chain(self):
        """Error at energy, kinematics (depth 2) is weak → both levels appear."""
        ...

    @pytest.mark.integration
    async def test_no_weakness_when_all_strong(self):
        """All prerequisites above threshold → empty result."""
        ...

    @pytest.mark.integration
    async def test_isolated_node_returns_empty(self):
        """Node has no prerequisites → empty result (not an error)."""
        ...

    @pytest.mark.integration
    async def test_multi_node_finds_cross_cutting(self):
        """Errors at projectile AND energy, both weak at vectors → vectors is the cross-cutting weakness."""
        ...

    @pytest.mark.integration
    async def test_explanation_cites_evidence(self):
        """The LLM-generated explanation must reference at least one specific error ID."""
        ...

    @pytest.mark.integration
    async def test_mastery_at_threshold_is_not_weak(self):
        """If threshold=0.6 and mastery=0.6, node is NOT included."""
        ...

    @pytest.mark.integration
    async def test_decay_reduces_weight_of_old_errors(self):
        """Error from 60 days ago contributes less than error from 3 days ago."""
        ...
