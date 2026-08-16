# AS-Level 物理(CAIE 9702)GraphRAG 本体与建图方案

> 状态:DRAFT — 待 henry 确认后进入抽取器实现
> 日期:2026-08-13
> 语料:`backend/data/AS-level-phy-note.txt`(11 章完整笔记,已通读)
> 机器可读本体:`backend/data/ontology.json`(本方案的 JSON 版,抽取器据此校验)

---

## 0. 一句话结论

图分**三层**:**具体层**(Topic/Concept/Formula/Skill,回答"学什么")+ **抽象层**(BigIdea 大概念,回答"怎么串")+ **连接边**(前置/属于/对立/同考/等价路径)。AS 物理没有有机化学那种均匀大网,它是"**6 个大概念 + 8 条跨章节主线 + 二十几组对立辨析对**"——稀疏但精准,每一条线都对应学生的一个真实痛点。

---

## 1. 实体(节点)最终方案:5 类

| 类型 | 中文 | 谁生成 | 说明 |
|---|---|---|---|
| `Topic` | 章节 | **规则**(大纲) | 11 章固定骨架,不交给 LLM |
| `Concept` | 概念/物理量 | LLM 抽取 | 动量、冲量、电势差、相位差… |
| `Formula` | 公式/定律 | LLM 抽取 | 带 `expression` 字段(F=ma、V=IR、I=Anvq…) |
| `Skill` | 解题技能 | LLM 抽取 | 矢量分解、画受力图、读图求斜率/面积… |
| `BigIdea` | 大概念 | **人工手写** | 固定 7 个,LLM 抽抽象会漂,老师锚定 |

**关键决策:BigIdea 不进抽取器。** 概念→大概念的归属(`EXEMPLIFIES`)是**分类**任务(闭集标签),LLM 做分类很稳,做开放抽象抽取会碎片化。

---

## 2. 抽象层:6 个大概念(最终)

| # | 大概念 | 中文 | 覆盖章节 | 备注 |
|---|---|---|---|---|
| 1 | Conservation laws | 守恒律 | 3,5,9,10,11 | 动量/能量/电荷/核子数/轻子数,最深的一条线 |
| 2 | Energy & energy transfer | 能量与能量转移 | 3,5,6,7,9,10 | 碰撞、应变能、电功率、光强全挂这里 |
| 3 | Waves transfer energy without net matter transfer | 波传递能量而不传递物质 | 7,8 | 叠加/干涉/衍射/驻波/偏振整块 |
| 4 | Modeling & idealization | 建模与理想化 | 2,3,9,10 | 质点、匀加速假设、无摩擦、理想电表(零/无穷内阻)、ohmic 假设——命中"什么时候能用 suvat" |
| 5 | Macro–micro correspondence | 宏观–微观 | 9,11,4 | I=Anvq(漂移速度)、电阻率随温度(原子振动)、超导(临界温度)、夸克模型 |
| 6 | Measurement & uncertainty | 测量与不确定度 | 1,2,6,7,10 | 精度/准确度/不确定度传播 + 全部实验题(测 g、杨氏模量、CRO、null measurement) |

> 2026-08-13 定稿:`Fields & causes of force` 已删(用户决定不留);`Measurement & uncertainty` 保留(从 CH1 新增)。共 6 个。

---

## 3. 关系(边)最终方案:8 类

| 类型 | 中文 | 方向 | 来源 | 用途 |
|---|---|---|---|---|
| `PREREQUISITE_OF` | 前置于 | 有向 | 大纲+教材 | 前置链,薄弱点上溯 |
| `REQUIRES_SKILL` | 需要技能 | 有向 | 教材 | 题目→所需技能 |
| `BELONGS_TO` | 属于 | 有向 | 规则 | 概念/公式挂到章节,接回骨架 |
| `EXEMPLIFIES` | 体现大概念 | 有向 | LLM 分类 | 弱概念→大概念,框架"上溯"的关键 |
| `CONTRASTED_WITH` | 对立辨析对 | 无向 | 教材 | 理解区别即学习目标(本次新增) |
| `COMMONLY_CONFUSED` | 易混淆 | 无向 | 错题数据 | 学生真混淆的错因 |
| `TESTED_TOGETHER` | 常同考 | 无向 | 真题 | 高频共现 |
| `EQUIVALENT_ROUTE` | 同题多解 | 无向 | 老师标注 | 选工具决策边 |

**`CONTRASTED_WITH` vs `COMMONLY_CONFUSED` 的区分(本次关键修正):** 前者是教材**故意摆的对子**(理解区别是教学目标),从笔记/教材抽;后者是**错题里的真混淆**,从错题数据抽。两者语义不同、来源不同,混用会污染图。

---

## 4. 具体层锚点:每章关键节点(种子词表)

> 这些是"锚点",保证抽取器有正确的领域词表兜底;完整节点由 LLM 抽取器补齐。英文为规范名(与语料一致)。

- **CH1 物理量与单位**:scalar/vector、base SI units、derived units、homogeneous equation、precision vs accuracy、absolute/fractional/percentage uncertainty、combining uncertainties(±规则)、resolve vector into components
- **Topic 2 运动学**:distance/displacement、speed/velocity、acceleration、SUVAT 四式(v=u+at 等)、displacement/velocity/acceleration-time graphs(斜率=…、面积=…)、instantaneous velocity(切线)、projectile motion、free fall + 测 g 实验
- **Topic 3 动力学**:Newton's 1st/2nd/3rd laws、F=ma、momentum p=mv、impulse、conservation of momentum、elastic/inelastic collision、terminal velocity + air resistance、weight vs mass
- **Topic 4 力/密度/压强**:moment、couple、torque、principle of moments、equilibrium(ΣF=0 & Στ=0)、centre of gravity、density ρ=m/V、pressure p=F/A、Δp=ρgΔh、total pressure vs fluid pressure、upthrust/Archimedes F=ρgV
- **Topic 5 功/能/功率**:work W=Fscosθ、work on gas pΔV、KE=½mv²、GPE=mgΔh、elastic PE(区别)、conservation of energy、efficiency、power P=W/t=Fv
- **Topic 6 形变**:Hooke's law F=kx、limit of proportionality vs elastic limit、stress=F/A、strain=x/L、Young modulus E=FL/(xA)、elastic vs plastic deformation、elastic strain energy ½Fx=½kx²、brittle
- **Topic 7 波**:progressive wave、v=fλ、intensity I=P/A ∝ A²、transverse vs longitudinal、displacement-distance vs displacement-time graph、Doppler effect f₀=f_s·v/(v±v_s)、EM spectrum、polarisation、Malus' law I=I₀cos²θ
- **Topic 8 叠加**:superposition、constructive vs destructive interference、phase/path difference、stationary wave、node/antinode、harmonics、diffraction(单缝)、Young's double-slit λ=ax/D、diffraction grating dsinθ=nλ、coherent source
- **Topic 9 电**:current I=Q/t、I=Anvq(漂移速度)、potential difference V=W/Q、P=VI=I²R=V²/R、Ohm's law、resistance vs resistivity ρ=RA/L、temperature dependence(金属 vs 热敏电阻)、superconductor/Tc、LDR
- **Topic 10 电路**:emf vs terminal p.d.、internal resistance r、ε=I(R+r)、lost volts v=Ir、Kirchhoff 1st(电荷守恒)/2nd(能量守恒)、series vs parallel、potential divider、potentiometer、null measurement
- **Topic 11 粒子物理**:Rutherford scattering、nucleus、nucleon/proton number、isotope、specific charge、alpha/beta-minus/beta-plus decay、antineutrino、conservation of charge/nucleon/lepton number、quark、hadron vs lepton、baryon vs meson、quark changes in β decay

---

## 5. 跨章节主线(框架线索,本次重点)

AS 物理章节间联系"不多但每条都致命"。8 条主线,按价值排序:

1. **力学四合一(选工具枢纽)** — `F=ma` 对时间积分→冲量-动量定理 `∫Fdt=Δp`;对位移积分→功-能定理 `∫Fdx=ΔKE`。把 Topic 2/3/5 焊成一块,是"这题用动量还是能量"的答案来源。边:`EQUIVALENT_ROUTE` + `PREREQUISITE_OF`。
2. **能量守恒贯穿全谱** — 碰撞(3,弹性/非弹性)→ 应变能(6)→ 电功率 I²R(9)→ lost volts(10)→ 光强 I=P/A(7)。一条"能量"线串 5 章。边:`EXEMPLIFIES`(→Energy big idea)。
3. **电路定律 = 守恒律** — 基尔霍夫第一定律=电荷守恒、第二定律=能量守恒。把 Topic 9/10 直接接到 Conservation 大概念。学生最想不到、最该点破。边:`EXEMPLIFIES`。
4. **波→叠加→干涉/衍射/驻波→光栅** — 纯前置链 + 一簇对立对(见下)。Topic 7→8。边:`PREREQUISITE_OF` + `CONTRASTED_WITH`。
5. **矢量/三角/分解 = 数学底座** — CH1 矢量分解喂平抛(2)、受力平衡/力矩(4);三角喂 GPE Δh(5,笔记明确"may involve trigonometry")。边:`PREREQUISITE_OF`/`REQUIRES_SKILL`。
6. **宏观-微观贯穿** — I=Anvq 漂移速度(9)、电阻率随温度=原子振动加剧(9)、超导 Tc(9)、夸克组成质子中子(11)、流体压强从分子碰撞理解(4)。边:`EXEMPLIFIES`(→Macro-micro)。
7. **粒子物理守恒线** — 电荷/核子数/轻子数守恒(11)+ specific charge 复用 CH1 的电荷/质量。边:`EXEMPLIFIES`(→Conservation)。
8. **测量/实验方法贯穿** — CH1 不确定度 + 测 g 实验(2)+ 杨氏模量实验(6)+ CRO 测频/幅(7)+ null measurement/potentiometer(10)。实验题的隐藏主线。边:`EXEMPLIFIES`(→Measurement)。

---

## 6. 对立辨析对清单(CONTRASTED_WITH)

> 从笔记逐条抓取,标 ★ 的为高价值(教材重点考察区别、学生高频错)。

| 对立对 | 章节 | 核心区别一句话 |
|---|---|---|
| scalar ★ / vector | 1 | 有无方向 |
| distance / displacement | 2 | 路程标量 vs 位移矢量 |
| speed / velocity | 2 | 速率 vs 速度(带方向) |
| mass / weight ★ | 3 | 物质惯性 vs 引力作用(mg) |
| elastic / inelastic collision ★ | 3 | 动能是否也守恒 |
| elastic / plastic deformation ★ | 6 | 撤力后是否复原 |
| limit of proportionality / elastic limit | 6 | 胡克定律失效点 vs 塑性起点 |
| stress / strain | 6 | 力/面积 vs 伸长/原长 |
| transverse / longitudinal wave ★ | 7 | 振动⊥ vs ∥传播方向;能否偏振 |
| progressive / stationary wave ★ | 8 | 能量是否传递(驻波不传) |
| diffraction / interference ★ | 8 | 波遇缝展宽 vs 波源叠加出条纹 |
| constructive / destructive | 8 | 相位差 0 vs π |
| node / antinode | 8 | 相消 vs 相长 |
| displacement-distance / displacement-time graph | 7 | 一个时刻全空间 vs 一点全时间 |
| emf / terminal p.d. ★ | 10 | 每库仑总供能 vs 外电路两端电压 |
| series / parallel | 10 | 电流同 vs 电压同 |
| resistance / resistivity ★ | 9 | 器件属性 vs 材料属性 |
| precision / accuracy | 1 | 离散度 vs 离真值 |
| hadron / lepton | 11 | 是否由夸克组成 |
| baryon / meson | 11 | 三夸克 vs 夸克-反夸克 |
| α / β decay | 11 | 出氦核 vs 出电子/正电子 |
| total pressure / fluid pressure | 4 | 含不含大气压 |
| GPE / elastic PE | 5 | 位置储能 vs 形变储能 |

---

## 7. 边类型 × 数据来源映射(落地时用)

| 边 | 来源 | 抽取方式 |
|---|---|---|
| PREREQUISITE_OF / BELONGS_TO | 大纲(规则) | 零成本、100% 准 |
| REQUIRES_SKILL / CONTRASTED_WITH / EXEMPLIFIES | 笔记(LLM 分类/抽取) | LLM + 本体硬约束 |
| COMMONLY_CONFUSED | 错题数据 | 后置(有错题再补,不是 MVP) |
| TESTED_TOGETHER | 真题 | 后置 |
| EQUIVALENT_ROUTE | 老师标注 | 手工,量小价值大 |

---

## 8. 落地顺序

1. 本体确认(本文档 + ontology.json)
2. 大纲骨架:11 Topic + BELONGS_TO 锚点(规则)
3. 抽取器:抽 Concept/Formula/Skill + CONTRASTED_WITH/REQUIRES_SKILL/EXEMPLIFIES,本体校验
4. 试点:力学四合一(Topic 2/3/5,复用现有 kin-*/dyn-*)
5. 接入 knowledge_graph.py + knowledge_framework skill(EQUIVALENT_ROUTE 出"选工具"建议)
6. 扩展:电学公式网(Topic 9/10)+ 波/叠加(Topic 7/8)+ 粒子(11)

---

## 9. 已拍板(2026-08-13)

1. `Fields & causes of force` → **不留**,已从大概念删除(共 6 个)。
2. `Measurement & uncertainty` → **接受**,保留为第 6 大概念。
3. `CONTRASTED_WITH` → **没问题**,与 `COMMONLY_CONFUSED` 拆开。

## 10. 语义对齐 & 后置边(两问答复)

**语义对齐:现在只做轻量对齐,不上 embedding。** 语料仅一个 txt(11 章、~700 行),本体闭集,embedding 消歧留到 Scale 阶段(多源语料/题目文本时)。轻量三件套:① 规范名词典(§4 种子词表),抽取器要求"映射到规范名、不造同义词";② 归一化 key 去重(node id = 规范名 slug,"linear momentum" 与 "momentum" 同 key 合并);③ 小同义表(手写 30-50 条,如 linear momentum=momentum、Newton's 2nd law=F=ma、p.d.=potential difference)。**升级触发条件**:语料变多源(教材/真题/评分标准措辞不同)、或开始吃题目文本(噪声大)。

**对齐的坑(提前定规则):** "牛顿第二定律"和 "F=ma" 是同一个东西——命名定律算 `Concept`(定义字段里带公式),匿名方程(SUVAT、V=IR、P=VI)才单独立 `Formula` 节点,避免抽出一堆"定律名 vs 公式"重复节点。

**TESTED_TOGETHER 与 COMMONLY_CONFUSED:后补,设计内。** MVP 不填这两条边,但本体已预留槽位,`knowledge_graph.py` 的 `get_related()` 已在读它们——数据没到时框架输出自然不含"易混淆/常同考"建议,优雅降级不报错。填充时机:错题数据攒出后(COMMONLY_CONFUSED)、真题标注后(TESTED_TOGETHER),跑增量脚本补入。老师可先手种子几条高价值混淆(动量vs动能、mass vs weight),但"真混淆"应来自错题数据才诚实。
