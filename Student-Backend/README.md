# Student Backend

Standalone Fastify/Prisma API for the student application. It is a separate service from the root `backend/` Agent/Prompt/Memory/RAG/model service.

## Quick start

Prerequisite: Node.js 24 or later and npm.

```powershell
cd Student-Backend
npm install
Copy-Item .env.example .env
npm run db:generate
npm run db:deploy
npm run dev
```

The frontend points here with `VITE_API_BASE_URL=http://localhost:3001`.

## Runtime configuration

Copy `.env.example` to `.env`; do not commit it. There are no example secrets.

| Variable | Default / allowed values | Notes |
|---|---|---|
| `NODE_ENV` | `development`, `test`, `production`; default `development` | `production` requires an explicit `STUDENT_ID`. |
| `HOST` | default `127.0.0.1`; non-blank string | Bind loopback by default. |
| `PORT` | default `3001`; integer `1`–`65535` | API listener port. |
| `DATABASE_URL` | required SQLite `file:` URL | Use a distinct database file per running writer. |
| `STUDENT_ID` | default `stu-001` outside production; non-blank | Fixed current student scope; this is not authentication. |
| `CORS_ORIGINS` | default `http://localhost:5173`; comma-separated HTTP(S) origins | Origins only: no credentials, paths, query, or fragments. |
| `LOG_LEVEL` | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`; default `info` | Request logs redact auth/cookie/database/secret-like fields. |
| `AGENT_BASE_URL` | HTTP(S) origin; development default `http://127.0.0.1:8000`; required explicitly in production | Server-only URL for the teammate-owned internal Agent capability service. |
| `AGENT_TIMEOUT_MS` | integer `1`-`60000`; default `10000` | End-to-end timeout for each internal Agent call, including response-body parsing. |

## Commands

```powershell
npm install
npm run db:generate
npm run db:deploy       # apply committed migrations
npm run dev             # development only: tsx watch
npm run db:seed         # development/test only; destructive demo fixture
npm test                # resets only Student-Backend/prisma/test.db
npm run typecheck
npm run build
npm start               # production: node dist/server.js
```

`db:seed` is deliberately destructive for the configured student: it replaces that student's aggregate with the backend-owned demo fixture. Set an explicit development or test `NODE_ENV` and a disposable database before running it. It rejects unset and production environments; it is not a production migration.

## HTTP contract and current route inventory

Success responses use `{ "code": 0, "message": "ok", "data": ... }`; errors use `{ "code": "...", "message": "...", "data": null }`. `/health` returns `{ code: 0, message: 'ok', data: { status: 'ok' } }`.

| Area | Implemented routes |
|---|---|
| Health | `GET /health` |
| Bootstrap/settings | `GET /api/student/bootstrap`; `PATCH /api/student/settings` |
| Tasks | `POST /api/tasks`; `PATCH /api/tasks/:id`; `POST /api/tasks/:id/adjustment-request` |
| Task/bank exercise reads | `GET /api/exercise-sets/:taskId`; `GET /api/bank/exercise/:setId` |
| Session/summary | `POST /api/sessions`; `GET /api/summary/:sessionId` |
| Error batch/redo/variant/verification/mastery | `POST /api/errors/batch`; `POST /api/errors/:id/redo`; `POST /api/errors/:id/variant`; `POST /api/errors/:id/verification`; `PATCH /api/errors/:id` |
| Notes | `GET`/`POST /api/notes`; `PATCH /api/notes/:id`; `POST /api/notes/:id/organize`; `POST /api/notes/:id/undo` |
| Materials | `POST /api/material-uploads`; `POST /api/material-uploads/:id/process`; `POST /api/material-uploads/:id/cancel`; `POST /api/material-uploads/:id/confirm` |
| Agent-backed question variants | `POST /api/questions/:questionId/variant` |

Student-Backend is the one public Student API, including `POST /api/sessions` and all three Agent-backed coordinator routes above. It calls the teammate-owned Python service only through the internal, versioned contract described in [AGENT_HANDOFF.md](./AGENT_HANDOFF.md). The browser continues to use only `VITE_API_BASE_URL`; it never receives an Agent URL or model credential.

## Operational and security boundary

This bundled SQLite configuration is for single-process, single-writer development only. Do not run multiple API servers, seed commands, or other writers against one database file. Production needs a database and deployment topology designed for concurrent writers, durable backups, monitored migrations, and secret management.

There is currently no authentication or tenant identity derived from a request: every request is scoped by the configured fixed `STUDENT_ID`. Keep this API loopback/private until real authentication and tenant resolution are added. CORS is an allowlist boundary, not authentication; configure only trusted browser origins.

Fastify's default body limit is 1 MiB. Public ids are bounded (notes/errors/session ids at 100 characters; upload ids at 95 so `note-{id}` remains valid). Validation accepts only strict bounded JSON at persistence boundaries; raw uploads, base64 carriers, cookies/auth values, model secrets, and database URLs must not be stored or logged. Use TLS and a reverse proxy/ingress appropriate to production.
