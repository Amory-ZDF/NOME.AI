# backend/agent/__init__.py
"""Agent orchestration layer.

┌─────────────────────────────────────────┐
│              Orchestrator               │
│  1. Diagnose — always runs first       │
│  2. Route   — field-constrained        │
│  3. Execute — run skills in series     │
│  4. Aggregate — combine into response  │
└─────────────────────────────────────────┘
"""

from agent.orchestrator import Orchestrator

__all__ = ["Orchestrator"]
