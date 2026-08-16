# Flow D — Postgres 落库（TS 后端 + Python 记忆持久化）

> 状态:已实现并验证
> 日期:2026-08-14
> 上游依赖:Flow A（题目契约）、Flow B（LLM 判题）、Flow C（知识图谱接线）
> 本文档回答:存储层如何从 SQLite / 内存迁到 Postgres、数据怎么进库、怎么起环境、怎么验证

---

## 1. 目标

把两处「非持久」存储统一到一个本地 Postgres：

| 服务 | 迁移前 | 迁移后 |
|---|---|---|
| Student-Backend（Fastify + Prisma 7） | SQLite 单文件（`file:./dev.db`） | Postgres（Prisma `postgresql` provider + `@prisma/adapter-pg`） |
| backend（FastAPI 记忆） | `MemoryStore` 纯内存（重启即丢） | `PgStore`（`asyncpg`，落 `memory_records` 表） |

**范围外（有意为之）**:TS 后端 vitest 套件仍留在 SQLite。用户明确「不打算跑后端单测」，测试迁移列为低优先级，不阻塞 demo。

---

## 2. 本地 Postgres（docker-compose）

仓库根新增 `docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16
    container_name: nome-postgres
    environment:
      POSTGRES_USER: nome
      POSTGRES_PASSWORD: nome
      POSTGRES_DB: nome
    ports: ["5432:5432"]
    volumes: [nome_pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U nome -d nome"]
```

```bash
# 启动（Docker Desktop 需先启动）
docker compose up -d
# 连接串（两个后端共用）
postgresql://nome:nome@localhost:5432/nome
```

数据卷 `nome_pgdata` 持久化，`docker compose down` 不删数据；`down -v` 才清空。

---

## 3. TS 后端改动

### 3.1 Prisma 方言切换

- `prisma/schema.prisma`:`datasource db { provider = "postgresql" }`
- `prisma/migrations/migration_lock.toml`:`provider = "postgresql"`
- `20260810122618_init/migration.sql`:`DATETIME` → `TIMESTAMP(3)`（Postgres 方言）
- `20260811152500_nullable_session_task/migration.sql`:删掉 SQLite 专有的 `PRAGMA` + 建新表重命名，改为一条:
  ```sql
  ALTER TABLE "Session" ALTER COLUMN "taskId" DROP NOT NULL;
  ```

`prisma.config.ts` 的 `datasource.url = env('DATABASE_URL')` 是 provider 无关的，无需改动。

### 3.2 连接分支（`src/db/client.ts`）

按 URL 前缀选择 adapter，保留 SQLite 分支给测试：

```ts
if (url.startsWith('postgresql://')) {
  const adapter = new PrismaPg({ connectionString: normalizePostgresDatabaseUrl(url) })
  return new PrismaClient({ adapter })
}
const adapter = new PrismaBetterSqlite3({ url: normalizeSqliteDatabaseUrl(url) })
return new PrismaClient({ adapter })
```

### 3.3 URL 校验（`src/db/database-url.ts` + `src/config/env.ts`）

新增 `normalizePostgresDatabaseUrl()`:要求 `postgresql://` 前缀、合法 URL、非空 hostname、`pathname` 非空（有库名）。`env.ts` 的 `databaseUrlSchema` 按前缀分支到两种归一化。

### 3.4 依赖

```json
"@prisma/adapter-pg": "^7.9.1",
"pg": "^8.23.0"
```

---

## 4. Python 记忆改动

### 4.1 `memory/pg_store.py`（新增）

`PgStore(MemoryStore)` 实现与 `MemoryStore` 完全相同的接口契约：

- `append(record)` — `INSERT ... ON CONFLICT (record_id) DO NOTHING`（幂等）
- `query_by_student(student_id, *, type, knowledge_node_id, error_type, limit)`
- `query_by_node(student_id, node_id, limit)` — 委托 `query_by_student(type="error")`
- `count(student_id)`

表结构 `memory_records`（字段对齐 `MemoryRecord`）:

```sql
CREATE TABLE IF NOT EXISTS memory_records (
    record_id         TEXT PRIMARY KEY,
    student_id        TEXT NOT NULL,
    type              TEXT NOT NULL,
    timestamp         TIMESTAMPTZ NOT NULL,
    session_id        TEXT,
    question_id       TEXT,
    knowledge_node_id TEXT,
    error_type        TEXT,      -- ErrorType.value
    error_status      TEXT,      -- ErrorStatus.value
    summary           TEXT NOT NULL DEFAULT '',
    raw_data          JSONB NOT NULL DEFAULT '{}'::jsonb
);
```

两个索引:`(student_id, timestamp DESC)`（按学生查最近）、`(student_id, knowledge_node_id)`（按节点衰减查询）。`_row_to_record` 把 `error_type`/`error_status` TEXT 还原成枚举、`raw_data` JSONB 还原成 dict。

### 4.2 依赖

`pyproject.toml` 加 `asyncpg>=0.29`。

### 4.3 接线（`app/config.py` + `app/main.py`）

- `config.database_url`:读 `DATABASE_URL`，空则空串。
- `main.py` lifespan:
  - `database_url` 非空 → `PgStore(url).connect()`；**连不上则捕获异常回退到内存版**，demo 不崩。
  - 空 → `MemoryStore()`。
  - shutdown 时 `isinstance(memory_store, PgStore)` → `close()`。

---

## 5. 数据怎么进库（入口没变）

两条命令，代码零改动，只改 `.env` 的 `DATABASE_URL`：

```bash
cd Student-Backend

# 1. 种子:演示学生 + 任务/会话/错题/笔记等
npm run db:seed

# 2. 导入题库:upsert kind:'bank' 的题目集
npm run db:import-questions -- --file prisma/question-bank.sample.json
```

运行期数据（任务/会话/错题/笔记写入 + Python agent 的 `memory_records`）走同一套代码，只是落到 Postgres。

题库文件当前只有 `prisma/question-bank.sample.json`（5 题:SUVAT 计算、SI 前缀选择、动量选择+计算、合力计算）。正式题库直接换 `--file` 指向。

---

## 6. 环境变量

**Student-Backend `.env` / `.env.example`:**

```
DATABASE_URL=postgresql://nome:nome@localhost:5432/nome
```

**backend `.env.example`（可选）:**

```
# 留空 → 内存 MemoryStore；填 Postgres 串 → PgStore
# DATABASE_URL=postgresql://nome:nome@localhost:5432/nome
```

两个后端连同一个 Postgres 实例（一个库 `nome`），但表不同命名空间：Prisma 表用 `PascalCase` 引号表名（`"Student"`、`"ExerciseSet"`…），Python 表是小写 `memory_records`。

---

## 7. 验证

```bash
# Postgres 起否
docker compose ps                      # 期望 (healthy)

# TS 迁移 + 数据
cd Student-Backend
npx prisma migrate deploy              # 两个迁移都 applied
npm run db:seed
npm run db:import-questions -- --file prisma/question-bank.sample.json

# 库里有数据
docker exec nome-postgres psql -U nome -d nome \
  -c 'SELECT "studentId", kind, COUNT(*) FROM "ExerciseSet" GROUP BY 1,2;'
# 期望 stu-001 | bank | 5  /  stu-001 | task | 2

# Python 记忆往返
cd backend
python -m pytest -q                    # 48 passed（仍走内存，不依赖 Postgres）
python - <<'PY'                        # PgStore 冒烟
import asyncio
from datetime import datetime, timezone
from memory.pg_store import PgStore
from memory.models import MemoryRecord
from core.types import ErrorType, ErrorStatus

async def main():
    s = PgStore("postgresql://nome:nome@localhost:5432/nome")
    await s.connect()
    await s.append(MemoryRecord("smoke-1", "stu-001", "error",
        datetime.now(timezone.utc), question_id="q-1",
        knowledge_node_id="newtons-second-law",
        error_type=ErrorType.KNOWLEDGE, error_status=ErrorStatus.PENDING_REVIEW,
        summary="smoke", raw_data={"is_correct": False}))
    assert await s.count("stu-001") == 1
    await s.close()
asyncio.run(main())
print("PgStore OK")
PY
```

---

## 8. 风险 / 说明

- **`.env` 已被 git 跟踪**（Student-Backend 的 `.gitignore` 未排除 `.env`），现含 `postgresql://nome:nome@...`。本地默认凭据无害，但要留意会被提交。
- **测试套件仍 SQLite**:`npm run test:prepare` 用 `prisma db push --force-reset` 指向 `file:./prisma/test.db`。`prisma db push --force-reset` 有 Prisma AI-safety 守卫（Claude Code 触发需用户显式同意），不绕过。
- **`node >=24` 要求**:`package.json` engines 写 `>=24`，本地 Node v20 会出 EBADENGINE 警告但能跑。
- **PgStore 回退**:Postgres 不可用时 Python 端静默回退内存版（日志 `ERROR`），保证 agent demo 不因存储崩溃。
