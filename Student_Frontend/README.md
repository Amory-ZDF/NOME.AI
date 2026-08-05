# NOME.AI — Student Frontend

NOME.AI is an AI tutoring companion for students. This repository (`Student_Frontend/`) contains the
complete, interactive **student-side web frontend**, built from the product spec `student-prd.md`
and the Stitch design system.

> **Frontend-only project.** There is no backend in this repo. All data is served by a local mock
> adapter, and the app is architected for strict frontend/backend separation (see below).

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173/student
npm run build      # production build → dist/
npm run preview    # serve the production build
```

Requires Node.js ≥ 18.

## Tech stack

| Concern | Choice |
|---|---|
| Framework | React 18 + Vite 5 |
| Routing | React Router v6 (`basename="/student"`) |
| Styling | Tailwind CSS v3 (design tokens from DESIGN.md) |
| Animation | Framer Motion (spring physics) |
| State | React Context store (`src/store/AppStore.jsx`) |
| Charts | Hand-rolled SVG (knowledge graph, progress timeline, heatmaps) |

## Routes

| Path | Page |
|---|---|
| `/student/` | Home — greeting, task list, module cards, learning heatmap |
| `/student/tasks` | Full task list with filters |
| `/student/exercise/:taskId` | Exercise — progressive 6-layer AI hint system (core flow) |
| `/student/summary/:sessionId` | Post-exercise summary & error analysis |
| `/student/errors` | Error book with mastery tracking |
| `/student/errors/review/:id` | Independent redo mode (no AI hints) |
| `/student/notes` | Three-pane notes with OCR upload simulation |
| `/student/bank` | Question bank with smart recommendations |
| `/student/bank/exercise/:qId` | Single-question bank practice |
| `/student/profile` | Learning profile — knowledge graph, progress, achievements, settings |

## Frontend / backend separation

The app is fully decoupled from any backend:

```
UI pages ──► AppStore (Context) ──► src/api  ──►  real REST API   (VITE_API_BASE_URL set)
                                        └──────►  mock adapter     (unset — current stage)
```

- **`src/api/client.js`** — HTTP client; reads `VITE_API_BASE_URL`. Unset ⇒ mock mode.
- **`src/api/index.js`** — endpoint functions, one per REST route (see `API_INTERFACE.md`).
- **`src/data/mockData.js`** — mock adapter data, shaped exactly like the API contract.

To connect a real backend later: set `VITE_API_BASE_URL` (see `.env.example`) and implement the
endpoints listed in **`API_INTERFACE.md`**. No UI code changes are needed.

## Key features (per PRD)

- **Progressive AI hints (L1–L6)**: students must submit first; a wrong answer unlocks L1,
  deeper hints unlock one level at a time; hint usage is tracked per question.
- **Anti-throwaway guard**: empty or symbol-only answers are rejected.
- **Error book**: automatic collection, independent redo mode, mastery gating.
- **Exercise sessions** with silent timing, per-question state, and a dynamic summary page.
- **Notes**: OCR upload flow, AI classification & one-click organise, note↔error linking.
- **Question bank**: filters, smart recommendations, exam-paper upload.
- **Profile**: knowledge graph, progress timeline, error patterns, achievements, settings.

## Docs

- `API_INTERFACE.md` — full frontend ↔ backend field contract (all endpoints & types).
- `student-prd.md` (product spec) and `DESIGN.md` (design system) are referenced design inputs.

## Project structure

```
src/
├── api/           # backend integration layer (client + endpoints)
├── components/    # TopNav, UI primitives (Badge, Modal, Toggle, Toast…)
├── data/          # mock adapter data (mirrors API contract)
├── pages/         # 9 route pages
├── store/         # global state (Context)
├── App.jsx        # routes & layout shell
└── main.jsx       # entry (BrowserRouter basename="/student")
```
