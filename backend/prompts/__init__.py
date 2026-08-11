# backend/prompts/__init__.py
"""Complementary prompt helpers.

Each skill's SYSTEM PROMPT lives in its own SKILL.md file (loaded via skill.loader).
The templates here are for structuring user messages — converting agent-internal
types into JSON prompts the LLM can consume.

These are SUPPLEMENTS to SKILL.md, not replacements.
"""
