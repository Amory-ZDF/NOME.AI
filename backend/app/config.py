"""Application configuration — single source of truth for all settings.

All environment variables are read here and nowhere else.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Project root — backend/
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Load .env from project root (backend/.env)
_load_result = load_dotenv(PROJECT_ROOT / ".env", override=False)


# ---------------------------------------------------------------------------
# LLM Provider configuration
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class ProviderConfig:
    """Immutable config for one LLM provider."""

    base_url: str
    api_key: str
    default_model: str

    @property
    def chat_url(self) -> str:
        """Full /v1/chat/completions URL."""
        base = self.base_url.rstrip("/")
        return f"{base}/chat/completions"

    @property
    def embeddings_url(self) -> str:
        """Full /v1/embeddings URL (Qwen only — DeepSeek has no endpoint)."""
        base = self.base_url.rstrip("/")
        return f"{base}/embeddings"


# ---------------------------------------------------------------------------
# Supported providers
# ---------------------------------------------------------------------------
# DeepSeek: https://api.deepseek.com/v1
# NOTE: DeepSeek requires a topped-up account — sign-up credits are NOT given.
DEEPSEEK_DEFAULT_BASE = "https://api.deepseek.com/v1"
DEEPSEEK_DEFAULT_MODEL = "deepseek-chat"

# Qwen via Alibaba Cloud Model Studio (百炼 / DashScope)
# Compatible-mode URL: https://dashscope.aliyuncs.com/compatible-mode/v1
# Custom endpoint: https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1
QWEN_DEFAULT_BASE = "https://dashscope.aliyuncs.com/compatible-mode/v1"
QWEN_DEFAULT_MODEL = "qwen-plus"
# Qwen embeddings model for graph vectorization (DeepSeek offers no /embeddings).
QWEN_DEFAULT_EMBEDDING_MODEL = "text-embedding-v3"


def _load_providers() -> dict[str, ProviderConfig]:
    """Build provider registry from environment variables.

    Reads DEEPSEEK_* and QWEN_* env vars.
    Each provider needs at least API_KEY to be registered.
    """
    providers: dict[str, ProviderConfig] = {}

    # -- DeepSeek --
    ds_key = os.getenv("DEEPSEEK_API_KEY", "").strip()
    if ds_key:
        providers["deepseek"] = ProviderConfig(
            base_url=os.getenv("DEEPSEEK_BASE_URL", DEEPSEEK_DEFAULT_BASE).strip(),
            api_key=ds_key,
            default_model=os.getenv("DEEPSEEK_MODEL", DEEPSEEK_DEFAULT_MODEL).strip(),
        )

    # -- Qwen --
    qw_key = os.getenv("QWEN_API_KEY", "").strip()
    if qw_key:
        providers["qwen"] = ProviderConfig(
            base_url=os.getenv("QWEN_BASE_URL", QWEN_DEFAULT_BASE).strip(),
            api_key=qw_key,
            default_model=os.getenv("QWEN_MODEL", QWEN_DEFAULT_MODEL).strip(),
        )

    if not providers:
        raise RuntimeError(
            "No LLM provider configured. Set DEEPSEEK_API_KEY or QWEN_API_KEY in .env"
        )

    return providers


# ---------------------------------------------------------------------------
# Application settings
# ---------------------------------------------------------------------------
@dataclass
class AppConfig:
    """Top-level config consumed by main.py and agent modules.

    Usage:
        config = AppConfig()
        providers = config.providers           # dict[str, ProviderConfig]
        default_provider = config.llm_provider  # "deepseek" or "qwen"
    """

    providers: dict[str, ProviderConfig] = field(default_factory=_load_providers)

    # Default provider — set LLM_PROVIDER in .env or defaults to first available
    llm_provider: str = field(default="")

    # Embeddings — always served by Qwen (DeepSeek has no /embeddings endpoint)
    qwen_embedding_model: str = QWEN_DEFAULT_EMBEDDING_MODEL

    # LLM parameters
    llm_temperature: float = 0.3
    llm_max_tokens: int = 1024

    # Memory decay half-life in days
    memory_half_life_days: float = 21.0

    # Data
    knowledge_graph_path: Path = PROJECT_ROOT / "data" / "as_physics_graph.json"

    # Postgres persistence (memory_records). Empty → in-memory MemoryStore.
    database_url: str = field(default="")

    def __post_init__(self) -> None:
        # Resolve default provider
        env_provider = os.getenv("LLM_PROVIDER", "").strip()
        if env_provider and env_provider in self.providers:
            self.llm_provider = env_provider
        elif not self.llm_provider:
            # Pick first available
            self.llm_provider = next(iter(self.providers.keys()))

        # Optional overrides from env
        temp = os.getenv("LLM_TEMPERATURE")
        if temp:
            self.llm_temperature = float(temp)
        max_tok = os.getenv("LLM_MAX_TOKENS")
        if max_tok:
            self.llm_max_tokens = int(max_tok)
        half_life = os.getenv("MEMORY_HALF_LIFE_DAYS")
        if half_life:
            self.memory_half_life_days = float(half_life)

        emb_model = os.getenv("QWEN_EMBEDDING_MODEL")
        if emb_model:
            self.qwen_embedding_model = emb_model

        db_url = os.getenv("DATABASE_URL", "").strip()
        if db_url:
            self.database_url = db_url
