# AS 物理 GraphRAG — LLM 抽取器设计规格

> 状态:实现规格(交付 Claude Code 实现并跑通)
> 日期:2026-08-13
> 上游依赖:本体 `backend/data/ontology.json`(已定稿)、骨架 `backend/data/syllabus_skeleton.json`(已生成)、语料 `backend/data/AS-level-phy-note.txt`(已就位)
> 本文档回答:抽什么、怎么抽、怎么校验、怎么对齐、怎么评测

---

## 1. 目标与前置

把 `AS-level-phy-note.txt`(11 章笔记)转成 `backend/data/as_physics_graph.json`,格式兼容现有 `backend/tool/knowledge_graph.py` 的 `_load`(entities 列表 + relations 列表,loader 会 pop `id`、其余字段塞进节点 dict)。

**产出三样:**
1. `backend/tool/graph_extractor.py` — 抽取器(核心)
2. `backend/scripts/extract_graph.py` — 离线脚本(切章 → 逐章抽取 → 合并 → 落盘)
3. `backend/data/as_physics_graph.json` — 最终图(骨架 17 节点 + 抽取补充的 Concept/Formula/Skill + 边)

**前置决策(为什么这么设计):**
- 抽取器用 `LLMClient.chat()`(自由文本 + 手动解析),**不用** `chat_structured()`。原因:`chat_structured` 的 schema 注入是扁平的(嵌套 list 只显示 `list[Entity]`),而抽取输出是嵌套结构 + 需要自定义校验(白名单、slug 归一、别名合并),手动解析更可控。
- **一章一次调用**,天然分片。单章 ~60 行文本,LLM 处理质量最高,失败也只需重跑一章。
- EXEMPLIFIES 内嵌为 entity 字段 `exemplifies: []`(而非独立 relations 条目),LLM 更不容易漏。

---

## 2. 流水线总览(3 步)

```
AS-level-phy-note.txt
        │  (1) 切章: 按标题行 ^(CH\d+|Topic \d+): 正则切分 → [(chapter_id, chapter_name, text)]
        ▼
   GraphExtractor.extract_chapter(chapter_id, chapter_name, text)   ← 每章一次 LLM 调用
        │  (2) 抽取: prompt + chat() + _extract_json + json.loads
        ▼
   validate + normalize + alias-merge    ← 纯代码,零 LLM
        │  (3) 合并: 骨架 17 节点 ∪ 抽取实体 ∪ 展开 EXEMPLIFIES 边 → as_physics_graph.json
        ▼
   as_physics_graph.json  (knowledge_graph.py 可直接 _load)
```

---

## 3. 模块与接口设计

### 3.1 `backend/tool/graph_extractor.py`

```python
"""GraphExtractor — LLM-driven entity/relation extraction for AS Physics notes.

Constrained by ontology.json (allowed node/relation types). One LLM call per
chapter. Output merged with the rule-generated skeleton (syllabus_skeleton.json).
"""

from dataclasses import dataclass, field
from core.llm_client import LLMClient, _extract_json  # 复用 JSON 提取

@dataclass
class ExtractedEntity:
    id: str                 # 归一化 slug
    name: str               # 规范英文名
    type: str               # Concept | Formula | Skill
    definition: str = ""
    expression: str = ""    # 仅 Formula
    exemplifies: list[str] = field(default_factory=list)  # BigIdea 名(闭集)

@dataclass
class ExtractedRelation:
    source: str
    target: str
    type: str               # PREREQUISITE_OF | REQUIRES_SKILL | BELONGS_TO | CONTRASTED_WITH

@dataclass
class ChapterExtraction:
    chapter_id: str
    entities: list[ExtractedEntity]
    relations: list[ExtractedRelation]


class GraphExtractor:
    def __init__(
        self,
        client: LLMClient,
        *,
        provider: str = "deepseek",   # deepseek-chat 纯文本够用
        ontology_path: str | None = None,     # 默认 backend/data/ontology.json
        aliases: dict[str, str] | None = None,  # 同义/规范名映射表(见 §5)
    ): ...

    async def extract_chapter(
        self, chapter_id: str, chapter_name: str, text: str
    ) -> ChapterExtraction: ...
    # 内部: build_system_prompt() + build_user_message() → chat() → _extract_json()
    #      → json.loads → validate() → normalize() → alias_merge()

    def validate(self, raw: dict) -> None: ...
    # 见 §6:白名单类型/关系、边端点存在、必填字段

    def normalize(self, raw: dict) -> ChapterExtraction: ...
    # slug 归一 + 别名合并 + 去重(同 slug 实体合并、同 (source,target,type) 边去重)
```

### 3.2 `backend/scripts/extract_graph.py`

```python
# 用法: python -m scripts.extract_graph  (或 uvicorn 外直接 asyncio.run)
# 流程:
#   1. 读 ontology.json、syllabus_skeleton.json、AS-level-phy-note.txt
#   2. 正则切章 ^(CH\d+|Topic \d+):\s*(.+)$
#   3. 逐章 GraphExtractor.extract_chapter()(顺序执行,省 token 且可断点续跑)
#   4. 合并骨架 + 全部抽取结果,展开 exemplifies → EXEMPLIFIES 边
#   5. 写 backend/data/as_physics_graph.json
#   6. 用 knowledge_graph.KnowledgeGraph 加载验证,打印 node/edge count
```

---

## 4. 输出 schema(LLM 返回的 JSON)

```json
{
  "entities": [
    {
      "id": "velocity",
      "name": "velocity",
      "type": "Concept",
      "definition": "rate of change of displacement; vector quantity",
      "exemplifies": []
    },
    {
      "id": "suvat-equations",
      "name": "SUVAT equations",
      "type": "Formula",
      "definition": "four equations for uniform acceleration",
      "expression": "v = u + at; s = ut + (1/2)at^2; s = (u+v)t/2; v^2 = u^2 + 2as",
      "exemplifies": ["Modeling & idealization"]
    }
  ],
  "relations": [
    {"source": "velocity", "target": "topic-ch02", "type": "BELONGS_TO"},
    {"source": "distance", "target": "displacement", "type": "CONTRASTED_WITH"}
  ]
}
```

字段约束:
- `id` 是归一化 slug(规则见 §5),必须全局唯一;同名概念只出现一次。
- `type` ∈ {Concept, Formula, Skill}。
- `exemplifies` 元素必须是 §5 给的 6 个大概念名之一,可空数组,可多选。
- relations 的 `type` ∈ {PREREQUISITE_OF, REQUIRES_SKILL, BELONGS_TO, CONTRASTED_WITH}。
- BELONGS_TO 的 target 必须是 11 个 Topic 的 id(`topic-ch01`…`topic-ch11`)。

---

## 5. 对齐与归一化(轻量,不上 embedding)

### 5.1 slug 规则

`id = slug(name)`:`lowercase` → 去掉撇号(`Newton's` → `newtons`)→ 非字母数字转连字符 → 合并连续连字符。幂等,代码里再做一遍保证与 LLM 输出一致。

### 5.2 命名规范(给 LLM 的词典 + 代码别名表)

**定律 vs 公式坑(核心规则):** 有专名的定律/原理 → `Concept`(definition 里可写公式);无专名的裸方程 → `Formula`(expression 填符号式)。

| 判为 Concept(定律/原理/命名量) | 判为 Formula(裸方程) |
|---|---|
| Newton's laws, Hooke's law, Ohm's law, Archimedes' principle, Kirchhoff's laws, principle of conservation of momentum, principle of conservation of energy | v = Δs/Δt, a = Δv/Δt, v = u + at, s = ut + ½at², V = IR, P = VI, Q = It, I = Anvq, ρ = RA/L, Δp = ρgΔh |

**别名映射表(代码 `ALIASES` 常量,LLM prompt 里也给出"只用规范名"):**

| 规范名 | 禁止使用的别称 |
|---|---|
| momentum | linear momentum |
| Newton's second law | F = ma, Newton's 2nd law |
| Newton's first law | Newton's 1st law |
| Newton's third law | Newton's 3rd law |
| potential difference | p.d., voltage |
| e.m.f. | electromotive force, emf |
| gravitational potential energy | GPE |
| kinetic energy | KE |
| elastic strain energy | elastic potential energy(注意与 A2 弹簧势能区分) |
| SUVAT equations | suvat, equations of motion |
| work | work done |
| resultant force | net force |
| free-body diagram | force diagram |
| conservation of momentum | principle of conservation of momentum |
| terminal velocity | terminal speed |
| specific charge | charge-to-mass ratio |

代码合并逻辑:LLM 输出的 id 先过 ALIASES(值 → 键)再 slug,同 slug 合并(保留 definition 更长的)。

### 5.3 大概念闭集(6 个,EXEMPLIFIES 标签,LLM 只准选这些)

1. `Conservation laws` — 守恒律(动量/能量/电荷/核子数/轻子数)
2. `Energy & energy transfer` — 能量与转移(功/功率/效率/能量转化)
3. `Waves transfer energy without net matter transfer` — 波传能量
4. `Modeling & idealization` — 建模与理想化(质点/匀加速/无摩擦/理想电表/ohmic 假设)
5. `Macro-micro correspondence` — 宏观-微观(I=Anvq/电阻率随温度/超导/夸克)
6. `Measurement & uncertainty` — 测量与不确定度(精度/准确度/不确定度传播/实验方法)

### 5.4 Topic 表(11 个,给 LLM 用于 BELONGS_TO)

| id | 章节名 |
|---|---|
| topic-ch01 | Physical Quantities and Units |
| topic-ch02 | Kinematics |
| topic-ch03 | Dynamics |
| topic-ch04 | Forces, Density and Pressure |
| topic-ch05 | Work, Energy and Power |
| topic-ch06 | Deformation of Solids |
| topic-ch07 | Waves |
| topic-ch08 | Superposition |
| topic-ch09 | Electricity |
| topic-ch10 | D.C. Circuits |
| topic-ch11 | Particle Physics |

---

## 6. 校验规则(纯代码,零 LLM)

1. **白名单**:`type` 必须 ∈ {Concept, Formula, Skill};relation `type` ∈ {PREREQUISITE_OF, REQUIRES_SKILL, BELONGS_TO, CONTRASTED_WITH};`exemplifies` 元素 ∈ 6 大概念。
2. **边端点**:source/target 必须出现在本实体列表或骨架 Topic id 中;否则丢弃该边并 warning(不整章失败)。
3. **必填**:id、name、type 非空。
4. **去重**:同 slug 实体合并(definition/expression 取非空并集);同 (source,target,type) 边去重。
5. **自环**:source == target 的 CONTRASTED_WITH/PREREQUISITE_OF 丢弃。

---

## 7. 合并规则(step 3)

1. 以 `syllabus_skeleton.json` 的 17 节点(11 Topic + 6 BigIdea)为底座。
2. 逐章抽取的 entities 并入(Concept/Formula/Skill),slug 冲突时覆盖 definition。
3. relations 直接并入。
4. 每个 entity 的 `exemplifies: ["Conservation laws", ...]` 展开为 `{"source": entity_id, "target": "bigidea-conservation", "type": "EXEMPLIFIES"}`(BigIdea 名 → id 映射:首字母大写名 → 骨架里对应 id,见 syllabus_skeleton.json)。
5. 落盘 `as_physics_graph.json`,格式 `{"entities": [...], "relations": [...]}`。

---

## 8. LLM Prompt 全文

### SYSTEM

```
You are an expert AS-Level Physics (CAIE 9702) knowledge-graph extractor.
Your job: read ONE chapter of study notes and extract structured entities and
relations for a knowledge graph.

STRICT ONTOLOGY — you may ONLY use these types. Do NOT invent new types.

ENTITY TYPES:
- Concept: a physical concept, quantity, or named law/principle (e.g. momentum,
  Newton's second law, potential difference, principle of conservation of momentum).
- Formula: an unnamed equation with no proper name (e.g. v = u + at, V = IR, I = Anvq).
  RULE: if the thing has a proper name (a law/principle), it is a Concept, NOT a Formula.
  Put the symbolic form in the Formula's "expression" field.
- Skill: a transferable procedural technique (e.g. resolve a vector into components,
  draw a free-body diagram, draw a tangent to find instantaneous velocity).

RELATION TYPES (direction matters where noted):
- PREREQUISITE_OF: source is a prerequisite of target (target depends on source). Directed source -> target.
- REQUIRES_SKILL: source requires the Skill target to be applied. Directed source -> target.
- BELONGS_TO: source (Concept/Formula/Skill) belongs to the Topic target. Directed source -> topic. target MUST be one of the topic ids below.
- CONTRASTED_WITH: source and target form a concept pair the notes deliberately
  juxtapose, where understanding the difference IS the learning objective
  (e.g. transverse vs longitudinal wave, elastic vs inelastic collision,
  diffraction vs interference). Symmetric — output only ONE direction.

NAMING RULES:
- Use canonical English names only (see alias list below). Never create synonyms.
- id = slug of the canonical name: lowercase, remove apostrophes, non-alphanumeric -> hyphen.

BIG IDEAS (for the "exemplifies" field — classify each Concept/Formula into 0..n of these, by CLOSED label set; do not invent new ones):
1. "Conservation laws" — quantities conserved in a closed system (momentum, energy, charge, nucleon number, lepton number)
2. "Energy & energy transfer" — energy as a universal currency (work, power, efficiency, conversions)
3. "Waves transfer energy without net matter transfer" — waves, superposition, interference, diffraction, polarisation
4. "Modeling & idealization" — ideal models and their limits (point mass, uniform acceleration, no friction, ideal meters, ohmic)
5. "Macro-micro correspondence" — linking macroscopic quantities to microscopic mechanism (drift velocity, resistivity vs temperature, superconductivity, quarks)
6. "Measurement & uncertainty" — precision vs accuracy, uncertainty propagation, experimental technique

TOPICS (use these ids for BELONGS_TO):
topic-ch01 Physical Quantities and Units
topic-ch02 Kinematics
topic-ch03 Dynamics
topic-ch04 Forces, Density and Pressure
topic-ch05 Work, Energy and Power
topic-ch06 Deformation of Solids
topic-ch07 Waves
topic-ch08 Superposition
topic-ch09 Electricity
topic-ch10 D.C. Circuits
topic-ch11 Particle Physics

CANONICAL ALIASES (use the left side only):
momentum (not "linear momentum"); Newton's second law (not "F = ma");
Newton's first law; Newton's third law; potential difference (not "p.d." or "voltage");
e.m.f. (not "electromotive force" or "emf"); gravitational potential energy (not "GPE");
kinetic energy (not "KE"); SUVAT equations (not "suvat"); work (not "work done");
resultant force (not "net force"); free-body diagram; terminal velocity;
specific charge (not "charge-to-mass ratio"); conservation of momentum.

OUTPUT: a single JSON object ONLY (no markdown, no preamble) of shape:
{
  "entities": [
    {"id": "...", "name": "...", "type": "Concept|Formula|Skill",
     "definition": "...", "expression": "only for Formula, else omit",
     "exemplifies": ["BigIdea name", ...]}
  ],
  "relations": [
    {"source": "id", "target": "id-or-topic-id", "type": "RELATION_TYPE"}
  ]
}

RULES:
- Extract every Concept/Formula/Skill that the notes actually teach.
- CONTRASTED_WITH only for pairs the notes explicitly contrast. If none, return empty.
- Do not hallucinate relations absent from the text.
- Same canonical concept appears ONCE per chapter (merge repeats).
```

### USER(每章)

```
Chapter id: topic-ch02
Chapter name: Kinematics
Extract entities and relations from the notes below.

<notes>
...该章原始文本...
</notes>
```

---

## 9. 调用参数

| 参数 | 值 | 理由 |
|---|---|---|
| provider | deepseek | 纯文本抽取,无需多模态 |
| model | 默认(deepseek-chat) | — |
| temperature | 0.1 | 结构化输出要确定性 |
| max_tokens | 2048 | 单章实体+边足够 |
| 重试 | 解析失败重试 2 次(附错误信息) | 复用 llm_client 的重试思路 |

---

## 10. 评测方法

**基准:黄金标注。** 先人工标注一章(推荐 Kinematics,最熟且复用旧 demo 的 kin-* 节点),手写"应有"的实体+边,再对 LLM 输出算:

- **precision** = 抽出且正确的条目数 / 抽出的条目总数
- **recall** = 抽出且正确的条目数 / 黄金标注条目总数
- 记录**错误分类**(漏抽/多抽/类型错/边错/别名未合并),逐条归类,迭代 prompt。

### 黄金标注示例(Kinematics, Topic 2)

实体(Concept):
- distance(def: scalar, ground covered)、displacement(def: vector, straight-line from start)
- speed(def: distance per unit time, scalar)、velocity(def: rate of change of displacement, vector)
- acceleration(def: rate of change of velocity)、instantaneous velocity
- uniform acceleration(def: constant acceleration)
- gravitational field strength g(别名 → 归 CH1 或 Dynamics?此处属测量场景,归 ch02 也行,注意跨章别重复)

实体(Formula):
- v = Δs/Δt(expression)
- a = Δv/Δt
- SUVAT equations(expression 含四式)  exemplifies: [Modeling & idealization]

实体(Skill):
- read a motion graph(slope = rate, area = accumulated)
- draw a tangent for instantaneous velocity
- choose the right SUVAT equation(write knowns + unknown)
- measure g with light gates(实验技能) exemplifies: [Measurement & uncertainty]

关系:
- BELONGS_TO: 上列全部 → topic-ch02
- CONTRASTED_WITH: distance↔displacement、speed↔velocity
- REQUIRES_SKILL: instantaneous velocity → draw a tangent; SUVAT equations → choose the right SUVAT equation
- PREREQUISITE_OF: displacement → velocity; velocity → acceleration; uniform acceleration → SUVAT equations
- EXEMPLIFIES(展开自 exemplifies 字段):SUVAT equations → Modeling & idealization; measure g → Measurement & uncertainty

> 注意:projectile motion(平抛)若在此章,vector resolution 是其前置;本黄金标注按笔记实际内容增删,别照抄。

---

## 11. 与现有代码的集成点

1. **复用** `core/llm_client.py` 的 `LLMClient.chat()` 与 `_extract_json()`(JSON 提取四策略已写好)。
2. **输出兼容** `tool/knowledge_graph.py` 的 `_load()`:实体 dict 里带 `id` + 其余字段(name/type/definition/expression)均可被保留;relations 用 `source`/`target`/`type`。
3. **provider 配置**复用 `app/config.py` 的 `AppConfig().providers`,无需新配置。
4. **任务 #8 预览(接入 knowledge_framework 时要改的)**:
   - `knowledge_graph.py` 的 `get_related()` 目前只读 COMMONLY_CONFUSED/TESTED_TOGETHER。需新增 `get_contrasts(node_id)`(读 CONTRASTED_WITH)和 `get_equivalent_routes(node_id)`(读 EQUIVALENT_ROUTE),或给 `get_related` 加 edge-type 过滤参数。
   - `skill/knowledge_framework/SKILL.md` Phase 1 增加:可查 CONTRASTED_WITH(辨析对,用于"你混淆了什么")、EXEMPLIFIES 上溯(弱概念→大概念,用于"你在哪个家族里弱")。
   - `tool/knowledge_graph.py` 的 `_load` 已 pop id/type,新增 `exemplifies` 字段会被塞进节点 dict,不影响。

---

## 12. 交付物清单 & 验证命令

交付(Claude Code 实现):
1. `backend/tool/graph_extractor.py`
2. `backend/scripts/extract_graph.py`
3. 跑出 `backend/data/as_physics_graph.json`

验证:
```bash
cd backend
python -m scripts.extract_graph        # 生成 as_physics_graph.json
python - <<'PY'                        # 加载验证
from tool.knowledge_graph import KnowledgeGraph
g = KnowledgeGraph("data/as_physics_graph.json")
print(g.node_count, g.edge_count)      # 预期:17 + N 概念,边数几十
PY
```

评测:对 Kinematics 章算 precision/recall,人工过一遍 20-50 条边。
