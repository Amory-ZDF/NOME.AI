"""FastAPI application entry point.

Lifespan:
    Startup: load config, init LLM client, load knowledge graph,
             init memory store + retriever, create orchestrator.
    Shutdown: close LLM client connections.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import AppConfig
from core.llm_client import create_llm_client, LLMClient
from memory.store import MemoryStore
from memory.retriever import MemoryRetriever
from tool.knowledge_graph import KnowledgeGraph
from agent.orchestrator import Orchestrator

logger = logging.getLogger(__name__)

# ---- Global singletons (initialised at startup) ----
config: AppConfig | None = None
llm_client: LLMClient | None = None
knowledge_graph: KnowledgeGraph | None = None
memory_store: MemoryStore | None = None
memory_retriever: MemoryRetriever | None = None
orchestrator: Orchestrator | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown lifecycle."""
    global config, llm_client, knowledge_graph
    global memory_store, memory_retriever, orchestrator

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
    memory_retriever = MemoryRetriever(memory_store, config.memory_half_life_days)
    logger.info(
        "Memory store initialised (in-memory, half-life: %.1f days)",
        config.memory_half_life_days,
    )

    orchestrator = Orchestrator(llm_client, config.llm_provider)
    logger.info("Orchestrator initialised")

    yield

    # ---- Shutdown ----
    if llm_client is not None:
        await llm_client.close()
        logger.info("LLM client closed")


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
