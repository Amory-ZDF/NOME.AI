# backend/app/routers/student/__init__.py
"""Student-side API routers — AI Agent service.

Modules:
    agent  — POST /api/agent/analyze, /api/agent/counter-reply-ext, /api/sessions

CRUD endpoints (tasks, errors, notes, settings, bootstrap, sessions storage,
materials, exercises, bank, profile, summary) are owned by the TypeScript
Student-Backend (Fastify + Prisma, port 3001).
"""
