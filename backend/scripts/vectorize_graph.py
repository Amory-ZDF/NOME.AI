"""Offline script: knowledge graph JSON → Chroma vector index.

Pipeline:
    1. Read data/as_physics_graph.json (entities).
    2. For each entity, build a searchable text (name + definition + expression).
    3. Embed every text via the Qwen /embeddings API (batched).
    4. Upsert ids/embeddings/metadatas/documents into a persistent Chroma store.
    5. Sanity-check with a few semantic queries.

Usage (from backend/):
    python -m scripts.vectorize_graph
    python -m scripts.vectorize_graph --reset    # force full rebuild
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
from pathlib import Path

from app.config import AppConfig  # noqa: E402
from core.llm_client import create_llm_client  # noqa: E402
from tool.graph_vectorizer import (  # noqa: E402
    GraphVectorStore,
    entity_metadata,
    entity_text,
)

BACKEND_ROOT = Path(__file__).resolve().parent.parent

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("vectorize_graph")

DATA_DIR = BACKEND_ROOT / "data"
GRAPH_PATH = DATA_DIR / "as_physics_graph.json"
VECTOR_DIR = DATA_DIR / "as_physics_embeddings"

BATCH_SIZE = 10  # Qwen /embeddings caps batch input at 10


def load_entities() -> list[dict]:
    data = json.loads(GRAPH_PATH.read_text(encoding="utf-8"))
    return data.get("entities", [])


async def run(reset: bool = False) -> None:
    entities = load_entities()
    logger.info("Loaded %d entities from %s", len(entities), GRAPH_PATH.name)

    config = AppConfig()
    provider = "qwen"  # embeddings always via Qwen (DeepSeek has no endpoint)
    embedding_model = config.qwen_embedding_model
    logger.info("Embedding via %s/%s", provider, embedding_model)

    store = GraphVectorStore(VECTOR_DIR)
    if reset or store.count > 0:
        store.reset()

    client = create_llm_client(config)

    ids: list[str] = []
    texts: list[str] = []
    metadatas: list[dict[str, str]] = []
    for e in entities:
        ids.append(e["id"])
        texts.append(entity_text(e))
        metadatas.append(entity_metadata(e))

    try:
        embeddings = await client.embed_many(
            provider, texts, model=embedding_model, batch_size=BATCH_SIZE
        )
    finally:
        await client.close()

    if len(embeddings) != len(ids):
        raise RuntimeError(
            f"Embedding count mismatch: got {len(embeddings)} for {len(ids)} entities"
        )

    store.upsert(ids=ids, embeddings=embeddings, metadatas=metadatas, documents=texts)
    logger.info("Indexed %d entities into %s", store.count, VECTOR_DIR)

    # ---- Sanity check -----------------------------------------------------
    print("\n=== Semantic sanity check ===")
    probes = [
        "What links force to acceleration?",
        "uncertainty when adding and subtracting measurements",
        "the law that relates voltage current and resistance",
    ]
    # Re-open the client briefly to embed the probe queries.
    client = create_llm_client(config)
    try:
        probe_vecs = await client.embed_many(
            provider, probes, model=embedding_model
        )
    finally:
        await client.close()

    for probe, vec in zip(probes, probe_vecs):
        hits = store.query([vec], n_results=3)[0]
        print(f"\nQ: {probe}")
        for h in hits:
            print(f"  {h['distance']:.4f}  [{h['type']}] {h['id']:<32} {h['name']}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Knowledge graph → Chroma vectors")
    parser.add_argument("--reset", action="store_true", help="Force a full rebuild")
    args = parser.parse_args()
    asyncio.run(run(reset=args.reset))


if __name__ == "__main__":
    main()
