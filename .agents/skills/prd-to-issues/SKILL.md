---
name: prd-to-issues
description: 使用 tracer-bullet 竖向切片法，把 PRD 拆分成彼此独立、可以直接认领的 GitHub issues（并形成对应的实现工单）。适用于用户想把 PRD 转成 issues、创建实现任务，或把 PRD 拆成工作项。
---

# PRD 转 Issues

使用 tracer-bullet（示踪子弹/纵向切片）方法，把 PRD 拆分成彼此独立、可以直接认领的 GitHub issues。

## 过程

### 1. 定位 PRD

请向用户索要 PRD 的 GitHub issue 编号（或 URL）。

如果 PRD 还不在你的上下文窗口中，可以用 `gh issue view <number>` 获取（带 comments）。

### 2. 探索代码库（可选）

如果你还没有探索代码库，为了理解现状，你可以先探索代码库。

### 3. 起草竖向切片

把 PRD 拆成 **tracer bullet** issues。每个 issue 都是一条足够薄的“贯穿式竖向切片（vertical slice）”：它要切穿所有集成层（schema、API、UI、tests），而不是只对某一层做横向拆分。

切片可能是：

- `HITL`：需要人类参与（例如需要做出架构决策或设计评审）
- `AFK`：无需人类参与，可以直接实现并合并

优先使用 `AFK`，尽可能减少 `HITL`。

<vertical-slice-rules>
- 每个切片都要提供一条狭窄但完整的端到端路径（覆盖 schema、API、UI、tests 等）
- 完成的切片应当可演示或可独立验证
- 尽量用更多更薄的切片，而不是少数很厚的切片
</vertical-slice-rules>

### 4. 让用户“投票确认”

把你建议的拆分结果以“编号列表”的形式呈现。对每个切片，展示：

- **Title**：短而有描述性的标题
- **Type**：HITL / AFK
- **Blocked by**：哪些切片需要先完成（如有）
- **User stories covered**：覆盖了 PRD 中哪些用户故事

然后提问让用户确认：

- 切片的粒度是否合适？（太粗 / 太细）
- 依赖关系是否正确？
- 是否正确标注了 HITL 和 AFK？

根据用户反馈，反复迭代直到用户认可拆分结果。

### 5. 创建 GitHub issues

对于每个已批准的切片，使用 `gh issue create` 创建 GitHub issue。并使用如下 issue body 模板。

按依赖顺序创建 issues（先创建 blockers），这样你在 “Blocked by” 字段里就能引用到真实的 issue 编号。

<issue-template>
## 父级 PRD（Parent PRD）

#<prd-issue-number>

## 要构建什么（What to build）

对该竖向切片的简洁描述。描述端到端的最终行为，而不是按层逐一解释实现方式。应引用父级 PRD 的具体章节，而不是重复父级 PRD 的内容。

## 验收标准（Acceptance criteria）

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## 被哪些项阻塞（Blocked by）

- Blocked by #<issue-number>（如有）

若无阻塞，则写：`None - can start immediately`

## 涉及哪些用户故事（User stories addressed）

按父级 PRD 中的编号引用：

- User story 3
- User story 7
</issue-template>

**不要**关闭或修改父级 PRD issue。

