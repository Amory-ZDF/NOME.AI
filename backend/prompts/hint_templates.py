"""User-message builder for ProgressiveHint skill.

The SYSTEM PROMPT lives in skill/progressive_hint/SKILL.md.
This module only builds the user message (question context + student state).

Each hint level has its own constraints on what the LLM may reveal.
The SKILL.md contains the full rules; these are convenience helpers.
"""

HINT_LEVEL_META: dict[int, tuple[str, str]] = {
    1: (
        "Clarify the Question",
        (
            "You are a patient A-Level Physics tutor. The student is stuck on a question. "
            "Your ONLY job is to restate what the question is asking in simpler terms. "
            "DO NOT mention any formulas, methods, or steps. "
            "DO NOT hint at the answer. "
            "Just rephrase the goal so the student understands what they need to find."
        ),
    ),
    2: (
        "Relevant Knowledge",
        (
            "You are a patient A-Level Physics tutor. The student has attempted a question "
            "and is stuck. Point them to the relevant concepts, formulas, or principles "
            "they need — but DO NOT tell them how to apply them. "
            "Name the concept and briefly explain what it means. "
            "DO NOT solve any part of the question."
        ),
    ),
    3: (
        "Method Hint",
        (
            "You are a patient A-Level Physics tutor. The student knows the relevant concepts "
            "but doesn't know which approach to take. Suggest the method or strategy — "
            "the sequence of steps in principle — but DO NOT execute any step. "
            "Use phrases like 'you could try...' or 'consider whether...'"
        ),
    ),
    4: (
        "Key Step",
        (
            "You are a patient A-Level Physics tutor. Show ONE critical step of the solution "
            "and explain why this step matters. Leave the rest for the student to complete. "
            "The step you show should unblock them, not finish the problem."
        ),
    ),
    5: (
        "Full Solution",
        (
            "You are a patient A-Level Physics tutor. The student has tried multiple times "
            "and is still stuck. Show the FULL solution with clear reasoning at each step. "
            "After the solution, point out: what they should practice next, and what common "
            "mistakes to watch for. This is a teaching moment, not just an answer."
        ),
    ),
}


def build_hint_message(
    *,
    level: int,
    question_content: str,
    student_answer: str,
    correct_answer: str,
    topic: str,
    diagnosis_summary: str | None = None,
) -> str:
    """Build a user message for hint generation.

    The orchestrator pairs this user message with the SKILL.md system prompt.
    """
    import json

    payload: dict = {
        "hint_level": level,
        "question": {
            "content": question_content,
            "correct_answer": correct_answer,
            "topic": topic,
        },
        "student": {
            "current_answer": student_answer,
        },
    }
    if diagnosis_summary:
        payload["diagnosis_summary"] = diagnosis_summary

    return json.dumps(payload, ensure_ascii=False, indent=2)
