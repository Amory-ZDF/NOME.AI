"""FastAPI application entry point.

Lifespan:
    Startup: load config, init LLM client, load knowledge graph,
             init memory store + retriever, create orchestrator.
    Shutdown: close LLM client connections.
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.config import AppConfig
from core.llm_client import create_llm_client, LLMClient
from memory.store import MemoryStore
from memory.pg_store import PgStore
from memory.retriever import MemoryRetriever
from tool.knowledge_graph import KnowledgeGraph
from agent.orchestrator import Orchestrator
from profile.store import InsightStore
from profile.agent import ProfileAgent

logger = logging.getLogger(__name__)

# ---- Global singletons (initialised at startup) ----
config: AppConfig | None = None
llm_client: LLMClient | None = None
knowledge_graph: KnowledgeGraph | None = None
memory_store: MemoryStore | None = None
memory_retriever: MemoryRetriever | None = None
orchestrator: Orchestrator | None = None
insight_store: InsightStore | None = None
profile_agent: ProfileAgent | None = None
_profile_task: asyncio.Task | None = None

# Background profile loop cadence (demo; production → APScheduler).
PROFILE_INTERVAL_SECONDS = 60.0


async def _profile_loop() -> None:
    """Periodic long-term-memory sync: re-aggregate profiles + emit reports."""
    while True:
        try:
            if profile_agent is not None:
                await profile_agent.periodic()
        except Exception:  # noqa: BLE001 — a failed tick must not kill the loop
            logger.exception("profile periodic loop error")
        await asyncio.sleep(PROFILE_INTERVAL_SECONDS)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown lifecycle."""
    global config, llm_client, knowledge_graph
    global memory_store, memory_retriever, orchestrator
    global insight_store, profile_agent, _profile_task

    # ---- Startup ----
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )

    config = AppConfig()
    logger.info("Config loaded. Providers: %s", list(config.providers.keys()))
    logger.info("Default provider: %s", config.llm_provider)

    llm_client = create_llm_client(config)
    logger.info("LLM client initialised")

    knowledge_graph = KnowledgeGraph(config.knowledge_graph_path)
    logger.info("Knowledge graph loaded: %d nodes, %d edges",
                knowledge_graph.node_count, knowledge_graph.edge_count)

    memory_store = MemoryStore()
    if config.database_url:
        pg_store = PgStore(config.database_url)
        try:
            await pg_store.connect()
            memory_store = pg_store
            logger.info("Memory store initialised (Postgres, half-life: %.1f days)",
                        config.memory_half_life_days)
        except Exception as exc:
            logger.error(
                "Postgres memory store unavailable (%s); "
                "falling back to in-memory store",
                exc,
            )
    else:
        logger.info("Memory store initialised (in-memory, half-life: %.1f days)",
                    config.memory_half_life_days)
    memory_retriever = MemoryRetriever(memory_store, config.memory_half_life_days)

    orchestrator = Orchestrator(
        llm_client,
        config.llm_provider,
        knowledge_graph=knowledge_graph,
        memory_retriever=memory_retriever,
    )
    logger.info("Orchestrator initialised")

    # Long-term memory / student-profile layer.
    # InsightStore persists to the SAME Postgres DB as memory_records when
    # DATABASE_URL is set; the Teacher-Backend reads these tables directly.
    insight_store = InsightStore(config.database_url) if config.database_url else None
    if insight_store is not None:
        try:
            await insight_store.connect()
        except Exception as exc:
            logger.error("InsightStore unavailable (%s); profile layer disabled", exc)
            insight_store = None

    if insight_store is not None:
        profile_agent = ProfileAgent(
            llm_client,
            config.llm_provider,
            insight_store,
            llm_enabled=True,
        )
        _profile_task = asyncio.create_task(_profile_loop())
        logger.info("Profile agent + background loop started")
    else:
        logger.info("Profile layer disabled (no database)")

    yield

    # ---- Shutdown ----
    if _profile_task is not None:
        _profile_task.cancel()
        try:
            await _profile_task
        except asyncio.CancelledError:
            pass
    if insight_store is not None:
        await insight_store.close()
    if llm_client is not None:
        await llm_client.close()
        logger.info("LLM client closed")
    if isinstance(memory_store, PgStore):
        await memory_store.close()


app = FastAPI(
    title="NOME.AI Backend",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — allow frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    """Health check — returns service status."""
    status = "ok"
    details = {
        "llm": "ready" if llm_client is not None else "missing",
        "graph": f"{knowledge_graph.node_count} nodes" if knowledge_graph else "missing",
        "memory": "ready" if memory_store is not None else "missing",
        "orchestrator": "ready" if orchestrator is not None else "missing",
        "profile": "ready" if profile_agent is not None else "missing",
    }

    if orchestrator is None:
        status = "degraded"

    return {"status": status, "details": details, "version": "0.1.0"}


# ---- Router registration ----
# This backend is the AI Agent service. CRUD endpoints (tasks, notes, errors,
# settings, bootstrap, sessions storage, materials, etc.) are owned by the
# TypeScript Student-Backend (Fastify + Prisma, port 3001).

# Agent (AI pipeline — real implementation)
from app.routers.student import agent as agent_router
app.include_router(agent_router.router, prefix="/api")

# Knowledge-graph interactive demo (single-file HTML page, served same-origin
# so the page can call /api/agent/graph-chat without CORS).
import pathlib
_DEMO_STATIC = pathlib.Path(__file__).resolve().parent.parent / "static"


@app.get("/graph-demo", include_in_schema=False)
async def graph_demo():
    return FileResponse(_DEMO_STATIC / "graph-demo.html")
