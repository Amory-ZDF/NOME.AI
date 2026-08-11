#!/bin/bash
# ============================================================
# NOME.AI Backend — Git commit & push script
# Run from: /Users/henryjin/PycharmProjects/NOME.AI
# ============================================================
set -euo pipefail

cd "$(dirname "$0")"

echo "=== Checking .env safety ==="
# Should NOT be staged (covered by .gitignore)
if git status --porcelain | grep -q '\.env$'; then
  echo "ERROR: .env file is about to be committed! Aborting."
  echo "Check .gitignore files."
  exit 1
fi
echo ".env is properly ignored."

echo ""
echo "=== Files to be committed ==="
git status --short

echo ""
echo "=== Adding all changes ==="
git add -A

echo ""
echo "=== Commit message ==="
cat <<'EOF'
feat(backend): complete FastAPI with 23 API endpoints matching API_INTERFACE.md

- Agent core (real AI): POST /api/agent/analyze, POST /api/agent/counter-reply-ext, POST /api/sessions
  - Diagnosis-first pipeline with LLM-powered error_diagnosis, knowledge_framework, progressive_hint
  - Field-constrained routing (no LLM Planner dependency), confidence scoring, counter-question mechanism
  - Decay-weighted memory retriever, BFS knowledge graph traversal
- Business CRUD stubs (20 endpoints): bootstrap, tasks, errors, notes, questions, settings, bank, exercise, profile, summary
- All responses use camelCase aliases matching API_INTERFACE.md contract
- Complete domain models (Pydantic) covering all shared types from the frontend contract
- Updated .gitignore for .env safety
EOF

echo ""
read -rp "Proceed with commit and push? [y/N] " yn
case "$yn" in
  [Yy]* )
    git commit -m "feat(backend): complete FastAPI with 23 API endpoints matching API_INTERFACE.md

- Agent core (real AI): POST /api/agent/analyze, POST /api/agent/counter-reply-ext, POST /api/sessions
  - Diagnosis-first pipeline with LLM-powered error_diagnosis, knowledge_framework, progressive_hint
  - Field-constrained routing (no LLM Planner dependency), confidence scoring, counter-question mechanism
  - Decay-weighted memory retriever, BFS knowledge graph traversal
- Business CRUD stubs (20 endpoints): bootstrap, tasks, errors, notes, questions, settings, bank, exercise, profile, summary
- All responses use camelCase aliases matching API_INTERFACE.md contract
- Complete domain models (Pydantic) covering all shared types from the frontend contract
- Updated .gitignore for .env safety"
    echo ""
    echo "=== Pushing to origin/main ==="
    git push origin main
    echo ""
    echo "Done! https://github.com/Amory-ZDF/NOME.AI"
    ;;
  * )
    echo "Aborted. Files are staged, run 'git commit' and 'git push' manually."
    exit 0
    ;;
esac
