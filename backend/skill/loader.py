"""Skill loader — reads SKILL.md from disk and assembles LLM-ready prompts.

The loader is the ONLY Python code in the skill layer. It:
1. Reads a SKILL.md file from disk.
2. Extracts YAML frontmatter (name, description, tags).
3. Returns the full markdown body as the skill's system prompt.
4. Resolves the skill's Pydantic output schema.

This keeps all instructional content in natural language (SKILL.md)
while giving the orchestrator programmatic access to schemas and metadata.
"""

from pathlib import Path
from typing import Any

import yaml  # type: ignore[import-untyped]

from skill import SKILL_DIR, SKILL_DIRECTORIES
from skill.common import SkillDomain


class SkillLoadError(Exception):
    """Raised when a SKILL.md cannot be found or parsed."""


def _parse_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    """Split YAML frontmatter from markdown body.

    Frontmatter is delimited by --- on its own line at the top of the file.
    Returns (frontmatter_dict, body_markdown).
    """
    if not text.startswith("---"):
        return {}, text

    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}, text

    frontmatter = yaml.safe_load(parts[1]) or {}
    body = parts[2].strip()
    return frontmatter, body


def load_skill(domain: SkillDomain) -> tuple[str, str]:
    """Load a skill's SYSTEM PROMPT and output schema.

    Args:
        domain: which skill to load (e.g. SkillDomain.ERROR_DIAGNOSIS).

    Returns:
        (system_prompt, output_schema_module_name)
        - system_prompt: the full SKILL.md body (without frontmatter),
          ready to use as the LLM system prompt.
        - output_schema_module_name: dotted path to the Pydantic model
          class, e.g. "skill.error_diagnosis.schema.DiagnosisOutput".
    """
    dir_name = SKILL_DIRECTORIES.get(domain)
    if dir_name is None:
        raise SkillLoadError(f"Unknown skill domain: {domain}")

    skill_md = SKILL_DIR / dir_name / "SKILL.md"
    if not skill_md.exists():
        raise SkillLoadError(f"SKILL.md not found at {skill_md}")

    text = skill_md.read_text(encoding="utf-8")
    frontmatter, body = _parse_frontmatter(text)

    if not body.strip():
        raise SkillLoadError(f"SKILL.md at {skill_md} has no body content")

    # Build dotted path to the schema's Pydantic model
    # Each skill's schema.py exports one main model; the orchestrator
    # uses importlib to resolve it at runtime.
    schema_path = f"skill.{dir_name}.schema"

    return body, schema_path


def load_skill_metadata(domain: SkillDomain) -> dict[str, Any]:
    """Load only the YAML frontmatter (name, description, tags)."""
    dir_name = SKILL_DIRECTORIES.get(domain)
    if dir_name is None:
        raise SkillLoadError(f"Unknown skill domain: {domain}")

    skill_md = SKILL_DIR / dir_name / "SKILL.md"
    if not skill_md.exists():
        raise SkillLoadError(f"SKILL.md not found at {skill_md}")

    text = skill_md.read_text(encoding="utf-8")
    frontmatter, _ = _parse_frontmatter(text)
    return frontmatter
