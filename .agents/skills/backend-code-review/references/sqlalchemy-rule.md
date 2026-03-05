# Rule Catalog — SQLAlchemy 使用

## Scope

- 适用于：Session 与事务生命周期、查询构造、knowledge_base 作用域、原始 SQL 使用边界、写路径的并发与一致性。
- 不涉及：表结构设计与迁移细节（见 db-schema-rule.md）。
- 项目约定（以当前项目为准）：Session 通过 `get_db()` 注入到 FastAPI 路由，或由调用方传入 service；模型与引擎通常定义在核心模块（如 `core/database.py`）。数据库类型依项目而定（如 SQLite、PostgreSQL 等）。

## Rules

### 写路径必须显式 commit，且事务窗口尽量短

- Category: best practices
- Severity: critical
- Description: 在修改模型后若未调用 `session.commit()`，变更可能不会落库；长时间不 commit 会拉长锁持有时间，增加阻塞与死锁风险。
- Suggested fix:
  - 在完成一组相关写操作后**显式调用 `session.commit()`**。
  - 将事务范围控制在必要的最小单元内，避免在同一个事务内做网络 I/O、重计算等。
  - 若在路由或 service 中自行创建 Session（如 `SessionLocal()`），务必在 try/finally 中保证 `commit`/`rollback` 与 `close`。
- Example:
  - Bad:
    ```python
    with SessionLocal() as session:
        doc = session.query(Document).filter(Document.id == doc_id).first()
        doc.indexing_status = "completed"
        # 未 commit 即退出，修改可能丢失
    ```
  - Good:
    ```python
    with SessionLocal() as session:
        doc = session.query(Document).filter(Document.id == doc_id).first()
        doc.indexing_status = "completed"
        session.commit()
    # 或在路由中：由 get_db 注入的 db 在路由内 commit，或交给 service 在单一职责块内 commit
    ```

### 涉及知识库资源的查询必须带 knowledge_base_id 条件

- Category: security / correctness
- Severity: critical
- Description: 文档、分段、知识库级配置等均归属某个知识库。**凡 API 路径为「按知识库隔离」时**（如 `/api/knowledge-bases/{kb_id}/documents/...`），按 document_id 或 segment_id 查询必须带 `knowledge_base_id`，否则可能越权访问或误操作其他知识库数据。
- 例外说明：若接口设计为「全局 document」（如 `GET/DELETE /api/documents/{id}`、提取接口仅按 document_id），当前单用户场景下可不强制在查询条件中带 kb_id；若未来做多知识库/权限隔离，应在 service 层增加文档归属或权限校验。
- Suggested fix: 凡「知识库下」的查询，在条件中加上对应的 `knowledge_base_id`（或通过已校验的 document 关联得到），并在 API 层从路径参数传入并校验。
- Example:
  - Bad:
    ```python
    doc = db.query(Document).filter(Document.id == doc_id).first()
    segments = db.query(DocumentSegment).filter(DocumentSegment.document_id == doc_id).all()
    ```
  - Good:
    ```python
    doc = db.query(Document).filter(
        Document.id == doc_id,
        Document.knowledge_base_id == kb_id,
    ).first()
    if not doc:
        raise HTTPException(404)
    segments = db.query(DocumentSegment).filter(
        DocumentSegment.document_id == doc_id,
        DocumentSegment.knowledge_base_id == kb_id,
    ).all()
    ```

### 优先使用 SQLAlchemy 表达式而非原始 SQL

- Category: maintainability
- Severity: suggestion
- Description: 默认应使用 ORM 或 Core 的 `select/update/delete` 表达式。原始 SQL 仅在确有需求（如 SQLite 不支持的函数、性能调优）时使用，并需注意注入与可移植性。
- Suggested fix: 将可表达的查询改为 `db.query(Model).filter(...)` 或 `select(Model).where(...)`；若必须用原始 SQL，使用参数化（如 `text("...").bindparams(...)`），避免字符串拼接。

### 自建 Session 时保证关闭与异常时回滚

- Category: best practices
- Severity: critical
- Description: 在 worker、后台任务或 service 内使用 `SessionLocal()` 创建 session 时，必须在 finally 中 `close()`，并在异常时 `rollback()`，避免连接泄漏与脏数据。
- Suggested fix: 使用 `try/except/finally` 或上下文管理器，确保 `rollback` + `close`；若在 with 块内显式 `commit()`，异常时不要再次 commit。
- Example:
  - Bad:
    ```python
    db = SessionLocal()
    doc = db.query(Document).get(doc_id)
    doc.status = "completed"
    db.commit()
    # 若上面任一步抛错，session 未关闭且可能未 rollback
    ```
  - Good:
    ```python
    db = SessionLocal()
    try:
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if doc:
            doc.status = "completed"
            db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    ```
