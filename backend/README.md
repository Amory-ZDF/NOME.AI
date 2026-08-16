# NOME.AI Backend

Python backend for the NOME.AI tutoring platform — agent-driven progressive hints,
error diagnosis, and knowledge framework analysis for A-Level Physics.

## Directory Map

```
backend/
├── app/                    FastAPI application (routers, models, config)
│   ├── main.py             Entry point, lifespan, CORS
│   ├── config.py           All environment variables and settings
│   ├── models/             Pydantic domain models (REST contract)
│   └── routers/
│       ├── student/        Student-side API endpoints
│       │   └── agent.py    Agent router — hint, diagnose, analyze
│       └── teacher/        Teacher-side API (placeholder)
│
├── agent/                  Agent orchestration
│   ├── orchestrator.py     Plan → Execute → Aggregate
│   └── planner.py          LLM-driven execution planning
│
├── core/                   Shared infrastructure
│   ├── llm_client.py       OpenAI-compatible adapter (Qwen + DeepSeek)
│   └── types.py            Agent-internal dataclasses and enums
│
├── skill/                  Agent skills (each calls LLM)
│   ├── progressive_hint.py Generate next hint layer (L1-L5)
│   ├── error_diagnosis.py  Classify mistake (7 error types)
│   └── knowledge_framework.py  Trace weak prerequisites
│
├── tool/                   Deterministic tools (no LLM)
│   ├── knowledge_graph.py  Graph traversal (JSON → Neo4j/GraphRAG)
│   └── graph_vectorizer.py Chroma vector index over the graph
│
├── memory/                 Long-term memory
│   ├── models.py           MemoryRecord dataclass
│   ├── store.py            Pluggable persistence (in-memory default)
│   └── retriever.py        Decay-weighted retrieval
│
├── prompts/                All LLM prompt templates
│   ├── hint_templates.py   6-layer hint system prompts + few-shot
│   ├── diagnosis_templates.py  Error classification prompts
│   └── framework_templates.py  Evidence-chain explanation prompts
│
├── data/                   Static data
│   ├── as_physics_graph.json      LLM-extracted AS-Level Physics knowledge graph
│   └── as_physics_embeddings/     Chroma vector index (regenerable)
│
└── tests/                  Test suite
    ├── skill/              Per-skill tests
    ├── agent/              Orchestrator tests
    └── memory/             Memory/retrieval tests
```

## Quick Start

```bash
cd backend
pip install -e ".[dev]"

# Copy and edit environment variables
cp .env.example .env

# Run the server
uvicorn app.main:app --reload --port 8000
```

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `DEEPSEEK_API_KEY` | DeepSeek API key | (required) |
| `DEEPSEEK_BASE_URL` | DeepSeek base URL | `https://api.deepseek.com/v1` |
| `DEEPSEEK_MODEL` | Default DeepSeek model | `deepseek-chat` |
| `QWEN_API_KEY` | Qwen (DashScope) API key | (required) |
| `QWEN_BASE_URL` | DashScope base URL | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| `QWEN_MODEL` | Default Qwen model | `qwen-plus` |
| `LLM_PROVIDER` | Default provider name | `deepseek` |
| `LLM_TEMPERATURE` | LLM temperature | `0.3` |
| `QWEN_EMBEDDING_MODEL` | Qwen embeddings model for graph vectorization | `text-embedding-v3` |
| `MEMORY_HALF_LIFE_DAYS` | Decay half-life for memory | `21` |

## Build Order (recommended)

1. **core/llm_client.py** — get LLM calls working first
2. **prompts/hint_templates.py** — write the 6-layer prompt templates
3. **skill/progressive_hint.py** — first working skill
4. **prompts/diagnosis_templates.py** — error classification prompts
5. **skill/error_diagnosis.py** — second skill
6. **data/as_physics_graph.json** — LLM-extracted AS-Level Physics knowledge graph
7. **tool/knowledge_graph.py** — graph traversal (JSON or Graph RAG)
8. **prompts/framework_templates.py** — evidence-chain prompts
9. **skill/knowledge_framework.py** — third skill
10. **agent/planner.py** — LLM execution planning
11. **agent/orchestrator.py** — wire everything together
12. **memory/** — store + retriever (can be done in parallel with skills)
13. **app/routers/student/agent.py** — HTTP endpoints
14. **app/main.py** — wire up lifespan and router registration

Skills 1-3 can be built and tested in isolation (no orchestrator, no HTTP).
The orchestrator ties them together. Memory can be built in parallel.

## Knowledge Graph → Vector Index

The AS Physics knowledge graph is stored as JSON (`data/as_physics_graph.json`)
and has a semantic twin: a Chroma vector index over every entity
(`data/as_physics_embeddings/`). The JSON powers exact-id traversal
(`tool/knowledge_graph.py`); the vectors power meaning-based retrieval
(`tool/graph_vectorizer.py`).

Rebuild the vector index (needs a valid `QWEN_API_KEY`):

```bash
python -m scripts.vectorize_graph          # incremental (skips if up-to-date)
python -m scripts.vectorize_graph --reset  # force full rebuild
```

Embeddings are computed via Qwen `text-embedding-v3` (1024-dim, cosine) — DeepSeek
has no `/embeddings` endpoint, so vectorization always uses Qwen.
