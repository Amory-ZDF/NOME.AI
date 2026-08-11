"""User-message builder for ErrorDiagnosis skill.

The SYSTEM PROMPT lives in skill/error_diagnosis/SKILL.md.
This module provides the DIAGNOSIS_SYSTEM_PROMPT backup and the
user-message builder that the orchestrator uses to structure input.

The SKILL.md contains the full diagnostic workflow and decision tree;
the prompt here is a fallback / supplement.
"""

# Backup system prompt — the primary source is SKILL.md.
# This exists so the module can be used independently during testing.
DIAGNOSIS_SYSTEM_PROMPT: str = (
    "You are an expert A-Level diagnostic tutor. "
    "Your job is to analyze a student's wrong answer and classify WHY they made the mistake. "
    "Output MUST be valid JSON matching the schema exactly.\n"
    "\n"
    "Error types:\n"
    "- knowledge: concept, formula, or vocabulary not understood\n"
    "- method: wrong approach or strategy chosen\n"
    "- calculation: arithmetic, algebraic, or unit error in an otherwise correct method\n"
    "- reading: misread the question, passage, or constraints\n"
    "- execution: incomplete or missing submission\n"
    "- expression: correct reasoning but missing Mark Scheme scoring points\n"
    "- habit: the same avoidable pattern has recurred across multiple attempts\n"
    "\n"
    "For each diagnosis, you MUST provide:\n"
    "1. error_type: one of the 7 types above\n"
    "2. where_wrong: the exact location or step where the error occurred\n"
    "3. why_wrong: the root cause (what the student doesn't understand or did wrong)\n"
    "4. linked_knowledge: list of knowledge concept names this error relates to\n"
    "5. understanding_explanation (optional): conceptual explanation for A-Level\n"
    "6. scoring_explanation (optional): Mark Scheme perspective for A-Level\n"
    "\n"
    "BE SPECIFIC. 'Calculation error' is not enough — say 'sign error when "
    "differentiating −5x², got +10x instead of −10x'."
)

FEW_SHOT_EXAMPLES: list[dict] = [
    # Each: {question, student_answer, correct_answer, expected_output}
]


def build_diagnosis_message(
    *,
    question_content: str,
    student_answer: str,
    correct_answer: str,
    topic: str,
    attempt_history: list[dict] | None = None,
) -> str:
    """Build a user message for error diagnosis.

    The orchestrator pairs this with the SKILL.md system prompt.
    """
    import json

    payload: dict = {
        "question": {
            "content": question_content,
            "correct_answer": correct_answer,
            "topic": topic,
        },
        "student": {
            "current_answer": student_answer,
            "attempts": attempt_history or [],
        },
    }
    return json.dumps(payload, ensure_ascii=False, indent=2)
