# Rule Catalog — DB Schema 设计

## Scope

- 适用于：项目中的模型定义文件（如 `core/database.py`）、`@property` 使用、索引与约束、以及迁移/init 逻辑（如 `init_db`）。
- 不涉及：Session 生命周期、事务边界与查询写法（见 sqlalchemy-rule.md）。
- 项目约定以当前项目为准（如数据库类型、是否多租户、隔离维度等）。

## Rules

### 模型 @property 内禁止查询其他表或新建 Session

- Category: maintainability / performance
- Severity: critical
- Description: 在模型上使用 `@property` 时若访问数据库或查询其他表，会隐藏依赖、把模型与数据访问耦合，并在列表/批量访问时易引发 N+1 查询。
- Suggested fix:
  - 保持 `@property` 仅基于当前行已加载的字段做计算或解析（如 JSON 反序列化）。
  - 需要跨表或批量数据时，在 service 或上层先查询/预加载，再计算派生结果。
- Example:
  - Bad:
    ```python
    class Document(Base):
        @property
        def segment_count(self) -> int:
            with SessionLocal() as db:
                return db.query(DocumentSegment).filter(DocumentSegment.document_id == self.id).count()
    ```
  - Good:
    ```python
    class Document(Base):
        @property
        def data_source_info_dict(self) -> dict:
            if not self.data_source_info:
                return {}
            try:
                return json.loads(self.data_source_info)
            except json.JSONDecodeError:
                return {}
    # 数量等聚合在 service 中查询：db.query(func.count(DocumentSegment.id)).filter(...)
    ```

### 与知识库绑定的实体应包含 knowledge_base_id

- Category: maintainability
- Severity: suggestion
- Description: 若业务存在「归属某资源」的实体（如文档归属知识库、记录归属租户），模型中应有对应外键/维度字段（如 `knowledge_base_id`、`tenant_id`），便于隔离查询与后续扩展。新增类似实体时应与现有模型保持一致。
- Suggested fix: 新增与知识库绑定的表时，增加 `knowledge_base_id` 列并参与索引/约束；查询时通过该字段限定作用域。

### 注意重复与冗余索引

- Category: performance
- Severity: suggestion
- Description: 左前缀重复的复合索引会增加写入开销且可能干扰优化器。例如已有 `(knowledge_base_id, document_id, created_at)` 时，再单独建 `(knowledge_base_id, document_id)` 通常冗余。
- Suggested fix: 新增索引前检查现有复合索引是否已覆盖查询；仅在有明确查询模式依据时再增加新索引。

### 迁移逻辑集中在 init_db，且使用参数化与安全 DDL

- Category: maintainability / security
- Severity: critical
- Description: 若项目无独立 migration 目录，表结构变更可能通过 `init_db`、`_ensure_column` 等完成。使用原始 SQL 时须避免字符串拼接表名/列名导致注入；新增列默认值需与当前数据库语法兼容。
- Suggested fix: 列名/表名若来自变量，需白名单校验；默认值使用 `text("...")` 时注意 SQLite 语法；异常时务必 `db.rollback()` 并在 finally 中 `db.close()`。
