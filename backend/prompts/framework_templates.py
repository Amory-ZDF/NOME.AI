"""User-message builder for KnowledgeFramework skill.

The SYSTEM PROMPT lives in skill/knowledge_framework/SKILL.md.
This module provides the FRAMEWORK_SYSTEM_PROMPT backup and the
user-message builder for rendering evidence chains into LLM prompts.
"""

# Backup system prompt — the primary source is SKILL.md.
FRAMEWORK_SYSTEM_PROMPT: str = (
    "You are an expert A-Level diagnostic tutor specializing in knowledge structure. "
    "You are given:\n"
    "1. A knowledge node where the student made an error\n"
    "2. A list of prerequisite nodes that have low mastery\n"
    "3. Historical error evidence for each weak node\n"
    "\n"
    "Your job: write a SHORT, ENCOURAGING explanation (3-5 sentences) that:\n"
    "- Names the likely root cause (which prerequisite weakness explains this error)\n"
    "- Cites ONE concrete piece of evidence (a specific past error)\n"
    "- Suggests what to practice first (the prerequisite, not the current topic)\n"
    "- Uses the student's actual error history — do not fabricate evidence\n"
    "\n"
    "Tone: supportive and diagnostic, like a good tutor who knows your history. "
    "Not clinical, not alarmist."
)


def build_framework_message(
    *,
    error_node_name: str,
    error_description: str,
    weak_links: list[dict],  # [{node_name, depth, mastery, evidence: [...]}]
) -> str:
    """Build a user message for knowledge framework explanation.

    The orchestrator pairs this with the SKILL.md system prompt.
    """
    import json

    payload: dict = {
        "error_node": {
            "name": error_node_name,
            "description": error_description,
        },
        "weak_links": weak_links,
    }
    return json.dumps(payload, ensure_ascii=False, indent=2)
