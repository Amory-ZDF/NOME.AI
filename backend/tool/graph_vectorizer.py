"""GraphVectorStore — persistent Chroma index over the knowledge graph.

The semantic counterpart to :class:`KnowledgeGraph` (which does exact-id
traversal). It stores one embedding per entity, keyed by entity id, so the
agent can retrieve nodes by *meaning* — e.g. "which concepts cover force and
acceleration" — rather than by exact slug.

This module is pure/deterministic: it reads and writes the Chroma collection
but never calls an LLM. Embeddings are computed by the offline
``scripts/vectorize_graph.py`` pipeline (which talks to the Qwen
``/embeddings`` API) and persisted here.

Layout::

    data/
    ├── as_physics_graph.json      # source of truth (entities + relations)
    └── as_physics_embeddings/     # Chroma persistent dir (built + rebuildable)
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import chromadb
from chromadb.config import Settings

logger = logging.getLogger(__name__)

# One Chroma collection per graph. Name is stable so rebuilds reuse the dir.
DEFAULT_COLLECTION = "as_physics"


def entity_text(entity: dict[str, Any]) -> str:
    """Build the searchable text embedded for one entity.

    The ``name`` carries the label; ``definition`` the semantics; ``expression``
    (Formula only) the symbolic form. Join with a separator so the embedding
    sees all three without ambiguity.
    """
    parts = [str(entity.get("name", "")).strip()]
    definition = str(entity.get("definition", "") or "").strip()
    if definition:
        parts.append(definition)
    expression = str(entity.get("expression", "") or "").strip()
    if expression:
        parts.append(expression)
    return " | ".join(p for p in parts if p)


def entity_metadata(entity: dict[str, Any]) -> dict[str, str]:
    """Flatten an entity into Chroma-safe metadata (strings only, no None).

    Chroma rejects None / nested values, so absent fields are dropped rather
    than stored as null.
    """
    meta: dict[str, str] = {
        "name": str(entity.get("name", "")),
        "type": str(entity.get("type", "")),
    }
    for key in ("definition", "expression"):
        value = entity.get(key)
        if value:
            meta[key] = str(value)
    return meta


class GraphVectorStore:
    """Thin Chroma wrapper over the vectorized knowledge graph.

    Query-time API (used later by the agent):
        - ``query(vectors, n_results)`` → top-k entities by cosine similarity
        - ``get(ids)`` → entities by id
        - ``count`` → number of indexed entities

    Build-time API (used by scripts/vectorize_graph.py):
        - ``upsert(ids, embeddings, metadatas, documents)``
        - ``reset()`` → drop the collection for an idempotent rebuild
    """

    def __init__(
        self,
        persist_dir: Path | str,
        collection: str = DEFAULT_COLLECTION,
    ) -> None:
        self._client = chromadb.PersistentClient(
            path=str(Path(persist_dir).resolve()),
            settings=Settings(anonymized_telemetry=False),
        )
        self._collection = self._client.get_or_create_collection(
            name=collection,
            metadata={"hnsw:space": "cosine"},
        )

    # ---- Build-time -------------------------------------------------------

    def upsert(
        self,
        ids: list[str],
        embeddings: list[list[float]],
        metadatas: list[dict[str, str]],
        documents: list[str],
    ) -> None:
        if not ids:
            return
        self._collection.upsert(
            ids=ids,
            embeddings=embeddings,
            metadatas=metadatas,
            documents=documents,
        )

    def reset(self) -> None:
        """Drop and recreate the collection — start a rebuild from scratch."""
        name = self._collection.name
        self._client.delete_collection(name)
        self._collection = self._client.get_or_create_collection(
            name=name,
            metadata={"hnsw:space": "cosine"},
        )
        logger.info("Reset collection %r", name)

    # ---- Query-time -------------------------------------------------------

    @property
    def count(self) -> int:
        return self._collection.count()

    def query(
        self,
        query_embeddings: list[list[float]],
        n_results: int = 5,
    ) -> list[list[dict[str, Any]]]:
        """Return top-k matches per query vector.

        Each match is {id, name, type, distance, ...extra fields}. The result
        is a list (one per query) of ranked match dicts.
        """
        if not query_embeddings:
            return []
        raw = self._collection.query(
            query_embeddings=query_embeddings,
            n_results=n_results,
            include=["metadatas", "documents", "distances"],
        )
        out: list[list[dict[str, Any]]] = []
        ids_batch = raw.get("ids", [])
        metadatas_batch = raw.get("metadatas", [])
        documents_batch = raw.get("documents", [])
        distances_batch = raw.get("distances", [])

        for i in range(len(ids_batch)):
            matches: list[dict[str, Any]] = []
            for j, node_id in enumerate(ids_batch[i]):
                meta = (metadatas_batch[i] or [{}])[j] if i < len(metadatas_batch) else {}
                doc = (documents_batch[i] or [""])[j] if i < len(documents_batch) else ""
                dist = (distances_batch[i] or [None])[j] if i < len(distances_batch) else None
                matches.append(
                    {
                        "id": node_id,
                        "name": meta.get("name", ""),
                        "type": meta.get("type", ""),
                        "distance": dist,
                        "text": doc,
                        **{k: v for k, v in meta.items() if k not in ("name", "type")},
                    }
                )
            out.append(matches)
        return out

    def get(self, ids: list[str]) -> list[dict[str, Any]]:
        """Fetch entities by id (for resolving query hits back to nodes)."""
        if not ids:
            return []
        raw = self._collection.get(ids=ids, include=["metadatas", "documents"])
        out: list[dict[str, Any]] = []
        for node_id, meta, doc in zip(raw.get("ids", []), raw.get("metadatas", []), raw.get("documents", [])):
            out.append(
                {
                    "id": node_id,
                    "name": meta.get("name", ""),
                    "type": meta.get("type", ""),
                    "text": doc,
                    **{k: v for k, v in meta.items() if k not in ("name", "type")},
                }
            )
        return out
