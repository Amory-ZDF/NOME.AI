# NOME.AI / KnowMe Tutor

AI 辅导系统原型，包含 5 个服务：学生端答题 + 错题闭环、AI Agent（诊断/提示/答疑/知识图谱）、教师端洞察。

```
┌─────────────────┐   /api/agent/* → :8000   ┌──────────────────┐
│ Student_Frontend │ ──────────────────────── │ Agent (Python)    │
│  Vite :5173      │   /api/*       → :3001   │  FastAPI :8000    │
└────────┬────────┘ ──────────────────────── └─────────┬────────┘
         │                                            │ 知识图谱
         ▼                                            │ (as_physics_graph.json)
┌─────────────────┐  Postgres :5432 (nome)  ┌─────────┴────────┐
│ Student-Backend  │ ─────────────────────── │ Teacher-Backend  │
│  TS :3001         │                        │  TS :3002         │
└─────────────────┘                        └─────────┬────────┘
                                                     │
                                            ┌─────────┴────────┐
                                            │ Teacher_Frontend  │
                                            │  Node :8765       │
                                            └──────────────────┘
```

## 依赖

- Node.js 20+、npm
- Python 3.11+
- PostgreSQL 16（`docker compose up -d` 一键起；或用你已有的 Postgres）

## 快速启动（5 个服务）

### 0. 数据库 + 知识图谱数据

```bash
docker compose up -d            # 起 Postgres (nome:nome@localhost:5432/nome)
```

知识图谱数据（`backend/data/as_physics_graph.json` 等）已入库，无需额外生成。
向量索引（`as_physics_embeddings/`）用 `backend/scripts/vectorize_graph.py` 按需生成，不阻塞启动。

### 1. Student-Backend（学生 API :3001）

```bash
cd Student-Backend
cp .env.example .env            # 填 DATABASE_URL（默认本地 Postgres）
npm install
npm run db:generate
npm run db:deploy               # 跑迁移建表
npm run db:seed                 # 灌入学生/任务/错题种子数据
npm run db:import-questions -- --file prisma/question-bank-9702-12.json   # 导入题库（41 道单题）
npm run dev                     # tsx watch :3001
```

> demo 重置：`npm run db:seed` + 重跑 `db:import-questions`（seed 会清掉题库，需重导）。

### 2. Agent 服务（Python :8000）

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt   # 或 pip install -e .
cp .env.example .env              # 填 DEEPSEEK_API_KEY 或 QWEN_API_KEY
uvicorn app.main:app --reload --port 8000
```

> 知识图谱交互演示页：浏览器打开 `http://localhost:8000/graph-demo`（单文件页，含节点/边/前置链/掌握度档案）。

### 3. Student_Frontend（学生端 :5173）

```bash
cd Student_Frontend
cp .env.example .env            # 默认 http://localhost:5173（走 Vite 代理到后端/agent）
npm install
npm run dev                     # http://localhost:5173/student/
```

> Vite 代理：`/api/agent/*` → :8000，其余 `/api/*` → :3001。

### 4. Teacher-Backend（教师 API :3002）

```bash
cd Teacher-Backend
cp .env.example .env
npm install
npm run dev                     # tsx watch :3002
```

> insights 模块直连共享 Postgres（`INSIGHTS_DATABASE_URL`），读 agent 长期记忆写入的表。

### 5. Teacher_Frontend（教师端 :8765）

```bash
cd Teacher_Frontend
node serve.js                   # 纯 Node 静态服务，无需 npm install；http://localhost:8765
```

> 前端直连 `http://localhost:3002/api/v1/teacher`。若教师后端未起会显示空态/报错。

## 演示入口

| 端 | 地址 |
|---|---|
| 学生端答题 | http://localhost:5173/student/bank |
| 知识图谱演示 | http://localhost:8000/graph-demo |
| 教师端 | http://localhost:8765 |

## 关键路径

- 错题闭环：Bank 选题 → 答题（选择本地判/简答 LLM 判）→ 答错逐层生成渐进提示 → 定性时一次性诊断 → Summary（Error Analysis + Error Cards）→ 加入错题本 → 错题卡推荐相似真题。
- 知识图谱：256 节点 / 636 边（Topic/BigIdea/Concept/Skill/Formula × 5 种关系边），agent 沿 `PREREQUISITE_OF` 前置链定位根因、沿相关边推荐同类题。

## 目录

- `Student-Backend/` — 学生状态 API（Fastify + Prisma/Postgres）
- `Student_Frontend/` — 学生端 React 应用（Vite）
- `backend/` — AI Agent（FastAPI + LLM + 知识图谱 + 记忆）
- `Teacher-Backend/` — 教师 API（直连共享库 + insights）
- `Teacher_Frontend/` — 教师端应用（Node 静态服务）
