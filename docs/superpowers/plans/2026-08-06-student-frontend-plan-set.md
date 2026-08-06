# Student Frontend Delivery Implementation Plan Set

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the approved student frontend design as seven independently testable and pushable modules while preserving the teammate-authored layout.

**Architecture:** The plans incrementally migrate pages from static seed imports to Page → AppStore → API → persistent Mock/REST data flow. Each plan consumes only interfaces established by earlier pushed modules and leaves working software at its remote commit.

**Tech Stack:** React 18.3.1, Vite 5.4.x, Tailwind CSS 3.4.x, Vitest, React Testing Library, Playwright CLI, versioned localStorage Mock repository.

## Global Constraints

- Execute plans in the listed order; do not combine two modules into one push.
- Preserve all routes, design tokens, English UI style, current density, and responsive page structure.
- Use TDD for behavior changes and keep tests deterministic through injected clocks, ids, API clients, and zero-latency repositories.
- A module is complete only after targeted tests, full tests, production build, browser journey, console check, and visual comparison pass.
- Push `main` immediately after each module passes; do not push failed or partial module state.

---

## Execution Order

| Order | Plan | Depends on | Remote completion evidence |
|---|---|---|---|
| 0 | `2026-08-06-student-foundation.md` | Approved design | Test harness, persistent repository, recoverable store, favicon; green push |
| 1 | `2026-08-06-student-tasks.md` | Module 0 | Teacher-first ranking, history, adjustment request; green push |
| 2 | `2026-08-06-student-exercise.md` | Modules 0–1 | Six help levels, session evidence, real variant; green push |
| 3 | `2026-08-06-student-errors.md` | Modules 0–2 | Summary, seven-type diagnosis, redo/verification mastery; green push |
| 4 | `2026-08-06-student-materials.md` | Modules 0–3 | Upload/classify/version/organize/undo workspace; green push |
| 5 | `2026-08-06-student-bank.md` | Modules 0–4 | Evidence recommendation, universal practice, paper import; green push |
| 6 | `2026-08-06-student-profile.md` | Modules 0–5 | Evidence model, graph, progress, rewards, tone, full audit; green push |

## Approved-Spec Coverage

| Design requirement | Implementation evidence |
|---|---|
| Preserve layout and frontend-first boundary | Global constraints in every plan; Playwright visual gate in every final task |
| Test/state foundation and favicon noise removal | Foundation Tasks 1–5 |
| Versioned Mock persistence and real API compatibility | Foundation Tasks 2–4; API/store task in every later plan |
| Teacher tasks outrank AI and student can request adjustment | Tasks Tasks 1–4 |
| Six-level progressive help and hint-dependency tracking | Exercise Tasks 1–5 |
| A-Level understanding/scoring and IELTS Reading evidence | Exercise Tasks 3–5; Errors Tasks 1–5 |
| Seven error types, evidence-rich cards, dedupe, redo, transfer verification | Errors Tasks 1–5 |
| Materials, OCR classification, question/answer split, links, versioning, iPad-facing metadata | Materials Tasks 1–5 |
| Searchable/practiceable bank and confirmed paper splitting | Bank Tasks 1–5 |
| Knowledge states, evidence/confidence, immediate/daily/weekly model | Profile Tasks 1–5 |
| Behavior rewards, progress visualization, no ranking, tone slider | Profile Tasks 3–6 |
| Per-module test → commit → push | Final task in each module plan |
| Full requirement-by-requirement completion audit | Profile Task 7 |

## Cross-Module Interface Map

```text
Module 0
  createAppServices + createMockRepository + AppStore async actions
       ↓
Module 1
  persisted tasks + taskAdjustments
       ↓
Module 2
  sessions + exerciseSets + variant tasks
       ↓
Module 3
  summaries + evidence-rich errors + verification state
       ↓
Module 4
  uploadJobs + versioned notes + knowledge/error links
       ↓
Module 5
  bankQuestions + paperImports + practice attempts
       ↓
Module 6
  knowledge evidence + dynamic tags + progress + achievements
```

Field names introduced by one module must be added to `API_INTERFACE.md` in that same module before consumers use them. A consumer must not read directly from the seed module when an API/store interface exists.

## Execution Checkpoints

- [ ] Complete and push Module 0; record remote commit.
- [ ] Complete and push Module 1; record remote commit.
- [ ] Complete and push Module 2; record remote commit.
- [ ] Complete and push Module 3; record remote commit.
- [ ] Complete and push Module 4; record remote commit.
- [ ] Complete and push Module 5; record remote commit.
- [ ] Complete and push Module 6; record remote commit and full completion audit.
