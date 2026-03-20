---
name: improve-codebase-architecture
description: 探索代码库以发现架构改进机会，重点让代码库更容易测试：通过“加深浅模块（deepening shallow modules）”的方式重构模块结构。适用于用户想改善架构、寻找可重构机会、整合强耦合模块、或让代码库更便于 AI 导航与理解。
---

# 改进代码库架构

像 AI 一样探索一整个代码库：暴露架构摩擦点（architectural friction），发现提升可测试性的机会，并以 GitHub issue/RFC 的形式提出“模块加深（module-deepening）”的重构建议。

所谓**深模块（deep module）**（John Ousterhout，《A Philosophy of Software Design》）具有“小接口（small interface）+ 大量实现隐藏”的特征。深模块更容易测试、更便于 AI 导航，并能让你在边界处测试，而不是在内部内部测。

## 流程（Process）

### 1. 探索代码库

使用 Agent 工具（subagent_type=Explore）自然地浏览代码库。不要使用僵硬的启发式规则（heuristics）——要“有机探索”，并记录你在理解过程中感受到的摩擦：

- 理解一个概念往往需要在很多很小的文件之间来回跳转，这种情况在哪里？
- 哪些模块过于“浅”（shallow）导致接口几乎和实现一样复杂？
- 是否曾经抽出了纯函数让它们更易测试，但真正的 bug 藏在“它们如何被调用”之中？
- 哪些强耦合模块在彼此的缝隙（seams）处制造了集成风险？
- 代码库中哪些部分没有被测试，或者很难测试？

你遇到的摩擦点就是信号（the friction IS the signal）。

### 2. 给出候选项

以“编号列表”的形式呈现深化（deepening）的机会。对每个候选项，展示：

- **聚类（Cluster）**：涉及哪些模块/概念
- **为什么耦合**：共享类型、调用模式、对某一概念的共同所有（co-ownership）
- **依赖类别（Dependency category）**：依赖类别的划分见 [REFERENCE.md](REFERENCE.md) 的四种分类
- **测试影响（Test impact）**：哪些现有测试会被边界测试（boundary tests）替代

目前**不要**提出具体接口设计。先问用户：`你想要进一步探索这些候选项里的哪一个？`

### 3. 用户选择候选项

### 4. 刻画问题空间

在启动子 agent 之前，先给出一个面向用户的问题空间说明（user-facing explanation），用于所选候选项：

- 新接口需要满足的约束条件
- 新接口需要依赖的内容
- 一个粗略的示意代码草图，用来把约束落到具体形态上——这不是提案，只是为了让约束更具体

把这些内容展示给用户，然后立刻进入第 5 步：让用户阅读并思考的同时，子 agent 会并行工作。

### 5. 设计多个接口方案

使用 Agent 工具并行启动 3 个以上的子 agent。每个子 agent 都必须为“深模块（deepened module）”输出一种**根本不同（radically different）**的接口设计。

为每个子 agent 提供独立的技术简报（文件路径、耦合细节、依赖类别、需要隐藏的复杂度等）。该简报与第 4 步面向用户的解释互相独立。并确保每个 agent 的设计约束不同：

- Agent 1：`尽量缩小接口——目标是最多 1-3 个入口点`
- Agent 2：`尽量提升灵活性——支持尽可能多的用例与扩展`
- Agent 3：`优化最常见的调用者——让默认场景变得非常简单`
- Agent 4（若适用）：`围绕 ports & adapters 模式为跨边界依赖进行设计`

每个子 agent 的输出应包含：

1. 接口签名（types、方法、参数）
2. 使用示例（展示调用方如何使用）
3. 内部隐藏了哪些复杂度
4. 依赖策略（如何处理依赖——见 [REFERENCE.md](REFERENCE.md)）
5. 方案的取舍（trade-offs）

把这些设计方案按顺序呈现，然后用文字进行对比分析。

对比之后，给出你自己的推荐：你认为哪一种设计最强，并说明原因。如果不同设计的要素有组合空间，可以提出混合方案。要“有主见”——用户想要的是有分量的判断，而不只是菜单式列举。

### 6. 用户选择接口（或接受推荐）

### 7. 创建 GitHub issue

使用 `gh issue create` 把一次“重构 RFC（refactor RFC）”创建成 GitHub issue。并使用 [REFERENCE.md](REFERENCE.md) 中的模板。

**不要**要求用户在创建之前先审核——直接创建并把 URL 发给用户。

