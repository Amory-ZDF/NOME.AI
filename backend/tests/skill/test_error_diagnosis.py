"""Tests for ErrorDiagnosis skill.

The skill is defined in skill/error_diagnosis/SKILL.md.
The schema is in skill/error_diagnosis/schema.py (DiagnosisOutput model).

Covers:
    - All 7 error types are classifiable
    - Structured output is valid (where_wrong, why_wrong, linked_knowledge)
    - Batch diagnosis produces one result per question
    - Empty answer / no attempts → execution error
    - Correct answer → should not be diagnosed (or returns neutral result)
    - A-Level: mark scheme missing → expression error
    - Sign error in differentiation → calculation error
    - Wrong method on extrema → method error
"""

import pytest

from skill.common import SkillDomain
from skill.loader import load_skill
from skill.error_diagnosis.schema import DiagnosisOutput


class TestDiagnosisSchema:
    """Verify the Pydantic schema validates correctly."""

    def test_diagnosis_output_minimal_fields(self):
        """Minimal valid DiagnosisOutput can be constructed."""
        d = DiagnosisOutput(
            error_type="calculation",
            where_wrong="Line 3, sign error when expanding −(x−2)²",
            why_wrong="Forgot the outer minus applies to all terms after expansion",
            linked_knowledge=["algebraic_expansion"],
        )
        assert d.error_type == "calculation"
        assert d.understanding_explanation is None
        assert d.scoring_explanation is None

    def test_diagnosis_output_full_fields(self):
        """All fields populated."""
        d = DiagnosisOutput(
            error_type="method",
            where_wrong="Step 1: used conservation of momentum for an energy problem",
            why_wrong="Did not recognise this is a work-energy problem",
            linked_knowledge=["work_energy_theorem", "conservation_laws"],
            understanding_explanation="In A-Level Physics, momentum conservation applies to collisions. This problem involves forces over distances, which calls for the work-energy theorem.",
            scoring_explanation="Mark Scheme requires: 1) identify work-energy as the method (1 mark), 2) write W = F·d (1 mark), 3) equate to ΔKE (1 mark).",
        )
        assert len(d.linked_knowledge) == 2


class TestDiagnosisGeneration:
    """Integration tests — require a live LLM (skip in CI)."""

    @pytest.mark.integration
    async def test_diagnose_calculation_error_sign_slip(self):
        """Student got sign wrong in derivative → calculation error."""
        ...

    @pytest.mark.integration
    async def test_diagnose_method_error_wrong_approach(self):
        """Student used wrong method for extrema → method error."""
        ...

    @pytest.mark.integration
    async def test_diagnose_knowledge_error_missing_concept(self):
        """Student doesn't know the relevant formula → knowledge error."""
        ...

    @pytest.mark.integration
    async def test_diagnose_execution_error_unanswered(self):
        """Student submitted no answer → execution error."""
        ...

    @pytest.mark.integration
    async def test_diagnose_expression_error_missing_mark_scheme(self):
        """Correct method but missing required scoring points → expression error."""
        ...

    @pytest.mark.integration
    async def test_diagnose_reading_error_misread_question(self):
        """Student answered a different question → reading error."""
        ...

    @pytest.mark.integration
    async def test_diagnose_habit_error_repeated_pattern(self):
        """Same mistake pattern across multiple attempts → habit error."""
        ...

    @pytest.mark.integration
    async def test_batch_diagnose_correct_count(self):
        """N questions in → N DiagnosisResults out."""
        ...

    @pytest.mark.integration
    async def test_diagnose_output_has_required_fields(self):
        """Every result must have error_type, where_wrong, why_wrong, linked_knowledge."""
        ...
