"""Offline script: AS Physics notes → knowledge graph JSON.

Pipeline (spec §2):
    1. Read ontology.json, syllabus_skeleton.json, AS-level-phy-note.txt.
    2. Split the notes into chapters by heading lines ^(CH<num>|Topic <num>):
    3. Extract each chapter (one LLM call), with per-chapter caching for resume.
    4. Merge skeleton + extractions, expand `exemplifies` → EXEMPLIFIES edges.
    5. Write backend/data/as_physics_graph.json and validate with KnowledgeGraph.

Usage (from backend/):
    python -m scripts.extract_graph
    python -m scripts.extract_graph --only topic-ch02
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import re
import sys
from pathlib import Path
from typing import Any

# backend/ is the project root when run as `python -m scripts.extract_graph`.
BACKEND_ROOT = Path(__file__).resolve().parent.parent

from app.config import AppConfig  # noqa: E402
from core.llm_client import create_llm_client  # noqa: E402
from tool.graph_extractor import GraphExtractor  # noqa: E402
from tool.knowledge_graph import KnowledgeGraph  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("extract_graph")

DATA_DIR = BACKEND_ROOT / "data"
NOTE_PATH = DATA_DIR / "AS-level-phy-note.txt"
ONTOLOGY_PATH = DATA_DIR / "ontology.json"
SKELETON_PATH = DATA_DIR / "syllabus_skeleton.json"
OUTPUT_PATH = DATA_DIR / "as_physics_graph.json"
CACHE_PATH = DATA_DIR / ".extract_cache.json"

# Heading patterns. CH1 is the only chapter using "CH"; the rest use "Topic N:".
_HEADING_RE = re.compile(r"^(CH\d+|Topic \d+):\s*(.+?)\s*$")

# BigIdea name → skeleton node id (§7.4). Derived from syllabus_skeleton.json,
# but the id scheme is stable so we keep a fast local map as a fallback.
BIG_IDEA_ID_MAP = {
    "Conservation laws": "bigidea-conservation",
    "Energy & energy transfer": "bigidea-energy",
    "Waves transfer energy without net matter transfer": "bigidea-waves",
    "Modeling & idealization": "bigidea-modeling",
    "Macro-micro correspondence": "bigidea-macro-micro",
    "Measurement & uncertainty": "bigidea-measurement",
}


def split_chapters(text: str) -> list[tuple[str, str, str]]:
    """Split notes into (chapter_id, chapter_name, body) tuples.

    Returns chapter_id using the canonical topic-chNN form: CH1 → topic-ch01,
    Topic 2 → topic-ch02, etc.
    """
    lines = text.splitlines()
    chapters: list[tuple[str, str, str]] = []
    current_id: str | None = None
    current_name: str | None = None
    current_lines: list[str] = []

    def flush() -> None:
        if current_id is not None:
            body = "\n".join(current_lines).strip()
            chapters.append((current_id, current_name or current_id, body))

    for line in lines:
        m = _HEADING_RE.match(line.strip())
        if m:
            flush()
            raw = m.group(1)
            current_name = m.group(2).strip()
            current_id = to_topic_id(raw)
            current_lines = []
        else:
            if current_id is not None:
                current_lines.append(line)

    flush()
    return chapters


def to_topic_id(raw: str) -> str:
    """CH1 → topic-ch01, Topic 2 → topic-ch02, etc."""
    if raw.startswith("CH"):
        num = int(raw[2:])
    else:
        num = int(raw.split()[1])
    return f"topic-ch{num:02d}"


def load_cache() -> dict[str, dict[str, Any]]:
    if CACHE_PATH.exists():
        try:
            return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Failed to read cache %s: %s — ignoring", CACHE_PATH, exc)
    return {}


def save_cache(cache: dict[str, dict[str, Any]]) -> None:
    CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")


async def run(only: str | None = None) -> None:
    # 1. Read inputs.
    note_text = NOTE_PATH.read_text(encoding="utf-8")
    skeleton = json.loads(SKELETON_PATH.read_text(encoding="utf-8"))

    chapters = split_chapters(note_text)
    logger.info("Split %d chapters", len(chapters))
    for cid, name, body in chapters:
        logger.info("  %s  %-32s %4d chars", cid, name, len(body))

    if only:
        chapters = [(cid, name, body) for cid, name, body in chapters if cid == only]
        if not chapters:
            logger.error("Chapter %s not found. Aborting.", only)
            sys.exit(1)

    # 2. Build the extractor.
    config = AppConfig()
    provider = config.llm_provider
    logger.info("Using LLM provider: %s", provider)
    client = create_llm_client(config)
    extractor = GraphExtractor(client, provider=provider)

    cache = load_cache()

    # 3. Extract each chapter (resume from cache).
    extractions: dict[str, dict[str, Any]] = {}
    try:
        for cid, name, body in chapters:
            if cid in cache:
                logger.info("Cache hit %s (%d entities, %d relations)",
                            cid, len(cache[cid].get("entities", [])), len(cache[cid].get("relations", [])))
                extractions[cid] = cache[cid]
                continue
            logger.info("Extracting %s (%s)...", cid, name)
            result = await extractor.extract_chapter(cid, name, body)
            payload = {
                "chapter_id": cid,
                "entities": [e.to_dict() for e in result.entities],
                "relations": [r.to_dict() for r in result.relations],
            }
            extractions[cid] = payload
            cache[cid] = payload
            save_cache(cache)
    finally:
        await client.close()

    # 4. Merge: skeleton entities + extracted entities + expanded edges.
    merged_entities: list[dict[str, Any]] = list(skeleton.get("entities", []))
    merged_relations: list[dict[str, Any]] = list(skeleton.get("relations", []))

    entity_by_id: dict[str, dict[str, Any]] = {}
    for e in merged_entities:
        entity_by_id[e["id"]] = e

    for cid, payload in extractions.items():
        for e in payload.get("entities", []):
            eid = e["id"]
            existing = entity_by_id.get(eid)
            if existing is None:
                merged_entities.append(e)
                entity_by_id[eid] = e
            else:
                # Slug conflict → overwrite definition/expression but keep skeleton fields.
                for k, v in e.items():
                    if k not in ("id",):
                        existing[k] = v
        for r in payload.get("relations", []):
            merged_relations.append(r)

    # 5. Expand exemplifies → EXEMPLIFIES edges.
    for e in merged_entities:
        labels = e.pop("exemplifies", None)
        if not labels:
            continue
        for label in labels:
            target = BIG_IDEA_ID_MAP.get(label)
            if target is None:
                logger.warning("Unknown big idea label %r on %s", label, e.get("id"))
                continue
            merged_relations.append({
                "source": e["id"],
                "target": target,
                "type": "EXEMPLIFIES",
            })

    # 6. Post-process: fix known LLM direction errors (data-driven corrections).
    merged_relations = fix_relation_directions(merged_relations)

    output = {"entities": merged_entities, "relations": merged_relations}
    OUTPUT_PATH.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    logger.info("Wrote %s (%d entities, %d relations)", OUTPUT_PATH, len(merged_entities), len(merged_relations))

    # 6. Validate by loading into KnowledgeGraph.
    g = KnowledgeGraph(OUTPUT_PATH)
    print(f"\n=== Validation ===")
    print(f"node_count = {g.node_count}")
    print(f"edge_count = {g.edge_count}")
    print(f"output       = {OUTPUT_PATH}")


# Edge direction fixes. The LLM sometimes emits a dependency backwards: "X -> Y"
# meaning "X depends on Y" instead of "Y depends on X". Each entry is the WRONG
# (source, target) direction as emitted by the LLM; on a match we flip it.
_REVERSED_PREREQ: set[tuple[str, str]] = {
    # "combining uncertainties" depends on the uncertainty types, not vice versa.
    ("combining-uncertainties", "absolute-uncertainty"),
    ("combining-uncertainties", "fractional-uncertainty"),
    ("combining-uncertainties", "percentage-uncertainty"),
    # Projectile motion depends on SUVAT equations.
    ("projectile-motion", "suvat-equations"),
    # Weight (W = mg) depends on the uniform gravitational field g.
    ("weight", "uniform-gravitational-field"),
    # The formula F = mg depends on the concept of weight.
    ("f-mg", "weight"),
    # Efficiency depends on the concept of energy.
    ("efficiency", "energy"),
    # The conservation principle depends on the concept of energy.
    ("principle-of-conservation-of-energy", "energy"),
    # Power depends on work.
    ("power", "work"),
}

# REQUIRES_SKILL reversals: "Skill -> Concept" when the concept actually requires
# the skill to be applied. Entries are the WRONG direction emitted by the LLM.
_REVERSED_REQUIRES_SKILL: set[tuple[str, str]] = {
    ("resolve-forces-into-components", "equilibrium"),
    ("draw-scale-diagram-for-equilibrium", "equilibrium"),
    ("plot-stress-strain-graph", "young-modulus"),
    ("calculate-elastic-strain-energy-from-graph", "elastic-strain-energy"),
    ("calculate-total-resistance", "series-circuit"),
    ("calculate-total-resistance", "parallel-circuit"),
    ("measure-emf", "e-m-f"),
    ("apply-kirchhoffs-laws", "kirchhoffs-first-law"),
    ("apply-kirchhoffs-laws", "kirchhoffs-second-law"),
    ("use-potential-divider", "potential-divider"),
    ("perform-null-measurement", "null-measurement"),
}


def fix_relation_directions(relations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Repair known backwards PREREQUISITE_OF / REQUIRES_SKILL edges.

    Each set holds the WRONG (source, target) as emitted by the LLM; on match we
    swap source/target back to the correct direction.
    """
    fixed = 0
    out: list[dict[str, Any]] = []
    for r in relations:
        rtype = r.get("type")
        pair = (r.get("source"), r.get("target"))
        if rtype == "PREREQUISITE_OF" and pair in _REVERSED_PREREQ:
            r = {"source": pair[1], "target": pair[0], "type": rtype}
            logger.info("Flipped reversed PREREQUISITE_OF: %s -> %s", r["source"], r["target"])
            fixed += 1
        elif rtype == "REQUIRES_SKILL" and pair in _REVERSED_REQUIRES_SKILL:
            r = {"source": pair[1], "target": pair[0], "type": rtype}
            logger.info("Flipped reversed REQUIRES_SKILL: %s -> %s", r["source"], r["target"])
            fixed += 1
        out.append(r)
    if fixed:
        logger.info("Fixed %d reversed edge(s)", fixed)
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="AS Physics notes → knowledge graph")
    parser.add_argument("--only", type=str, default=None, help="Extract a single chapter id (e.g. topic-ch02)")
    args = parser.parse_args()
    asyncio.run(run(only=args.only))


if __name__ == "__main__":
    main()
