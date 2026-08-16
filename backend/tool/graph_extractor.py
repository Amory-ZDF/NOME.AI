"""GraphExtractor — LLM-driven entity/relation extraction for AS Physics notes.

Constrained by ontology.json (allowed node/relation types). One LLM call per
chapter. Output merged with the rule-generated skeleton (syllabus_skeleton.json).

Uses LLMClient.chat() (free text + manual JSON parse) rather than
chat_structured(): the output is nested + needs custom validation (whitelists,
slug normalization, alias merging), which is more controllable by hand.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from core.llm_client import LLMClient, LLMParseError, _extract_json

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants (single source of truth: ontology.json; these mirror it)
# ---------------------------------------------------------------------------

# Node types the LLM may extract. Topic and BigIdea are rule/teacher-seeded.
EXTRACTABLE_ENTITY_TYPES = {"Concept", "Formula", "Skill"}

# Relation types the LLM may emit. EXEMPLIFIES is auto-expanded from the
# `exemplifies` field; COMMONLY_CONFUSED/TESTED_TOGETHER/EQUIVALENT_ROUTE are
# error-driven or teacher-curated, NOT extracted from notes.
EXTRACTABLE_RELATION_TYPES = {
    "PREREQUISITE_OF",
    "REQUIRES_SKILL",
    "BELONGS_TO",
    "CONTRASTED_WITH",
}

# The 6 big ideas — a CLOSED label set (§5.3). BigIdea nodes are teacher-curated.
BIG_IDEAS = [
    "Conservation laws",
    "Energy & energy transfer",
    "Waves transfer energy without net matter transfer",
    "Modeling & idealization",
    "Macro-micro correspondence",
    "Measurement & uncertainty",
]

# The 11 syllabus topics (§5.4). BELONGS_TO targets must be one of these.
TOPIC_IDS = {
    "topic-ch01",
    "topic-ch02",
    "topic-ch03",
    "topic-ch04",
    "topic-ch05",
    "topic-ch06",
    "topic-ch07",
    "topic-ch08",
    "topic-ch09",
    "topic-ch10",
    "topic-ch11",
}

# Alias table (§5.2) — alias (lowercased) → canonical name.
# The extractor resolves any non-canonical name to the canonical one before slugging.
DEFAULT_ALIASES: dict[str, str] = {
    "linear momentum": "momentum",
    "f = ma": "Newton's second law",
    "newton's 2nd law": "Newton's second law",
    "newton's 1st law": "Newton's first law",
    "newton's 3rd law": "Newton's third law",
    "p.d.": "potential difference",
    "voltage": "potential difference",
    "electromotive force": "e.m.f.",
    "emf": "e.m.f.",
    "gpe": "gravitational potential energy",
    "ke": "kinetic energy",
    "elastic potential energy": "elastic strain energy",
    "suvat": "SUVAT equations",
    "equations of motion": "SUVAT equations",
    "work done": "work",
    "net force": "resultant force",
    "force diagram": "free-body diagram",
    "principle of conservation of momentum": "conservation of momentum",
    "terminal speed": "terminal velocity",
    "charge-to-mass ratio": "specific charge",
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def slugify(name: str) -> str:
    """Normalize a name to a stable slug.

    lowercase → remove apostrophes → non-alphanumeric → hyphen → collapse.
    Idempotent, so we can always recompute from the canonical name.
    """
    s = name.lower()
    s = s.replace("'", "")
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = s.strip("-")
    s = re.sub(r"-+", "-", s)
    return s


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------


@dataclass
class ExtractedEntity:
    id: str  # normalized slug
    name: str  # canonical English name
    type: str  # Concept | Formula | Skill
    definition: str = ""
    expression: str = ""  # only Formula
    exemplifies: list[str] = field(default_factory=list)  # BigIdea names (closed set)

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {"id": self.id, "name": self.name, "type": self.type}
        if self.definition:
            d["definition"] = self.definition
        if self.expression:
            d["expression"] = self.expression
        if self.exemplifies:
            d["exemplifies"] = self.exemplifies
        return d


@dataclass
class ExtractedRelation:
    source: str
    target: str
    type: str  # PREREQUISITE_OF | REQUIRES_SKILL | BELONGS_TO | CONTRASTED_WITH

    def to_dict(self) -> dict[str, str]:
        return {"source": self.source, "target": self.target, "type": self.type}


@dataclass
class ChapterExtraction:
    chapter_id: str
    entities: list[ExtractedEntity] = field(default_factory=list)
    relations: list[ExtractedRelation] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Extractor
# ---------------------------------------------------------------------------


class GraphExtractor:
    """Extract structured entities/relations from one chapter of notes."""

    def __init__(
        self,
        client: LLMClient,
        *,
        provider: str = "deepseek",
        ontology_path: str | None = None,
        aliases: dict[str, str] | None = None,
        temperature: float = 0.1,
        max_tokens: int = 8192,
        max_retries: int = 2,
    ) -> None:
        self._client = client
        self._provider = provider
        self._temperature = temperature
        self._max_tokens = max_tokens
        self._max_retries = max_retries

        # Alias table: merge defaults with any caller overrides.
        self._aliases = dict(DEFAULT_ALIASES)
        if aliases:
            self._aliases.update({k.lower(): v for k, v in aliases.items()})

        # Load ontology for the entity/relation whitelist (kept in sync with constants).
        self._entity_types = set(EXTRACTABLE_ENTITY_TYPES)
        self._relation_types = set(EXTRACTABLE_RELATION_TYPES)
        self._big_ideas = list(BIG_IDEAS)
        if ontology_path is None:
            ontology_path = str(
                Path(__file__).resolve().parent.parent / "data" / "ontology.json"
            )
        self._load_ontology(ontology_path)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def extract_chapter(
        self, chapter_id: str, chapter_name: str, text: str
    ) -> ChapterExtraction:
        """Extract entities + relations for one chapter (one LLM call)."""
        system = self._build_system_prompt()
        messages: list[dict[str, str]] = [
            {"role": "user", "content": self._build_user_message(chapter_id, chapter_name, text)}
        ]

        last_error: str | None = None
        for attempt in range(self._max_retries + 1):
            if last_error:
                messages.append({
                    "role": "user",
                    "content": (
                        "The previous response was invalid. Error: " + last_error + "\n"
                        "Please output a single valid JSON object with the exact schema."
                    ),
                })

            content, usage = await self._client.chat(
                self._provider,
                system=system,
                messages=messages,
                temperature=self._temperature,
                max_tokens=self._max_tokens,
            )

            try:
                raw = json.loads(_extract_json(content))
            except json.JSONDecodeError as exc:
                last_error = f"JSON parse error: {exc}"
                logger.warning(
                    "extract_chapter %s attempt %d/%d: %s",
                    chapter_id, attempt + 1, self._max_retries + 1, last_error,
                )
                continue

            try:
                self.validate(raw)
            except ValueError as exc:
                last_error = str(exc)
                logger.warning(
                    "extract_chapter %s attempt %d/%d: %s",
                    chapter_id, attempt + 1, self._max_retries + 1, last_error,
                )
                continue

            result = self.normalize(raw)
            logger.info(
                "extract_chapter %s: %d entities, %d relations (%d tokens)",
                chapter_id,
                len(result.entities),
                len(result.relations),
                usage.get("total_tokens", 0),
            )
            return result

        raise LLMParseError(
            f"Failed to extract chapter {chapter_id} after {self._max_retries + 1} attempts. "
            f"Last error: {last_error}"
        )

    def validate(self, raw: dict) -> None:
        """Structural checks that mean the LLM output is malformed → retry.

        Raises ValueError on hard failures (bad shape, missing required fields,
        off-whitelist types). Tolerant dropping happens in normalize(), not here.
        """
        if not isinstance(raw, dict):
            raise ValueError("output must be a JSON object")
        entities = raw.get("entities")
        relations = raw.get("relations")
        if not isinstance(entities, list) or not isinstance(relations, list):
            raise ValueError("output must have 'entities' and 'relations' lists")

        for i, e in enumerate(entities):
            if not isinstance(e, dict):
                raise ValueError(f"entity[{i}] is not an object")
            if not e.get("id") or not e.get("name") or not e.get("type"):
                raise ValueError(f"entity[{i}] missing id/name/type")
            if e["type"] not in self._entity_types:
                raise ValueError(
                    f"entity[{i}] type {e['type']!r} not in {sorted(self._entity_types)}"
                )

        for i, r in enumerate(relations):
            if not isinstance(r, dict):
                raise ValueError(f"relation[{i}] is not an object")
            if not r.get("source") or not r.get("target") or not r.get("type"):
                raise ValueError(f"relation[{i}] missing source/target/type")
            if r["type"] not in self._relation_types:
                raise ValueError(
                    f"relation[{i}] type {r['type']!r} not in {sorted(self._relation_types)}"
                )

    def normalize(self, raw: dict) -> ChapterExtraction:
        """Tolerant transform: alias resolution + slug + dedup + endpoint checks.

        Drops bad edges/entities with a warning rather than failing the chapter.
        """
        # -- entities --
        entities: dict[str, ExtractedEntity] = {}
        for e in raw.get("entities", []):
            name = self._canonical_name(str(e.get("name", "")))
            if not name:
                continue
            node_type = e.get("type")
            if node_type not in self._entity_types:
                continue

            entity = ExtractedEntity(
                id=slugify(name),
                name=name,
                type=node_type,
                definition=str(e.get("definition", "") or "").strip(),
                expression=str(e.get("expression", "") or "").strip()
                if node_type == "Formula"
                else "",
                exemplifies=self._filter_big_ideas(e.get("exemplifies")),
            )

            # Merge duplicates on slug: keep longer definition, non-empty expression,
            # union of exemplifies.
            existing = entities.get(entity.id)
            if existing is None:
                entities[entity.id] = entity
            else:
                entities[entity.id] = self._merge_entities(existing, entity)

        entity_ids = set(entities.keys())
        # Endpoints may reference the chapter's own entities or any syllabus topic.
        allowed_endpoints = entity_ids | TOPIC_IDS

        # -- relations --
        relations: list[ExtractedRelation] = []
        seen_edges: set[tuple[str, str, str]] = set()
        for r in raw.get("relations", []):
            rtype = r.get("type")
            if rtype not in self._relation_types:
                continue
            source = slugify(self._canonical_name(str(r.get("source", ""))))
            target = str(r.get("target", "")).strip()
            # BELONGS_TO target is a topic id (not a name) — keep as-is; others are slugs.
            if rtype == "BELONGS_TO":
                # allow the LLM to send either the id (topic-chXX) or a name
                if target not in TOPIC_IDS:
                    target_slug = slugify(self._canonical_name(target))
                    if target_slug not in TOPIC_IDS:
                        target = target_slug
            else:
                target = slugify(self._canonical_name(target))

            if not source or not target:
                continue

            if source not in allowed_endpoints or target not in allowed_endpoints:
                logger.warning(
                    "Dropping relation with unknown endpoint: %s -[%s]-> %s",
                    source, rtype, target,
                )
                continue

            # Self-loop guard for directed/symmetric relation types that need a pair.
            if source == target and rtype in ("CONTRASTED_WITH", "PREREQUISITE_OF"):
                logger.warning("Dropping self-loop %s -[%s]-> %s", source, rtype, target)
                continue

            edge = (source, target, rtype)
            if edge in seen_edges:
                continue
            seen_edges.add(edge)
            relations.append(ExtractedRelation(source=source, target=target, type=rtype))

        return ChapterExtraction(
            chapter_id=str(raw.get("chapter_id", "")),
            entities=list(entities.values()),
            relations=relations,
        )

    # ------------------------------------------------------------------
    # Prompt builders
    # ------------------------------------------------------------------

    def _build_system_prompt(self) -> str:
        topics = "\n".join(f"  {tid}" for tid in sorted(TOPIC_IDS))
        big_ideas = "\n".join(f'  {i + 1}. "{b}"' for i, b in enumerate(self._big_ideas))
        alias_lines = "\n".join(f'  {c} (not "{a}")' for a, c in sorted(self._aliases.items()))

        return (
            "You are an expert AS-Level Physics (CAIE 9702) knowledge-graph extractor.\n"
            "Your job: read ONE chapter of study notes and extract structured entities and "
            "relations for a knowledge graph.\n\n"
            "STRICT ONTOLOGY — you may ONLY use these types. Do NOT invent new types.\n\n"
            "ENTITY TYPES:\n"
            "- Concept: a physical concept, quantity, or named law/principle (e.g. momentum,\n"
            "  Newton's second law, potential difference, principle of conservation of momentum).\n"
            "- Formula: an unnamed equation with no proper name (e.g. v = u + at, V = IR, I = Anvq).\n"
            "  RULE: if the thing has a proper name (a law/principle), it is a Concept, NOT a Formula.\n"
            "  Put the symbolic form in the Formula's \"expression\" field.\n"
            "- Skill: a transferable procedural technique (e.g. resolve a vector into components,\n"
            "  draw a free-body diagram, draw a tangent to find instantaneous velocity).\n\n"
            "RELATION TYPES (direction matters where noted):\n"
            "- PREREQUISITE_OF: source is a prerequisite of target (target depends on source). "
            "Directed source -> target.\n"
            "- REQUIRES_SKILL: source requires the Skill target to be applied. Directed source -> target.\n"
            "- BELONGS_TO: source (Concept/Formula/Skill) belongs to the Topic target. Directed source -> topic. "
            "target MUST be one of the topic ids below.\n"
            "- CONTRASTED_WITH: source and target form a concept pair the notes deliberately\n"
            "  juxtapose, where understanding the difference IS the learning objective\n"
            "  (e.g. transverse vs longitudinal wave, elastic vs inelastic collision,\n"
            "  diffraction vs interference). Symmetric — output only ONE direction.\n\n"
            "NAMING RULES:\n"
            "- Use canonical English names only (see alias list below). Never create synonyms.\n"
            "- id = slug of the canonical name: lowercase, remove apostrophes, non-alphanumeric -> hyphen.\n\n"
            'BIG IDEAS (for the "exemplifies" field — every entity MUST carry this field):\n'
            f"{big_ideas}\n\n"
            "TOPICS (use these ids for BELONGS_TO):\n"
            f"{topics}\n\n"
            "CANONICAL ALIASES (use the left side only):\n"
            f"{alias_lines}\n\n"
            "OUTPUT: a single JSON object ONLY (no markdown, no preamble) of shape:\n"
            "{\n"
            '  "entities": [\n'
            '    {"id": "...", "name": "...", "type": "Concept|Formula|Skill",\n'
            '     "definition": "...", "expression": "only for Formula, else omit",\n'
            '     "exemplifies": ["BigIdea name", ...]}\n'
            "  ],\n"
            '  "relations": [\n'
            '    {"source": "id", "target": "id-or-topic-id", "type": "RELATION_TYPE"}\n'
            "  ]\n"
            "}\n\n"
            "RULES:\n"
            "- Extract every Concept/Formula/Skill that the notes actually teach.\n"
            "- CONTRASTED_WITH only for pairs the notes explicitly contrast. If none, return empty.\n"
            "- Do not hallucinate relations absent from the text.\n"
            "- Same canonical concept appears ONCE per chapter (merge repeats).\n"
            '- The "exemplifies" field is REQUIRED on every entity — classify each entity '
            "into 0..n of the big ideas above (empty array [] if none fits). Do not omit the field.\n"
            '- CRITICAL: every "source" and "target" in relations MUST be an "id" string '
            "that ALREADY appears in the entities array (or a topic id for BELONGS_TO). "
            "Copy the exact id — do NOT re-derive or abbreviate it.\n"
            '- The SUVAT equations are ONE Formula entity (id "suvat-equations") whose '
            '"expression" field lists all four equations together. Do NOT split them into '
            "separate Formula entities."
        )

    @staticmethod
    def _build_user_message(chapter_id: str, chapter_name: str, text: str) -> str:
        return (
            f"Chapter id: {chapter_id}\n"
            f"Chapter name: {chapter_name}\n"
            "Extract entities and relations from the notes below.\n\n"
            "<notes>\n"
            f"{text}\n"
            "</notes>"
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _load_ontology(self, path: str) -> None:
        """Load ontology.json and cross-check the whitelist constants."""
        p = Path(path)
        if not p.exists():
            logger.warning("Ontology file not found: %s — using built-in whitelist", p)
            return
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Failed to read ontology %s: %s", p, exc)
            return

        # Entity types: everything except Topic and BigIdea (those are seeded, not extracted).
        types = {t.get("type") for t in data.get("entity_types", []) if isinstance(t, dict)}
        types -= {"Topic", "BigIdea"}
        if types:
            self._entity_types = types

        # Relation types: exclude EXEMPLIFIES (auto), COMMONLY_CONFUSED (error-driven),
        # TESTED_TOGETHER and EQUIVALENT_ROUTE (teacher-curated).
        rels = {r.get("type") for r in data.get("relation_types", []) if isinstance(r, dict)}
        rels -= {"EXEMPLIFIES", "COMMONLY_CONFUSED", "TESTED_TOGETHER", "EQUIVALENT_ROUTE"}
        if rels:
            self._relation_types = rels

        # Big ideas from the BigIdea entity type examples.
        big_ideas: list[str] = []
        for t in data.get("entity_types", []):
            if isinstance(t, dict) and t.get("type") == "BigIdea":
                big_ideas = [e for e in t.get("examples", []) if isinstance(e, str)]
        if big_ideas:
            self._big_ideas = big_ideas

    def _canonical_name(self, name: str) -> str:
        """Resolve an alias to its canonical name (case/whitespace insensitive)."""
        key = " ".join(name.strip().split()).lower()
        return self._aliases.get(key, name.strip())

    def _filter_big_ideas(self, labels: Any) -> list[str]:
        """Keep only known big-idea labels (closed set); drop invented ones."""
        if not isinstance(labels, list):
            return []
        known = set(self._big_ideas)
        out: list[str] = []
        for label in labels:
            if isinstance(label, str) and label in known:
                if label not in out:
                    out.append(label)
            elif isinstance(label, str):
                logger.warning("Dropping unknown exemplifies label: %r", label)
        return out

    @staticmethod
    def _merge_entities(a: ExtractedEntity, b: ExtractedEntity) -> ExtractedEntity:
        """Merge two entities sharing a slug: keep longer definition, non-empty expression."""
        definition = a.definition if len(a.definition) >= len(b.definition) else b.definition
        expression = a.expression or b.expression
        exemplifies = list(dict.fromkeys([*a.exemplifies, *b.exemplifies]))
        return ExtractedEntity(
            id=a.id,
            name=a.name,
            type=a.type,
            definition=definition,
            expression=expression,
            exemplifies=exemplifies,
        )
