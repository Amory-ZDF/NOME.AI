# SKILL.md 编写教程

> 面向 NOME.AI backend 的 SKILL.md 编写指南,综合自 Anthropic 官方文档、GitHub 社区实践与 HuggingFace 实践。给 Claude Code 参考使用——本文件自包含,不依赖联网。

---

## 1. 什么是 Skill(SKILL.md)

**Skill 是"按需加载的专家指南"。** 它把一个特定任务的完整工作流打包成一个目录:指令(`SKILL.md`)+ 可执行脚本(`scripts/`)+ 按需读取的参考文档(`references/`)+ 输出用资源(`assets/`)。

核心心智模型:

| | CLAUDE.md | Skill (SKILL.md) |
|---|---|---|
| 加载时机 | 每次会话开始**总是加载** | **按需触发**,只在任务相关时加载 |
| 适用范围 | 项目级不变规则、编码规范 | 特定任务的工作流、领域知识 |
| 上下文成本 | 每个会话都占用 | 只在被选中时占用 |
| 结构 | 单个文件 | 目录 + 资源 |

**对 NOME.AI backend 的含义:** 本项目的 `skill/loader.py` 会把 SKILL.md 的正文直接作为 LLM 的 system prompt。因此这里的 SKILL.md 是"给 LLM 看的操作手册",不是给人看的文档——只写模型不知道、或容易做错的部分。现有 `skill/progressive_hint/SKILL.md` 是一个很好的范例,值得模仿。

---

## 2. 目录结构

```
skill-name/
├── SKILL.md              # 必选:指令正文 + YAML frontmatter
├── scripts/              # 可选:可执行代码(运行时执行,不加载进上下文)
├── references/           # 可选:需要时按需加载的参考文档
└── assets/               # 可选:输出用文件(模板/图片,永不加载)
```

**本项目现状:** backend/skill 下每个 skill 只有 `SKILL.md` + `schema.py`,没有 scripts/references。这是合理的——`schema.py` 由 Python 代码加载,SKILL.md 正文即 system prompt。

---

## 3. YAML Frontmatter 规范

**`---` 必须是文件第一行。** 不允许"`# 标题` + `## Metadata` + yaml 代码块"的写法,也不允许 `---` 前面有任何内容。

```yaml
---
name: processing-pdfs                    # 必选:小写连字符,≤64字符
description: >-                          # 必选:做什么 + 何时用,≤1024字符
  Extract text and tables from PDF files, fill forms, merge documents.
  Use when working with PDF files or when user mentions PDFs, forms,
  or document extraction.
allowed-tools: Read, Write, Bash(git:*)   # 可选:工具白名单,最小权限
---
```

### 字段校验规则

| 字段 | 规则 |
|---|---|
| `name` | ≤64 字符,仅 `[a-z0-9-]`,不允许含 `anthropic`/`claude` |
| `description` | ≤1024 字符,非空,不允许包含 XML 标签 |
| `allowed-tools` | 可选,限定 skill 运行时允许的工具,遵循最小权限 |

### name 命名

**优先动名词形式(verb + -ing):**

```
✓ processing-pdfs      ✓ analyzing-spreadsheets
✓ testing-code         ✓ managing-databases
✗ helper / utils / tools   (太模糊)
✗ documents / data / files (太泛)
```

本项目现有命名 `progressive-hint`、`error-diagnosis`、`knowledge-framework` 符合规范。

---

## 4. description 是触发的关键

Claude 用**纯 LLM 推理**在所有 skill 的 description 里做选择——不是关键词匹配、不是 embedding 相似度。所以 **description 写得差 = skill 永远不会被触发**。

### 写作规则

1. **永远用第三人称**:"Processes Excel files",不是 "I can help you" 或 "You can use this"
2. **写清楚"做什么 + 何时用"** — 含触发短语
3. **包含用户可能说的同义词**,提高命中率

```yaml
# GOOD — 具体,含触发词
description: >-
  Analyze Excel spreadsheets, create pivot tables, generate charts.
  Use when analyzing Excel files, spreadsheets, tabular data, or .xlsx files.

# GOOD — 动作 + 使用场景
description: >-
  Generate descriptive commit messages by analyzing git diffs.
  Use when user asks for help writing commit messages or reviewing staged changes.

# BAD — 太模糊,永远不会被触发
description: Helps with documents
description: Processes data
```

### 本项目 description 的要点

本项目 SKILL.md 的 description 还会被 `loader.py` 的 `load_skill_metadata()` 读取(作为元数据返回)。所以 description 除了触发,还要是**准确的任务摘要**,方便上层做路由/记录。

---

## 5. 正文结构

### 5.1 总原则:简洁即生存

上下文是公共资源。默认假设 **"Claude 已经很聪明"**,只补充它不知道的东西。

```markdown
# BAD(~150 tokens)— 解释显而易见的事
PDF (Portable Document Format) files are a common file format that contains
text, images, and other content. To extract text from a PDF, you'll need to
use a library. There are many libraries available...

# GOOD(~50 tokens)— 假设能力,直接给方法
## Extract PDF text
Use pdfplumber:
```python
import pdfplumber
with pdfplumber.open("file.pdf") as pdf:
    text = pdf.pages[0].extract_text()
```
```

逐行问自己:**"Claude 需要这个吗?它值得花这个 token 吗?"**

### 5.2 目标长度

- SKILL.md 正文:**<500 行**。超过就把细节拆到 references/。
- 本项目没有 references 加载机制(loader 只读 SKILL.md),所以**正文要自包含**,但依然要克制。

### 5.3 渐进式披露(Progressive Disclosure)

把 SKILL.md 当**总览 + 指针**,详情放 references/,需要时才加载。

```markdown
# In SKILL.md — 概览 + 指针
## Quick start
[Essential code example]

## Advanced features
- **Form filling**: See [FORMS.md](references/FORMS.md)
- **API reference**: See [REFERENCE.md](references/REFERENCE.md)
```

关键规则:

- 引用**只保持一层深度**:SKILL.md → references/xxx.md ✓;SKILL.md → a.md → b.md ✗(Claude 会部分读取)
- 长文件(>100 行)顶部放目录(TOC)
- 大文件(>1 万词)在 SKILL.md 里给 grep 命令,让 Claude 定向检索

**对本项目的特别说明:** 你们的 loader 把 SKILL.md 全文当 system prompt,没有渐进式加载 references 的机制。所以这里要"渐进式"地组织**内容层级**,而不是物理拆文件——把"核心必做流程"放前面、把"边缘情况/细节规则"放后面,Claude 对前面的指令执行得更稳定。

---

## 6. 内容设计原则

### 6.1 自由度分级

按任务的脆弱程度匹配指令的具体度:

| 自由度 | 适用场景 | 示例 |
|---|---|---|
| **高** | 多种合理方案、依赖上下文 | 代码评审指南 |
| **中** | 有偏好模式、允许一定变化 | 报告模板,可自定义区块 |
| **低** | 易错、一致性要求高 | DB 迁移脚本——精确命令,不留选择空间 |

**窄桥带悬崖 = 低自由度(给精确护栏);开阔田野 = 高自由度(给方向)。**

### 6.2 示例优于解释

```markdown
## Commit message format

**Example 1:**
Input: Added user authentication with JWT
Output:
```
feat(auth): implement JWT-based authentication

Add login endpoint and token validation middleware
```

**Example 2:**
Input: Fixed date display bug in reports
Output:
```
fix(reports): correct date formatting in timezone conversion
```

Follow this style: type(scope): brief description, then details.
```

### 6.3 工作流模式

**清单模式(复杂多步)** — 复制进度 checkbox,每步给精确命令:

```markdown
## Form filling workflow

Copy and track progress:
- [ ] Step 1: Analyze form (run analyze_form.py)
- [ ] Step 2: Create field mapping (edit fields.json)
- [ ] Step 3: Validate mapping (run validate_fields.py)

**Step 1: Analyze the form**
Run: `python scripts/analyze_form.py input.pdf`
```

**反馈循环模式(质量关键)** — 改完立即验证:

```markdown
## Validation loop

1. Make edits to document
2. **Validate immediately**: `python scripts/validate.py output/`
3. If validation fails: review error, fix, run again
4. **Only proceed when validation passes**
```

**条件分支模式:**

```markdown
## Document modification

1. Determine type:
   - **Creating new?** → Follow "Creation workflow"
   - **Editing existing?** → Follow "Editing workflow"
```

---

## 7. 反模式(不要做)

### 不要放这些文件/内容

- README.md、CHANGELOG.md、安装指南、用户文档
- 设置/测试流程(除非 skill 本身要执行测试)
- 关于"创建过程"的背景叙述

**Skill 是给 AI agent 用的,不是给人看的。**

### 常见反模式表

| 反模式 | 为什么坏 | 修正 |
|---|---|---|
| Windows 路径(`scripts\helper.py`) | Unix 上崩 | 用正斜杠 |
| 深层嵌套引用 | Claude 部分读取 | 只保持一层深度 |
| 时效性信息 | 会过时 | 用"Current method" + `<details>` 折叠旧方案 |
| 太多选项没默认 | 让模型困惑 | 给默认值 + 逃生通道 |
| 模糊 description | 永不触发 | 具体 + 触发短语 |
| 术语不统一 | 混淆 Claude | 全篇只用一种说法 |
| 魔法数字 | 无法验证 | 解释每个值为什么 |
| 把错误处理丢给 Claude | 不可靠 | 在脚本里显式处理 |

### 反例:多选项无默认

```markdown
# BAD
"You can use pypdf, or pdfplumber, or PyMuPDF, or pdf2image..."

# GOOD
"Use pdfplumber for text extraction:
[code]
For scanned PDFs requiring OCR, use pdf2image with pytesseract instead."
```

---

## 8. 脚本与资源的最佳实践

### scripts/ — 可执行代码

**什么时候放脚本:** 同一段代码反复重写、需要确定性可靠性的场景。

- **Token 高效**:执行时不加载进上下文
- **确定性**:没有生成差异
- **跨场景一致**

在 SKILL.md 里要区分两种用法:

```markdown
# 执行(最常见)
Run `python scripts/validate.py input.pdf`

# 作为参考阅读(罕见,复杂逻辑时)
See `scripts/validate.py` for the validation algorithm
```

### 脚本要求

- 显式错误处理(不抛给 Claude 猜)
- 清晰的退出码(0=成功,非0=失败原因可区分)
- 不用魔法数字(每个值写注释说明为什么)

---

## 9. 测试与迭代

### 开发流程

1. **先不带 skill 做一遍任务** — 记录你反复提供的上下文
2. **找出可复用模式** — 什么能帮助未来的类似任务?
3. **建最小 skill** — 刚好填补缺口即可
4. **用全新 Claude 实例测试** — 能正确找到信息、应用规则吗?
5. **根据观察迭代** — 它漏了什么?哪里困惑了?

### 测试清单

```
□ description 能在预期短语上触发
□ description 不会在无关请求上误触发
□ 小模型(Haiku)下需要更多引导?
□ 大模型(Opus)下是否过度解释?
□ 脚本无错误执行
□ 参考文件在预期时机加载
□ 验证循环能捕获错误
□ 真实使用场景通过
```

---

## 10. 完整模板

> 本项目 loader 会把正文作为 system prompt,所以模板没有 references/scripts 段——已按你的架构裁剪。复制后替换 `{{变量}}`。

```markdown
---
name: {{skill-name}}           # 小写连字符
description: >-                # 第三人称 + 触发词,≤1024字符
  {{一句话描述这个 skill 做什么}}。
  Use when {{触发场景:用户/编排器在什么情况下调用它}}。
tags: [{{p0|p1|p2}}, skill]    # 本项目风格:优先级标签
---

# {{Display Name}}

## When to use

Invoke this skill when {{触发条件}}.

Do NOT invoke if:
- {{不触发的边界情况1}}
- {{不触发的边界情况2}}

## Input (provided by orchestrator)

You will receive a JSON object:

```json
{
  "{{字段1}}": "{{类型 — 含义}}",
  "{{字段2}}": "{{可选? 含义}}"
}
```

## Process

### Phase 1: {{阶段名}}

{{核心步骤,按顺序写。给精确指令,不留歧义。}}

### Phase 2: {{阶段名}}

{{继续。每条规则直接说清做什么/不做什么。}}

## Output

Output a JSON object:

```json
{
  "{{输出字段1}}": "{{含义}}",
  "{{输出字段2}}": "{{含义}}"
}
```

Rules:
- {{输出约束1:格式/语言/禁止项}}
- {{输出约束2}}

## Edge cases

- {{特殊情况1}}: {{怎么处理}}
- {{特殊情况2}}: {{怎么处理}}

## Tone / style notes

{{如果有语气/风格要求,写在这里。没有就删掉这段。}}
```

### 完整示例(可对照 backend/skill/progressive_hint/SKILL.md)

```markdown
---
name: my-skill
description: >
  Do X for Y. Use when the orchestrator plans a my_skill step,
  or when the user asks about Z.
tags: [p1, skill]
---

# My Skill

## When to use

Invoke when {{触发}}.

Do NOT invoke if:
- {{边界情况}}

## Process

1. {{第一步}}
2. {{第二步}}

## Output

```json
{"result": "..."}
```

Rules:
- {{约束}}
```

---

## 11. 参考来源

- [Anthropic 官方文档:Skill Authoring Best Practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- [Anthropic 官方文档:Agent Skills / Claude Code Skills](https://code.claude.com/docs/en/skills)
- [Anthropic 博客:Lessons from building Claude Code: How we use skills](https://claude.com/blog/lessons-from-building-claude-code-how-we-use-skills)
- [GitHub:anthropics/skills 官方仓库](https://github.com/anthropics/skills)
- [GitHub:Dicklesworthstone/meta_skill — SKILL.md 最佳实践汇总](https://github.com/Dicklesworthstone/meta_skill/blob/main/BEST_PRACTICES_FOR_WRITING_AND_USING_SKILLS_MD_FILES.md)
- [GitHub:huggingface/skills 仓库(官方)](https://github.com/huggingface/skills/blob/main/README.md)
- [HuggingFace 课程:Using Skills with Code Agents](https://huggingface.co/learn/context-course/unit1/using-skills)
- [Agent Skills 开放标准](https://agentskills.io/home)
- [GitHub:catlog22/Claude-Code-Workflow — skill-generator 模板](https://github.com/catlog22/Claude-Code-Workflow)

---

## 快速自查卡

```
□ name: 小写连字符,≤64字符
□ description: 第三人称、具体触发词、≤1024字符
□ 正文 <500 行
□ 引用只一层深度
□ 脚本经过测试、显式错误处理
□ 无魔法数字(所有值有注释)
□ 只正斜杠路径
□ 无 README/CHANGELOG 等多余文档
□ 术语统一
□ 示例具体,不抽象
□ 真实场景测试通过
```
