# Rule Catalog — Data Access（数据访问）

## Scope

- 适用于：对表/模型的查询与写入（如 `db.query(...)`、`session.add`、`filter`、`update`、`delete`）应放在哪一层、如何收敛重复逻辑。
- 不涉及：Session 生命周期与事务细节（见 sqlalchemy-rule.md）、表结构设计（见 db-schema-rule.md）。
- 项目现状以当前代码为准：若**无**独立 repository 层，数据访问通常分布在路由层与服务层（如 `app/api/`、`services/`），直接使用 `db.query(Model)`。本规则用于审查“是否应把数据访问收敛到 service”以及“何时考虑引入 repository”。

## Rules

### 复杂或重复的查询应收敛到 service

- Category: maintainability
- Severity: suggestion
- Description: 若同一查询逻辑（多表过滤、聚合、排序）在多个路由或多次出现，应提取到 service 的单一方法中，由 router 调用。避免在 API 层堆叠冗长 `db.query(...).filter(...).join(...)`。
- Suggested fix:
  - 在对应 service 中新增方法，如 `get_document_with_segment_summary(db, kb_id, doc_id)`，将查询与组装逻辑放入其中。
  - Router 只调用该方法并处理 404/400 与响应格式。
- Example:
  - Bad:
    ```python
    # 在多个路由中重复相同逻辑
    doc = db.query(Document).filter(Document.id == doc_id, Document.knowledge_base_id == kb_id).first()
    job = db.query(DocumentIngestJob).filter(DocumentIngestJob.document_id == doc.id).first()
    segment_count = db.query(func.count(DocumentSegment.id)).filter(DocumentSegment.document_id == doc.id).scalar()
    # ... 再在另一个路由里复制一遍
    ```
  - Good:
    ```python
    # services/document_query_service.py（或现有 document_service 扩展）
    def get_document_detail(self, db: Session, kb_id: str, doc_id: str) -> dict | None:
        doc = db.query(Document).filter(Document.id == doc_id, Document.knowledge_base_id == kb_id).first()
        if not doc:
            return None
        job = db.query(DocumentIngestJob).filter(DocumentIngestJob.document_id == doc.id).first()
        segment_count = db.query(func.count(DocumentSegment.id)).filter(DocumentSegment.document_id == doc.id).scalar()
        return {"document": doc, "ingest_job": job, "segment_count": segment_count or 0}
    ```

### 写操作与事务边界应由 service 统一负责

- Category: maintainability
- Severity: suggestion
- Description: 涉及多表更新或“先查再改再 commit”的流程，应放在 service 内完成，router 只传参并接收结果。避免在 router 中混用多次 `db.query`、`db.add`、`db.delete` 与 `db.commit`。
- Suggested fix: 将“加载实体 → 校验 → 修改/删除 → commit”整段逻辑移入 service 方法；router 调用后根据返回值或异常返回 HTTP 状态与 body。

### 当某实体的访问逻辑明显膨胀时可考虑 repository

- Category: maintainability
- Severity: optional (nit)
- Description: 多数项目未强制 repository 层。若某实体的查询/更新方式非常多且在不同 service 中重复，可考虑引入 repository 抽象，便于复用与单测。非必须，按复杂度与团队约定决定。
- Suggested fix: 先通过“收敛到 service”缓解重复；若同一实体的数据访问方法超过一定数量且跨多个 service，再评估是否抽成独立 repository 模块（如 `repositories/` 下），由 service 依赖 repository 而非直接 `db.query(Model)`。

### 跨模块数据访问应通过公开接口而非直接依赖对方表

- Category: best practices
- Severity: suggestion
- Description: 若 A 模块需要 B 模块管理的实体数据，优先通过 B 的 service（或将来 repository）提供的接口获取，而不是在 A 中直接 `db.query(B 的模型)`。便于后续替换实现与保持边界清晰。
- Suggested fix: 例如 worker 需要“按文档查知识库配置”时，可调用 `knowledge_base_service.get_knowledge_base(db, kb_id)` 或 `document_service.get_document_with_kb(db, doc_id)`，而不是在 worker 里直接 query KnowledgeBase + Document。
