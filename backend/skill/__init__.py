# backend/skill/__init__.py
"""Agent skills — each skill lives in its own directory as a SKILL.md markdown file.

A skill is an instruction document written in natural language for the LLM agent.
It follows the Claude Code progressive-disclosure pattern:

Directory per skill:
  skill/<name>/
    SKILL.md          ← the skill instruction document
    schema.py         ← Pydantic model for structured output validation
    test_<name>.py    ← skill-specific tests

A thin Python loader reads the SKILL.md text and uses core/llm_client.py
to invoke an LLM with the skill instructions as the system prompt.
No business logic lives in Python — Python only handles I/O and validation.
"""

from pathlib import Path
from skill.common import SkillDomain

# Path to this directory
SKILL_DIR = Path(__file__).resolve().parent

# Map skill domain → directory name
SKILL_DIRECTORIES: dict[SkillDomain, str] = {
    SkillDomain.PROGRESSIVE_HINT: "progressive_hint",
    SkillDomain.ERROR_DIAGNOSIS: "error_diagnosis",
    SkillDomain.KNOWLEDGE_FRAMEWORK: "knowledge_framework",
}
