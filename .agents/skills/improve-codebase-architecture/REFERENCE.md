# 参考（Reference）

## 依赖类别（Dependency Categories）

在评估候选深化（deepening）目标时，对其依赖进行分类：

### 1. 进程内（In-process）

纯计算、内存状态，不涉及 I/O。永远可以加深——直接合并模块并进行直接测试。

### 2. 本地可替代（Local-substitutable）

存在本地测试替身的依赖（例如：PGLite 用于 Postgres，或内存文件系统）。如果测试替身存在，则可以加深。加深后的模块会在测试套件中用本地替身运行进行验证。

### 3. 远程但由你方拥有（Ports & Adapters）

跨越网络边界、你们自身的服务（例如微服务或内部 API）。在模块边界定义一个端口（port，接口）。深模块拥有业务逻辑，传输（transport）被注入。测试使用内存适配器；生产使用真实的 HTTP/gRPC/队列适配器。

推荐形态（Recommendation shape）：

> 定义一个共享接口（端口 port），生产环境实现一个 HTTP 适配器，测试环境实现一个内存适配器。这样即使该逻辑部署在网络边界之外，你仍然可以把它当作一个深模块来测试。

### 4. 真正的外部（Mock）

第三方服务（Stripe、Twilio 等），由你们不控制。只在边界处 mock。深模块把外部依赖作为注入端口（injected port）接收，测试则提供一个 mock 实现。

## 测试策略（Testing Strategy）

核心原则：**替换（replace），不要分层（don't layer）。**

- 一旦有了边界测试（boundary tests），浅模块上的旧单元测试就失去了价值——可以删除它们
- 在深模块的接口边界上编写新的测试
- 测试应当通过公共接口断言可观察结果，而不是断言内部状态
- 测试要在内部重构后仍能存活——它们描述的是行为，而不是实现

## Issue 模板（Issue Template）

<issue-template>
## 问题（Problem）

描述架构摩擦点（architectural friction）：

- 哪些模块是“浅”的（shallow）并且高度耦合？
- 在它们之间的集成缝隙（seams）存在怎样的集成风险？
- 为什么这会让代码库更难被理解与维护？

## 拟议接口（Proposed Interface）

你选择的接口设计：

- 接口签名（types、methods、params）
- 使用示例（展示调用方如何使用它）
- 它在内部隐藏的复杂度是什么

## 依赖策略（Dependency Strategy）

对应哪个依赖类别，以及依赖如何处理：

- **进程内（In-process）**：直接合并
- **本地可替代（Local-substitutable）**：用 [特定替身（specific stand-in）] 来测试
- **Ports & adapters（端口与适配器）**：端口定义 + 生产适配器 + 测试适配器
- **Mock**：对外部服务在边界处进行 mock

## 测试策略（Testing Strategy）

- **需要新增的边界测试**：描述在接口处需要验证的行为
- **需要删除的旧测试**：列出那些在浅模块上、不再需要的测试
- **测试环境需要什么**：列出任何本地替身或适配器

## 实现建议（Implementation Recommendations）

可持续的架构指导：不耦合到当前文件路径。

- 模块应当拥有哪些职责（responsibilities）
- 应当隐藏哪些实现细节（what it should hide）
- 应当暴露哪些接口合约（the interface contract）
- 调用方如何迁移到新的接口（how callers should migrate）

</issue-template>

