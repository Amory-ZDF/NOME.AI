"""KnowledgeGraph — graph traversal over a curated knowledge tree.

The KnowledgeGraph is the in-memory graph engine that the KnowledgeFramework
skill queries for prerequisite chains, related concepts, and weak-link detection.

Backends are swappable (JSON → Neo4j → GraphRAG) — the interface stays the same.

Current: in-memory adjacency list. Loads from data/as_physics_graph.json at startup,
with support for programmatic node/edge addition (for testing and seeding).
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Edge types (mirrors data/as_physics_graph.json)
EDGE_PREREQUISITE_OF = "PREREQUISITE_OF"
EDGE_REQUIRES_SKILL = "REQUIRES_SKILL"
EDGE_CONTRASTED_WITH = "CONTRASTED_WITH"
EDGE_BELONGS_TO = "BELONGS_TO"
EDGE_EXEMPLIFIES = "EXEMPLIFIES"


class KnowledgeGraph:
    """In-memory knowledge graph. Swappable for Neo4j / GraphRAG later."""

    def __init__(self, graph_path: Path | str | None = None) -> None:
        self._nodes: dict[str, dict[str, Any]] = {}
        # adjacency: node_id → list of (target_id, edge_type)
        self._adj_out: dict[str, list[tuple[str, str]]] = {}
        self._adj_in: dict[str, list[tuple[str, str]]] = {}

        if graph_path is not None:
            self._load(Path(graph_path))

    # ------------------------------------------------------------------
    # Basic queries
    # ------------------------------------------------------------------

    def get_node(self, node_id: str) -> dict[str, Any] | None:
        return self._nodes.get(node_id)

    def list_nodes(self, node_type: str | None = None) -> list[dict[str, Any]]:
        if node_type is None:
            return list(self._nodes.values())
        return [n for n in self._nodes.values() if n.get("type") == node_type]

    @property
    def node_count(self) -> int:
        return len(self._nodes)

    @property
    def edge_count(self) -> int:
        return sum(len(edges) for edges in self._adj_out.values())

    def list_edges(self) -> list[dict[str, Any]]:
        """All edges as {source, target, type} — for rendering the full graph."""
        edges: list[dict[str, Any]] = []
        for source, targets in self._adj_out.items():
            for target, edge_type in targets:
                edges.append({"source": source, "target": target, "type": edge_type})
        return edges

    # ------------------------------------------------------------------
    # Traversal
    # ------------------------------------------------------------------

    def get_prerequisites(self, node_id: str) -> list[dict[str, Any]]:
        """Direct prerequisite nodes (1-hop upstream).

        Follows PREREQUISITE_OF and REQUIRES_SKILL edges in reverse:
        if A → B (PREREQUISITE_OF), then B depends on A.
        """
        prereqs: list[dict[str, Any]] = []
        for source_id, edge_type in self._adj_in.get(node_id, []):
            if edge_type in (EDGE_PREREQUISITE_OF, EDGE_REQUIRES_SKILL):
                node = self._nodes.get(source_id)
                if node:
                    prereqs.append(node)
        return prereqs

    def get_prerequisite_chain(self, node_id: str) -> list[dict[str, Any]]:
        """Full prerequisite tree — BFS upstream to roots.

        Returns nodes ordered by depth (1 = direct prereq, 2 = prereq of prereq, etc.),
        each with an added 'depth' field.
        """
        if node_id not in self._nodes:
            return []

        visited: set[str] = {node_id}
        result: list[dict[str, Any]] = []
        # queue: (node_id, depth)
        queue: list[tuple[str, int]] = [(node_id, 0)]

        while queue:
            current_id, depth = queue.pop(0)

            for source_id, edge_type in self._adj_in.get(current_id, []):
                if edge_type not in (EDGE_PREREQUISITE_OF, EDGE_REQUIRES_SKILL):
                    continue
                if source_id in visited:
                    continue

                visited.add(source_id)
                node = dict(self._nodes.get(source_id, {}))
                node["depth"] = depth + 1
                result.append(node)
                queue.append((source_id, depth + 1))

        return result

    def get_related(self, node_id: str) -> list[dict[str, Any]]:
        """Nodes connected by CONTRASTED_WITH edges (commonly-confused concepts).

        These are bidirectional — we check both outgoing and incoming.
        """
        related: list[dict[str, Any]] = []
        seen: set[str] = set()

        for edge_set in (self._adj_out.get(node_id, []), self._adj_in.get(node_id, [])):
            for other_id, edge_type in edge_set:
                if edge_type == EDGE_CONTRASTED_WITH:
                    if other_id not in seen:
                        node = self._nodes.get(other_id)
                        if node:
                            related.append(node)
                            seen.add(other_id)
        return related

    def get_siblings(self, node_id: str) -> list[dict[str, Any]]:
        """Sibling nodes — concepts that belong to the same topic chapter.

        Follows BELONGS_TO edges up to the parent topic, then back down to
        every other node that also belongs to that topic.
        """
        siblings: list[dict[str, Any]] = []
        seen: set[str] = {node_id}

        parents = [
            target_id
            for target_id, edge_type in self._adj_out.get(node_id, [])
            if edge_type == EDGE_BELONGS_TO
        ]
        for parent_id in parents:
            for source_id, edge_type in self._adj_in.get(parent_id, []):
                if edge_type != EDGE_BELONGS_TO:
                    continue
                if source_id in seen:
                    continue
                node = self._nodes.get(source_id)
                if node:
                    siblings.append(node)
                    seen.add(source_id)
        return siblings

    def get_children(self, node_id: str) -> list[dict[str, Any]]:
        """Downstream nodes — who depends on this node?

        Follows PREREQUISITE_OF and REQUIRES_SKILL edges forward.
        """
        children: list[dict[str, Any]] = []
        for target_id, edge_type in self._adj_out.get(node_id, []):
            if edge_type in (EDGE_PREREQUISITE_OF, EDGE_REQUIRES_SKILL):
                node = self._nodes.get(target_id)
                if node:
                    children.append(node)
        return children

    # ------------------------------------------------------------------
    # Weakness detection
    # ------------------------------------------------------------------

    def find_weak_links(
        self,
        node_id: str,
        node_states: dict[str, float],
        threshold: float = 0.6,
    ) -> list[dict[str, Any]]:
        """BFS upward — collect nodes with mastery < threshold.

        Returns list of {node_id, node_name, depth, mastery, type}.
        """
        chain = self.get_prerequisite_chain(node_id)
        weak: list[dict[str, Any]] = []
        for node in chain:
            nid = node.get("id", "")
            mastery = node_states.get(nid, 0.0)
            if mastery < threshold:
                weak.append({
                    "node_id": nid,
                    "node_name": node.get("name", nid),
                    "depth": node.get("depth", 1),
                    "mastery": mastery,
                    "type": node.get("type", ""),
                })
        # Sort: closest and weakest first
        weak.sort(key=lambda x: (x["depth"], x["mastery"]))
        return weak

    # ------------------------------------------------------------------
    # Mutation (for seeding, testing, future admin API)
    # ------------------------------------------------------------------

    def add_node(self, node_id: str, name: str, node_type: str = "topic", **kwargs: Any) -> None:
        self._nodes[node_id] = {"id": node_id, "name": name, "type": node_type, **kwargs}
        self._adj_out.setdefault(node_id, [])
        self._adj_in.setdefault(node_id, [])

    def add_edge(self, source_id: str, target_id: str, edge_type: str) -> None:
        """Add a directed edge: source → target."""
        if source_id not in self._nodes or target_id not in self._nodes:
            raise ValueError(
                f"Cannot add edge {source_id} --[{edge_type}]--> {target_id}: "
                f"one or both nodes missing"
            )
        self._adj_out.setdefault(source_id, []).append((target_id, edge_type))
        self._adj_in.setdefault(target_id, []).append((source_id, edge_type))

    def remove_node(self, node_id: str) -> None:
        """Remove a node and all its edges."""
        self._nodes.pop(node_id, None)

        # Remove outgoing edges + back-references
        for target_id, _ in self._adj_out.pop(node_id, []):
            self._adj_in[target_id] = [
                (s, et) for s, et in self._adj_in.get(target_id, []) if s != node_id
            ]

        # Remove incoming edges + forward-references
        for source_id, _ in self._adj_in.pop(node_id, []):
            self._adj_out[source_id] = [
                (t, et) for t, et in self._adj_out.get(source_id, []) if t != node_id
            ]

    # ------------------------------------------------------------------
    # Internal: JSON loading
    # ------------------------------------------------------------------

    def _load(self, path: Path) -> None:
        """Load from a JSON file.

        Expected format:
        {
          "entities": [
            {"id": "kin-01", "name": "Kinematics Basics", "type": "topic", ...}
          ],
          "relations": [
            {"source": "kin-01", "target": "kin-02", "type": "PREREQUISITE_OF"}
          ]
        }
        """
        if not path.exists():
            logger.warning("Knowledge graph file not found: %s", path)
            return

        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Failed to read knowledge graph: %s", exc)
            return

        for entity in data.get("entities", []):
            node_id = entity.pop("id", None)
            if not node_id:
                continue
            self._nodes[node_id] = {"id": node_id, **entity}
            self._adj_out.setdefault(node_id, [])
            self._adj_in.setdefault(node_id, [])

        for rel in data.get("relations", []):
            source = rel.get("source")
            target = rel.get("target")
            edge_type = rel.get("type", EDGE_PREREQUISITE_OF)
            if source and target and source in self._nodes and target in self._nodes:
                self._adj_out[source].append((target, edge_type))
                self._adj_in[target].append((source, edge_type))

        logger.info(
            "Loaded knowledge graph: %d nodes, %d edges",
            self.node_count,
            self.edge_count,
        )
