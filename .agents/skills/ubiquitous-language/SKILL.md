---
name: ubiquitous-language
description: 从当前对话中抽取 DDD 风格的“统一语言”术语表（ubiquitous language glossary），标记歧义，并提出规范的术语选择。保存为 `UBIQUITOUS_LANGUAGE.md`。适用于用户希望定义领域术语、构建术语表、固化用词并强化术语一致性，或提到 “domain model” / “DDD”（领域模型与 DDD）。
---

# 统一语言（Ubiquitous Language）

从当前对话中抽取并形式化领域术语，整理为一份一致的术语表，并保存到本地文件中。

## 流程（Process）

1. 在对话中扫描领域相关的名词、动词与概念
2. 识别问题：
   - 同一个词被用于不同概念（歧义）
   - 不同词被用于同一概念（同义/别名）
   - 含糊或过载的术语
3. 提出一套“规范/首选”的术语表（带有你自己的选择偏好）
4. 按下方格式写入 `UBIQUITOUS_LANGUAGE.md` 到工作目录
5. 在对话中内联输出一个总结

## 输出格式（Output Format）

将写出一个 `UBIQUITOUS_LANGUAGE.md` 文件，结构如下：

```md
# 统一语言（Ubiquitous Language）

## 订单生命周期（Order lifecycle）

| 术语 | 定义 | 应避免的别名 |
|------|-----------|-----------------|
| **Order** | 客户发起的一次购买一个或多个商品的请求 | Purchase, transaction |
| **Invoice** | 在交付之后发送给客户的付款请求 | Bill, payment request |

## 人员（People）

| 术语 | 定义 | 应避免的别名 |
|------|-----------|-----------------|
| **Customer** | 下单的个人或组织 | Client, buyer, account |
| **User** | 系统中的某个认证身份（authentication identity）| Login, account |

## 关系（Relationships）

- **Invoice** 必然且仅必然属于一个且仅一个 **Customer**
- **Order** 会产生一个或多个 **Invoices**

## 示例对话（Example dialogue）

> **Dev:** “当一个 **Customer** 发起 **Order** 时，我们是否会立即创建 **Invoice**？”
> **领域专家（Domain expert）:** “不。只有在确认 **Fulfillment** 之后，才会生成 **Invoice**。如果订单中的商品分批发货（**Shipments**），单个 **Order** 可能会产生多个 **Invoices**。”
> **Dev:** “那如果某个 **Shipment** 在发货前被取消，会不会生成对应的 **Invoice**？”
> **领域专家（Domain expert）:** “不会。**Invoice** 的生命周期与 **Fulfillment** 绑定，而不是与 **Order** 绑定。”

## 标记出的歧义（Flagged ambiguities）

- “account” 被同时用来表示 **Customer** 和 **User**——这两个概念是不同的：**Customer** 会下订单；而 **User** 是一种认证身份，它可能代表某个 **Customer**，也可能不代表。
```

## 规则（Rules）

- **要有主见（Be opinionated）。** 当多个词被用于同一概念时，选择最合适的那个，并把其他词作为“应避免的别名”列出。
- **明确标记冲突（Flag conflicts explicitly）。** 如果某个术语在对话里出现歧义，请在 “Flagged ambiguities（标记出的歧义）” 部分指出，并给出清晰建议。
- **定义要收敛（Keep definitions tight）。** 每个定义最多一句话。说明它“是什么”，而不是它“会做什么”。
- **展示关系（Show relationships）。** 使用加粗术语名称，并在显而易见处表达基数/数量关系（cardinality）。
- **只纳入领域术语（Only include domain terms）。** 除非这些概念在领域里有特定含义，否则跳过通用编程概念（array、function、endpoint 等）。
- **需要时按自然聚类分多张表。** 例如按子领域、生命周期或参与者聚类。每个聚类有自己的标题与表格；如果所有术语都属于同一个紧密领域，也可以只用一张表，不要强行分组。
- **编写示例对话（Write an example dialogue）。** 给出一个短对话（3-5 轮），在“开发者（dev）”与“领域专家（domain expert）”之间，展示术语之间如何自然互动。对话应澄清相关概念的边界，并展示术语被精确使用。

## 重新运行（Re-running）

在同一对话中再次调用本技能时：

1. 读取现有的 `UBIQUITOUS_LANGUAGE.md`
2. 吸收后续讨论中新增的术语
3. 如果理解发生变化，更新定义
4. 将变更过的条目标注为 “(updated)”，新增条目标注为 “(new)”
5. 对任何新增的歧义重新标记
6. 重写示例对话以纳入新术语

## 输出后的指令（Post-output instruction）

写入文件后，在对话里声明：

> 我已写入/更新 `UBIQUITOUS_LANGUAGE.md`。从此刻起，我会持续一致地使用这些术语。如果我偏离了这套语言，或你发现某个术语还应当被添加，请告诉我。

