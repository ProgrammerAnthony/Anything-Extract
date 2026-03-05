---
name: backend-code-review
description: 指导在项目（python项目）中队后端代码进行质量、安全、可维护性与最佳实践审查，基于既定规则清单。适用于用户请求对 backend/ 下后端文件（如 .py）进行审查、分析或改进。不用于前端文件（如 .tsx、.ts、.js）。支持待提交变更审查、代码片段审查、按文件审查。
---

# Backend Code Review（后端代码审查）

## 何时使用本 Skill

当用户要求**审查、分析或改进**当前项目的后端代码（如 `.py` 文件）时使用本 skill。审查范围以用户指定或项目约定为准，常见为项目中的后端根目录（如 `backend/`、`api/` 等）。支持以下审查模式：

- **待提交变更审查**：用户要求审查当前变更（查看已暂存/工作区中拟提交的变更）。
- **代码片段审查**：用户粘贴代码片段（如函数/类/模块摘录）并请求审查。
- **按文件审查**：用户指定一个或少量文件（如后端下的 `app/api/...`、`services/...` 等）请求审查。

以下情况**不要**使用本 skill：

- 请求涉及前端代码或 UI（如 `.tsx`、`.ts`、`.js`、`web/`、前端 `app/` 等）。
- 用户并非要求对后端代码进行审查/分析/改进。
- 审查范围不在项目约定的后端目录下（除非用户明确要求审查后端相关但位于别处的改动）。

## 如何使用本 Skill

1. **确定审查模式**（待提交变更 / 片段 / 按文件），并根据用户输入限定范围：只审查用户提供或明确引用的内容。
2. 按 **Checklist** 中的规则执行审查。若没有匹配的 Checklist 规则，则使用 **General Review Rules** 做尽力审查。
3. 最终输出**必须**严格遵循 **Required Output Format**。

注意：
- 始终给出可执行的修复或建议（可含代码示例）。
- 若有文件路径与行号，尽量使用 `File:Line` 引用；否则使用最具体的标识。

## 项目后端结构（审查范围参考）

以下为常见 Python 后端分层示例，实际路径以**当前项目**为准（后端根目录可能是 `backend/`、`api/` 等）：

- **API 层**：路由/控制器（如 `app/api/`、`api/`）
- **服务层**：业务逻辑与编排（如 `services/`）
- **核心/领域**：数据库、配置、领域核心（如 `core/`）
- **数据模型**：ORM 模型与 Session（如 `core/database.py`、`models/`）
- **领域模型**：DTO/实体（如 `app/models/`，无 DB）
- **提供方**：外部能力封装（如 `providers/`）
- **工具**：通用工具（如 `utils/`）
- **Worker**：异步/队列消费（如 `workers/`）
- 若项目**无**独立 repository 层，数据访问多在 API 或 service 中通过 `db.query(Model)` 完成；复杂或重复查询建议收敛到 service 或后续引入 repository。

## Checklist

- **db schema 设计**：若审查范围包含模型定义或迁移/init 逻辑（如 `core/database.py`、`init_db`），按 [references/db-schema-rule.md](references/db-schema-rule.md) 审查。
- **architecture**：若涉及 router/service/core/provider 分层、依赖方向、职责归属，按 [references/architecture-rule.md](references/architecture-rule.md) 审查。
- **data access**：若审查范围包含对表/模型的查询与写入（如 `db.query(...)`、`session.execute(...)`、CRUD），且逻辑分散在 router 或重复出现，按 [references/data-access-rule.md](references/data-access-rule.md) 审查。
- **sqlalchemy 使用**：若涉及 Session/事务、查询构造、knowledge_base_id 作用域、原始 SQL，按 [references/sqlalchemy-rule.md](references/sqlalchemy-rule.md) 审查。

## General Review Rules

### 1. Security

- SQL 注入、SSRF、命令注入、不安全反序列化
- 硬编码密钥或凭证
- 不当的鉴权/授权
- 不安全的直接对象引用（如未校验 knowledge_base_id 即访问文档/分段）

### 2. Performance

- N+1 查询
- 缺失的数据库索引
- 在异步路径中的阻塞操作
- 可缓存而未缓存

### 3. Code Quality

- 向前兼容性、重复代码（DRY）、单职责违反
- 过深嵌套与复杂条件
- 魔法数字/字符串、命名不清
- 缺失错误处理、类型标注不完整

### 4. Testing

- 新代码缺少测试、测试未覆盖行为、不稳定测试模式、缺少边界情况

## Required Output Format

审查结果必须严格采用以下两种模板之一。

### Template A（存在问题时）

```markdown
# Code Review Summary

Found <X> critical issues need to be fixed:

## 🔴 Critical (Must Fix)

### 1. <简要描述>

FilePath: <path> line <line>
<相关代码片段或引用>

#### Explanation

<详细说明与依据>

#### Suggested Fix

1. <修复建议>
2. <代码示例>（可选，不适用可省略）

---
（每个 critical 重复上述结构）

Found <Y> suggestions for improvement:

## 🟡 Suggestions (Should Consider)

### 1. <简要描述>
...
（结构同上）

Found <Z> optional nits:

## 🟢 Nits (Optional)
...
（结构同上）

## ✅ What's Good

- <对良好模式的正面反馈>
```

- 若没有 critical/suggestions/nits/good，则省略对应区块。
- 若某项数量超过 10，可汇总为 "Found 10+ critical issues/..." 且只列出前 10 条。
- 若存在需要改代码的问题，可在结构化输出后附一句简短追问，例如："需要我按上述建议直接改代码吗？"

### Template B（无问题时）

```markdown
## Code Review Summary
✅ No issues found.
```
