# AS Physics 图谱向量化 — 现状与决策记录

日期：2026-08-13（henry）

## 结论先行

图谱 `data/as_physics_graph.json`（256 节点 / 629 边）已**向量化**完成，产出一个
Chroma 持久化索引 `data/as_physics_embeddings/`，每个实体一条 1024 维余弦向量。

这一步是**纯数据/索引层**，与运行时 agent 解耦——还没有任何 skill/tool 在运行时
调用它（那一步的设计待定，见文末）。

## 关键决策

### 1. 嵌入源：Qwen text-embedding-v3（1024 维）

| 方案 | 结论 |
|---|---|
| DeepSeek embeddings | ❌ DeepSeek **没有** `/embeddings` 接口 |
| Qwen（DashScope） | ✅ 走 `QWEN_API_KEY`，`text-embedding-v3` 1024 维，英文语义好 |
| 本地 onnx（Chroma 默认 MiniLM） | ✅ 离线可用，但 API 方案质量更高、已选 |

注：之前的 `QWEN_API_KEY` 是失效的（401），本次换成新 key 后 chat + embeddings 均 200。

### 2. 批量限制

DashScope `/embeddings` 单次最多 **10** 条输入（超过 10 返回 400）。
`LLMClient.embed_many(batch_size=10)` 已按此默认。

### 3. 可搜索文本的构造

每个实体的嵌入文本 = `name | definition | expression`（后两者仅在有值时才拼）。
这样 Concept 带 definition、Formula 多带 expression、Topic/BigIdea 只有 name，
但同一节点不同字段的语义能同时进入向量。

### 4. 向量只做「语义召回」，图结构仍走邻接表

- `tool/knowledge_graph.py` → 精确 id 遍历（前置链、薄弱点），**保留不动**
- `tool/graph_vectorizer.py` → 按语义相似度召回节点（"什么概念把力和加速度连起来"）

两者并存，互不替代。向量层是图的「语义索引」，不是图的替代品。

## 产出文件

| 文件 | 作用 |
|---|---|
| `tool/graph_vectorizer.py` | `GraphVectorStore`（Chroma 封装）+ `entity_text`/`entity_metadata` 纯函数 |
| `scripts/vectorize_graph.py` | 离线流水线：读 JSON → 构造文本 → embed → upsert → 语义抽查 |
| `core/llm_client.py` | 新增 `embed()` / `embed_many()`（batch=10） |
| `app/config.py` | 新增 `qwen_embedding_model`（env `QWEN_EMBEDDING_MODEL`） |
| `data/as_physics_embeddings/` | Chroma 持久化目录（已 gitignore，可重生成） |

## 语义验证（抽查通过）

- 「What links force to acceleration?」→ `newtons-second-law`、`force-rate-of-change-of-momentum`
- 「uncertainty when adding/subtracting」→ `combining-uncertainties`、`bigidea-measurement`
- 「law relating voltage current resistance」→ `ohms-law`、`apply-ohms-law`、`r-v-i`

## 下一步（待沟通，未实现）

向量层现在**没有运行时消费者**。要让它「活」起来，需要设计：

1. **tool or skill？** 语义召回大概率是 **tool**（确定性、无 LLM 推理，与
   `KnowledgeGraph` 同类）——agent 在需要「按含义找相关节点」时调用，而不是写成一个
   让 LLM 自由发挥的 skill。
2. **调用场景**：error_diagnosis 拿到 `error_node_id` 后，用向量召回「相关但不在
   前置链上」的概念，喂给 knowledge_framework 做 cross-cutting 分析。
3. **是否运行时加载**：`GraphVectorStore` 尚未接入 `app/main.py` 启动流程，等场景定了
   再挂。

这些留到「知识图谱在 agent 里怎么被调用」的设计讨论里一并定。
