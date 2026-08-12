# NOME.AI 架构回顾与修正方向

> 作者：Henry · 日期：2026-08-12
> 主题：教师端前后端打通后，梳理当前架构存在的问题，并给出修正方案。

---

## 1. 本文目的

教师端前端（`Teacher_Frontend`）从 100% Mock 数据改为接入真实后端（`Teacher-Backend`）
之后，前后端链路首次跑通。但回顾整体时发现：**三个后端各自为政、数据库零共享、
教师端数据仍是假的**。本文记录当前事实、暴露的问题，以及后续如何修正。

---

## 2. 教师端目前已完成的实事（截至 2026-08-12）

### 2.1 后端 `Teacher-Backend`（TypeScript + Fastify 5 + Zod 4 + Prisma 7）

- 对齐 `Teacher_Frontend/api-contract.md` §2，Base URL 定为 `/api/v1/teacher/*`
- 统一响应包 `{ code: 0, message: "ok", data: <T> }`
- 实现 17 个端点，覆盖教师端全部数据面：

| 模块 | 端点 |
|------|------|
| Dashboard | `GET /api/v1/teacher/dashboard` |
| Courses | `GET /api/v1/teacher/courses` |
| Students | `GET /students`、`/students/:id`、`/:id/knowledge-graph`、`/:id/tags`、`PUT /:id/tags/:tagId`、`/:id/feedback`、`/:id/suggestions`、`POST /:id/suggestions/:sid/respond`、`/:id/execution`、`/:id/recent-work` |
| Assignments | `GET /assignments`、`POST /assignments`、`GET /:id/submissions`、`PUT /submissions/:submissionId/grade` |
| Reports | `GET /reports/overview`、`/reports/score-trend`、`/reports/error-distribution`、`/reports/students` |

- 数据层 `src/data/teacher-store.ts`：**内存单例**，8 个学生、5 个作业、预警、知识图谱、
  报告等全部硬编码（本质是把前端 `mock-data.js` 搬进后端）
- Prisma 只是骨架：`schema.prisma` 里只有一个 `Teacher` 表（`id/name/avatar`），**实际未被读写**

### 2.2 前端 `Teacher_Frontend`（原生 JS SPA）

- 新增 `js/api.js` 适配层：`fetch` 后端，并把后端字段名（`studentName`、`todayCourses`、`pendingAssignments`…）
  映射回页面模板期望的 Mock 字段名（`student`、`courses`、`assignments`…）
- `js/common.js` 的 Router 支持 `async` 页面函数（`Pages[route]()` 返回 Promise 则 await）
- 6 个页面全部从同步 `MockData` 改为异步 `API.getXxx()`：dashboard / calendar / students /
  student-profile / assignments / reports
- `index.html` 引入 `js/api.js`；设置页头像/姓名/角色改读 `App.user`

### 2.3 已解决的关键坑（备忘）

- Prisma 7 破坏性变更：`datasource.url` 从 `schema.prisma` 移到 `prisma.config.ts`
- `server.ts` 需 `import 'dotenv/config'` 才能加载 `.env`，否则报 `DATABASE_URL is missing`
- 端口冲突：`lsof -ti :3002 | xargs kill -9`
- `api.js` 漏加 `<script>` 标签导致 `Can't find variable: API`

---

## 3. 当前架构全景（问题所在）

```
3 个后端服务，3 个独立数据存储，两两之间零关联：

┌─────────────────────────┐   ┌─────────────────────────┐   ┌─────────────────────────┐
│   Student-Backend :3001 │   │   Teacher-Backend :3002 │   │   backend/ (Python)     │
│   Fastify + Prisma 7    │   │   Fastify + Prisma 7    │   │   FastAPI :8000         │
│   SQLite (dev.db)       │   │   SQLite (dev.db)       │   │   MemoryStore(向量记忆)  │
│                         │   │                         │   │   KnowledgeGraph(图谱)   │
│   10 张表【真数据】       │   │   1 张骨架表 + 内存Mock  │   │   LLM Orchestrator       │
│   Student, Task,        │   │   Teacher               │   │                         │
│   ExerciseSet, Session, │   │                         │   │   agent/analyze 等       │
│   ErrorItem, Note,      │   │                         │   │   AI 端点（无 CRUD）      │
│   NoteFolder, Material, │   │                         │   │                         │
│   Settings              │   │                         │   │                         │
└──────────┬──────────────┘   └──────────┬──────────────┘   └──────────┬──────────────┘
           │                             │                             │
     ┌─────▼──────┐               ┌──────▼──────┐               ┌─────▼──────┐
     │ Student    │               │  Teacher    │               │  (无专属前端) │
     │ Frontend   │               │  Frontend   │               │  被两前端调用 │
     │ React+Vite │               │  原生 JS SPA │               │            │
     │  :5173     │               │  :8765      │               │            │
     └────────────┘               └─────────────┘               └────────────┘
```

### 3.1 端口清单

| 服务 | 端口 | 说明 |
|------|------|------|
| Student-Backend | `3001` | 默认值（`env.ts`），`DATABASE_URL=file:./dev.db` |
| Teacher-Backend | `3002` | `.env` 显式，`DATABASE_URL=file:./dev.db` |
| Python Agent | `8000` | `uvicorn app.main:app` |
| Student-Frontend | `5173` | React + Vite，`base: '/student/'` |
| Teacher-Frontend | `8765` | `python3 -m http.server` |

### 3.2 核心矛盾

1. **教师端没有自己的数据库**：`Teacher-Backend` 的 Prisma 只有一张从未用过的 `Teacher` 骨架表，
   业务数据全在内存里写死。
2. **教师端数据是假的**：Dashboard 的「待批改作业」「学生预警」、Reports 的「成绩趋势」等，
   与 Student-Backend 里的真实 `Task / Session / ErrorItem` 完全对不上——同一批学生，
   学生端和教师端看到的是两份不同的数据。
3. **三个后端零关联**：Student-Backend 是唯一有真实数据的服务，但 Teacher-Backend 不读它；
   Python Agent 也不读它。所谓「打通」目前只是**教师端前端 → 教师端后端**这一条线，
   数据仍是一份独立的 Mock。
4. **两边都 `DATABASE_URL=file:./dev.db`**：路径恰好相同、但各自 resolve 到自己的项目目录，
   是两个物理上不同的 SQLite 文件，互不相干（甚至容易误以为在共享）。

### 3.3 数据依赖方向（应该是什么）

教师端数据**本质上就是学生端数据的聚合视图**，不应另起炉灶。例如：

| 教师端需求 | 真实来源（Student-Backend） |
|-----------|------------------------------|
| 待批改作业数 | 所有学生 `Task` 里 `status=submitted` 且未评分 |
| 学生预警 | `ErrorItem` 反复出错 / `Session` 正确率下降 |
| 成绩趋势 | 各学生 `Session` 的得分按时间聚合 |
| 知识点掌握度 | 学生端已有的知识图谱 / 错题 mastery |
| 学习反馈 | 学生端已有的 feedback 数据 |

---

## 4. 备选修正方案

### 方案 A：三端共用同一个 SQLite 文件 —— ❌ 否决

让三个服务指向同一个 `.db` 文件。

- 优点：单一真相来源，无需跨服务调用。
- 缺点（致命）：
  - **SQLite 不支持多写者并发**，两个 Node 服务 + Python 同时写会锁库/报 `SQLITE_BUSY`。
  - **Prisma migration 打架**：三个仓库各自维护 schema 并生成 migration，会互相覆盖。
  - 任一服务异常退出会持锁，拖垮另外两个。
  - 结论：SQLite 天生不适合多进程共享；要共享必须换 PostgreSQL，成本陡增，MVP 阶段不值。

### 方案 B：合并 Student + Teacher 为一个后端 —— ✅ 推荐

把 `Teacher-Backend` 的 contracts / routes / store 迁入 `Student-Backend`，
同一个 Fastify 进程同时暴露 `/api/v1/student/*` 与 `/api/v1/teacher/*`。

- 优点：
  - **同一进程、同一 Prisma client、同一 SQLite**：Teacher 服务直接查真实数据，零同步成本。
  - **单一 schema**：一张 schema 管全部表，migration 不再打架。
  - 技术栈完全一致（Fastify + Zod + Prisma），迁移成本低。
  - 部署只跑一个 Node 进程，CORS/端口天然简化。
- 代价 / 工作量：
  - 把 Teacher 的 5 个模块 + contracts + store 搬过去。
  - 扩 schema：新增 `Teacher`、`Assignment`、`Course` 等教师端实体。
  - 把 `teacher-store.ts` 的 Mock 逐块替换为真实 Prisma 查询（可渐进：先合并进程，
    再逐端点换成真实查询）。
  - 统一端口（如 `3000`）与 CORS。

### 方案 C：保持分离 + 教师端通过 API 调学生端 —— ⚠️ 备选

`Teacher-Backend` 不直接读库，而是 HTTP 调用 `Student-Backend` 的接口拿真实数据。

- 优点：服务边界清晰、可独立部署。
- 缺点：每次查询多一跳网络延迟、失败需兜底；两份数据仍可能不一致；
  目前这一步**根本没做**，等于回到现状。适合未来真正需要独立扩展教师端时再考虑。

### Python Agent 层的定位

Python `backend/` 不是 CRUD 服务，而是 **AI 引擎**：`agent/analyze`、`counter-reply-ext`、
`sessions` 等。它有自己的 `MemoryStore`（语义记忆召回）和 `KnowledgeGraph`（知识点图谱），
这些**天然独立于 SQLite 关系数据**，不应并入。

正确关系应是：Python 作为**调用方**，向合并后的 NOME-Backend 拉取 `Student/Task/ErrorItem`
等真实数据做分析，再把分析结果写回。方向：

```
Student-Frontend ─┐
                  ├─→ NOME-Backend (合并后) ←─ Python Agent (调用方 / AI 引擎)
Teacher-Frontend ─┘
```

---

## 5. 结论与下一步

**结论**：当前「三后端 + 三存储、教师端无库用假数据」的状态，必须收敛。推荐 **方案 B**
（合并 Student + Teacher 为单一后端），让教师端直接查询学生端真实数据，从根上消除"两端孤立"。

**建议执行顺序**：

1. 迁移 Teacher 模块到 Student-Backend，统一一个 Fastify 进程 + 一套 Prisma schema。
2. 扩展 schema，新增 `Teacher / Assignment / Course` 等实体，建 migration。
3. 渐进替换：先把 `teacher-store.ts` 内存 Mock 替换为 Prisma 查询（待批改作业 ← Task；
   预警 ← ErrorItem/Session；报告 ← Session 聚合）。
4. Python Agent 保持独立，改为通过合并后后端 API 读写学生数据。
5. 删除独立的 `Teacher-Backend/`，统一端口与 CORS。

> 待办提示：以上为架构层面结论，尚未落地。合并属较大重构，动手前建议再次对齐方案边界
> （是否保留独立 Teacher-Backend、是否引入 PostgreSQL、是否连带把 Python 层也纳入）。
