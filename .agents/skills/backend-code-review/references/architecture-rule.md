# Rule Catalog — Architecture

## Scope

- 适用于：router（API）/ service / core / providers 分层，依赖方向，职责归属，以及跨模块移动逻辑时的审查。
- 典型结构示例（实际以当前项目为准）：路由层（如 `app/api/`）、服务层（`services/`）、核心层（`core/`）、提供方（`providers/`）、工具（`utils/`）。

## Rules

### 业务逻辑应放在 service，router 保持薄层

- Category: maintainability
- Severity: critical
- Description: 路由应负责解析请求、调用 service、返回序列化响应。若在 router 中写业务判断、多步编排或直接写库，会导致行为难以复用和单测。
- Suggested fix: 将领域/业务逻辑移到服务层（如 `services/`）；router 只做参数校验、调用 service、构造 HTTP 响应。
- Example:
  - Bad:
    ```python
    # app/api/knowledge_bases.py
    @router.delete("/{kb_id}")
    async def delete_knowledge_base(kb_id: str, db: Session = Depends(get_db)):
        kb = db.query(KnowledgeBase).filter(KnowledgeBase.id == kb_id).first()
        if not kb:
            raise HTTPException(404)
        if db.query(KnowledgeBase).count() == 1:
            raise HTTPException(400, "不能删除最后一个知识库")
        doc_count = db.query(Document).filter(Document.knowledge_base_id == kb_id).count()
        # ... 删除文档、分段、向量等一长串逻辑全在路由里
        db.delete(kb)
        db.commit()
        return {"result": "ok"}
    ```
  - Good:
    ```python
    # app/api/knowledge_bases.py
    @router.delete("/{kb_id}")
    async def delete_knowledge_base(kb_id: str, db: Session = Depends(get_db)):
        knowledge_base_service.delete_knowledge_base(db, kb_id)
        return {"result": "ok"}

    # services/knowledge_base_service.py
    def delete_knowledge_base(self, db: Session, kb_id: str) -> None:
        kb = db.query(KnowledgeBase).filter(KnowledgeBase.id == kb_id).first()
        if not kb:
            raise KnowledgeBaseNotFoundError(kb_id)
        if db.query(KnowledgeBase).count() == 1:
            raise LastKnowledgeBaseDeletionError()
        # 删除文档、分段、向量等逻辑集中在此
        ...
        db.delete(kb)
        db.commit()
    ```

### 保持分层依赖方向一致

- Category: best practices
- Severity: critical
- Description: router 依赖 service，service 可依赖 core/domain 与 providers。禁止 core 或 providers 依赖 `app/api` 或 HTTP 相关上下文，否则会产生循环依赖并把传输层细节泄漏到领域。
- Suggested fix: 将共享契约放在核心或领域模型模块（如 `core/`、`app/models/`）；由 service 或 router 把请求上下文以参数形式传入 core/domain。
- Example:
  - Bad:
    ```python
    # core/indexing_runner.py
    from fastapi import Request  # 或从 app 导入 request 上下文

    def run(self, document_id: str):
        kb_id = get_current_kb_id_from_request()  # 依赖 Web 层
    ```
  - Good:
    ```python
    # core/indexing_runner.py
    def run(self, db: Session, document_id: str) -> None:
        doc = db.query(Document).filter(Document.id == document_id).first()
        kb_id = doc.knowledge_base_id  # 从数据或参数获得，不依赖 Web
    ```

### utils 保持与业务解耦

- Category: maintainability
- Severity: critical
- Description: 项目中的 utils/工具层应为可复用的通用工具，不包含产品/领域规则、工作流编排或业务决策。若在 utils 中引用 service、core 业务逻辑或领域专有配置，会破坏复用与测试。
- Suggested fix: 将业务逻辑移到 `services/` 或 `core/`；utils 仅提供纯函数或与业务无关的辅助（如解析、分块、日志格式等）。
- Example:
  - Bad:
    ```python
    # utils/document_parser.py
    from services.document_ingest_service import DocumentIngestService
    def parse_and_enqueue(path: str, kb_id: str):
        # 编排入队逻辑、依赖 service
    ```
  - Good:
    ```python
    # utils/document_parser.py：只做解析
    def parse(file_path: str, file_type: str) -> dict: ...

    # services/document_ingest_service.py：编排解析与入队
    def create_document_and_enqueue(self, db: Session, kb_id: str, path: str, ...): ...
    ```

### 避免在 router 中直接构造复杂查询或多次 commit

- Category: maintainability
- Severity: suggestion
- Description: 若路由内出现多表联合查询、多次 `db.query`、`db.commit` 或复杂过滤，可读性与可测试性会下降，且与“router 薄层”原则冲突。
- Suggested fix: 将复杂数据访问与事务边界收敛到 service 的一个或少数几个方法中，router 只调用 service 并返回结果。
