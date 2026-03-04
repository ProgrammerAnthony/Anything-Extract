"""数据库模型与会话管理。"""
from __future__ import annotations

from datetime import datetime
import json
from pathlib import Path
import uuid

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    create_engine,
    inspect,
    text,
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, sessionmaker

from core.config import settings

Base = declarative_base()

DEFAULT_RETRIEVAL_MODEL = json.dumps(
    {
        "search_method": "semantic_search",
        "reranking_enable": False,
        "reranking_model": {
            "reranking_provider_name": "",
            "reranking_model_name": "",
        },
        "reranking_mode": "reranking_model",
        "top_k": 3,
        "score_threshold_enabled": False,
        "score_threshold": 0.5,
    },
    ensure_ascii=False,
)


class KnowledgeBase(Base):
    __tablename__ = "knowledge_bases"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    is_default = Column(Boolean, default=False)

    # 知识库检索与索引相关字段
    # indexing_technique 决定当前检索优先走哪条路径：
    # high_quality=向量/全文/混合，economy=关键词倒排。
    indexing_technique = Column(String, default="high_quality")  # high_quality | economy
    doc_form = Column(String, default="text_model")  # text_model | qa_model | hierarchical_model
    embedding_model = Column(String)
    embedding_model_provider = Column(String)
    keyword_number = Column(Integer, default=10)
    # retrieval_model 保存检索参数（search_method/top_k/threshold 等）。
    retrieval_model = Column(Text, default=DEFAULT_RETRIEVAL_MODEL)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    documents = relationship("Document", back_populates="knowledge_base")
    process_rules = relationship("KnowledgeBaseProcessRule", back_populates="knowledge_base", cascade="all, delete-orphan")
    keyword_table = relationship(
        "KnowledgeBaseKeywordTable",
        back_populates="knowledge_base",
        uselist=False,
        cascade="all, delete-orphan",
    )
    # 召回测试查询记录（用于后续展示“测试历史”）。
    queries = relationship("KnowledgeBaseQuery", back_populates="knowledge_base", cascade="all, delete-orphan")

    @property
    def retrieval_model_dict(self) -> dict:
        if not self.retrieval_model:
            return {}
        try:
            return json.loads(self.retrieval_model)
        except json.JSONDecodeError:
            return {}


class KnowledgeBaseProcessRule(Base):
    __tablename__ = "knowledge_base_process_rules"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    knowledge_base_id = Column(String, ForeignKey("knowledge_bases.id"), nullable=False)
    mode = Column(String, default="automatic")  # automatic | custom | hierarchical
    rules = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    knowledge_base = relationship("KnowledgeBase", back_populates="process_rules")

    # 自动分段默认规则
    AUTOMATIC_RULES = {
        "pre_processing_rules": [
            {"id": "remove_extra_spaces", "enabled": True},
            {"id": "remove_urls_emails", "enabled": False},
        ],
        "segmentation": {
            "separator": "\n",
            "max_tokens": 500,
            "chunk_overlap": 50,
        },
    }

    @property
    def rules_dict(self) -> dict:
        if not self.rules:
            return {}
        try:
            return json.loads(self.rules)
        except json.JSONDecodeError:
            return {}


class KnowledgeBaseKeywordTable(Base):
    __tablename__ = "knowledge_base_keyword_tables"

    knowledge_base_id = Column(String, ForeignKey("knowledge_bases.id"), primary_key=True)
    keyword_table = Column(Text, default="{}")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    knowledge_base = relationship("KnowledgeBase", back_populates="keyword_table")

    @property
    def keyword_table_dict(self) -> dict[str, list[str]]:
        if not self.keyword_table:
            return {}
        try:
            data = json.loads(self.keyword_table)
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            pass
        return {}


class KnowledgeBaseQuery(Base):
    __tablename__ = "knowledge_base_queries"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    knowledge_base_id = Column(String, ForeignKey("knowledge_bases.id"), nullable=False)
    content = Column(Text)  # JSON: [{"content_type":"text_query","content":"..."}]
    source = Column(String, default="hit_testing")
    created_by = Column(String, default="system")
    created_at = Column(DateTime, default=datetime.utcnow)

    knowledge_base = relationship("KnowledgeBase", back_populates="queries")

    @property
    def content_list(self) -> list[dict]:
        if not self.content:
            return []
        try:
            data = json.loads(self.content)
            if isinstance(data, list):
                return data
        except json.JSONDecodeError:
            pass
        return []


class TagConfig(Base):
    __tablename__ = "tag_configs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)
    description = Column(Text)
    options = Column(Text)
    required = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Document(Base):
    __tablename__ = "documents"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    knowledge_base_id = Column(String, ForeignKey("knowledge_bases.id"), nullable=False)

    filename = Column(String, nullable=False)
    file_type = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    json_path = Column(String, nullable=False)

    # 兼容旧流程任务状态（queued/processing/completed/failed）
    status = Column(String, default="processing")
    document_metadata = Column(Text)

    # 文档处理链路字段（用于追踪索引进度与可用性控制）
    doc_form = Column(String, default="text_model")
    doc_language = Column(String, default="English")
    data_source_type = Column(String, default="upload_file")
    data_source_info = Column(Text)
    process_rule_id = Column(String, ForeignKey("knowledge_base_process_rules.id"))
    batch = Column(String)
    position = Column(Integer, default=1)
    created_from = Column(String, default="upload_file")

    processing_started_at = Column(DateTime)
    word_count = Column(Integer)
    parsing_completed_at = Column(DateTime)
    cleaning_completed_at = Column(DateTime)
    splitting_completed_at = Column(DateTime)
    tokens = Column(Integer)
    indexing_latency = Column(Float)
    completed_at = Column(DateTime)

    is_paused = Column(Boolean, default=False)
    error = Column(Text)
    stopped_at = Column(DateTime)

    indexing_status = Column(String, default="waiting")
    enabled = Column(Boolean, default=True)
    disabled_at = Column(DateTime)
    disabled_by = Column(String)
    archived = Column(Boolean, default=False)
    archived_reason = Column(String)
    archived_by = Column(String)
    archived_at = Column(DateTime)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    knowledge_base = relationship("KnowledgeBase", back_populates="documents")
    process_rule = relationship("KnowledgeBaseProcessRule")
    vectors = relationship("DocumentVector", back_populates="document")
    segments = relationship("DocumentSegment", back_populates="document", cascade="all, delete-orphan")
    extraction_results = relationship("ExtractionResult", back_populates="document", cascade="all, delete-orphan")
    ingest_job = relationship("DocumentIngestJob", back_populates="document", uselist=False, cascade="all, delete-orphan")

    @property
    def data_source_info_dict(self) -> dict:
        if not self.data_source_info:
            return {}
        try:
            return json.loads(self.data_source_info)
        except json.JSONDecodeError:
            return {}

    @property
    def display_status(self) -> str | None:
        if self.indexing_status == "waiting":
            return "queuing"
        if self.indexing_status not in {"completed", "error", "waiting"} and self.is_paused:
            return "paused"
        if self.indexing_status in {"parsing", "cleaning", "splitting", "indexing"}:
            return "indexing"
        if self.indexing_status == "error":
            return "error"
        if self.indexing_status == "completed" and not self.archived and self.enabled:
            return "available"
        if self.indexing_status == "completed" and not self.archived and not self.enabled:
            return "disabled"
        if self.indexing_status == "completed" and self.archived:
            return "archived"
        return None


class DocumentSegment(Base):
    __tablename__ = "document_segments"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id = Column(String, ForeignKey("documents.id"), nullable=False)
    knowledge_base_id = Column(String, nullable=False)
    position = Column(Integer, nullable=False)

    content = Column(Text, nullable=False)
    answer = Column(Text)
    word_count = Column(Integer, default=0)
    tokens = Column(Integer, default=0)

    keywords = Column(Text)  # JSON 数组
    index_node_id = Column(String)
    index_node_hash = Column(String)

    hit_count = Column(Integer, default=0)
    enabled = Column(Boolean, default=True)
    disabled_at = Column(DateTime)
    disabled_by = Column(String)
    status = Column(String, default="waiting")  # waiting/completed/re_segment/indexing/error

    indexing_at = Column(DateTime)
    completed_at = Column(DateTime)
    error = Column(Text)
    stopped_at = Column(DateTime)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    document = relationship("Document", back_populates="segments")

    @property
    def keywords_list(self) -> list[str]:
        if not self.keywords:
            return []
        try:
            parsed = json.loads(self.keywords)
            if isinstance(parsed, list):
                return [str(item) for item in parsed]
        except json.JSONDecodeError:
            pass
        return []


class DocumentIngestJob(Base):
    __tablename__ = "document_ingest_jobs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id = Column(String, ForeignKey("documents.id"), nullable=False, unique=True)
    status = Column(String, default="queued")
    attempts = Column(Integer, default=0)
    max_attempts = Column(Integer, default=3)
    error_msg = Column(Text)
    worker_id = Column(String)
    processing_mode = Column(String, default="queue")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    started_at = Column(DateTime)
    finished_at = Column(DateTime)

    document = relationship("Document", back_populates="ingest_job")


class DocumentVector(Base):
    __tablename__ = "document_vectors"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id = Column(String, ForeignKey("documents.id"), nullable=False)
    chunk_index = Column(Integer, nullable=False)
    vector_id = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

    document = relationship("Document", back_populates="vectors")


class ExtractionResult(Base):
    __tablename__ = "extraction_results"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tag_config_id = Column(String, ForeignKey("tag_configs.id"), nullable=False)
    document_id = Column(String, ForeignKey("documents.id"), nullable=False)
    result = Column(Text, nullable=False)
    retrieval_results = Column(Text)
    prompt = Column(Text)
    llm_request = Column(Text)
    llm_response = Column(Text)
    parsed_result = Column(Text)
    extraction_time = Column(String)
    reasoning = Column(Text)
    original_content = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    tag_config = relationship("TagConfig")
    document = relationship("Document", back_populates="extraction_results")


engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if "sqlite" in settings.database_url else {},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def _ensure_default_kb(db):
    default_kb = db.query(KnowledgeBase).filter(KnowledgeBase.is_default.is_(True)).first()
    if default_kb:
        # 修复默认值缺失
        if not default_kb.indexing_technique:
            default_kb.indexing_technique = "high_quality"
        if not default_kb.doc_form:
            default_kb.doc_form = "text_model"
        if not default_kb.embedding_model:
            default_kb.embedding_model = settings.ollama_embedding_model
        if not default_kb.embedding_model_provider:
            default_kb.embedding_model_provider = "ollama"
        if not default_kb.retrieval_model:
            default_kb.retrieval_model = DEFAULT_RETRIEVAL_MODEL
        db.commit()
        return default_kb

    default_kb = KnowledgeBase(
        name="默认知识库",
        is_default=True,
        indexing_technique="high_quality",
        doc_form="text_model",
        embedding_model=settings.ollama_embedding_model,
        embedding_model_provider="ollama",
        keyword_number=10,
        retrieval_model=DEFAULT_RETRIEVAL_MODEL,
    )
    db.add(default_kb)
    db.commit()
    db.refresh(default_kb)
    return default_kb


def _ensure_column(db, inspector, table_name: str, column_name: str, column_sql: str) -> None:
    columns = {col["name"] for col in inspector.get_columns(table_name)}
    if column_name in columns:
        return
    db.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_sql}"))
    db.commit()


def _ensure_default_process_rule(db, knowledge_base_id: str) -> KnowledgeBaseProcessRule:
    rule = (
        db.query(KnowledgeBaseProcessRule)
        .filter(KnowledgeBaseProcessRule.knowledge_base_id == knowledge_base_id)
        .order_by(KnowledgeBaseProcessRule.created_at.asc())
        .first()
    )
    if rule:
        return rule

    rule = KnowledgeBaseProcessRule(
        knowledge_base_id=knowledge_base_id,
        mode="automatic",
        rules=json.dumps(KnowledgeBaseProcessRule.AUTOMATIC_RULES, ensure_ascii=False),
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


def init_db():
    if "sqlite" in settings.database_url:
        db_path = settings.database_url.replace("sqlite:///", "")
        db_dir = Path(db_path).parent
        if db_dir:
            db_dir.mkdir(parents=True, exist_ok=True)

    Path(settings.storage_path).mkdir(parents=True, exist_ok=True)
    Path(settings.documents_path).mkdir(parents=True, exist_ok=True)
    Path(settings.uploads_path).mkdir(parents=True, exist_ok=True)
    Path(settings.vector_cache_path).mkdir(parents=True, exist_ok=True)
    Path(settings.lance_db_path).mkdir(parents=True, exist_ok=True)

    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        inspector = inspect(engine)

        if inspector.has_table("knowledge_bases"):
            _ensure_column(db, inspector, "knowledge_bases", "indexing_technique", "TEXT DEFAULT 'high_quality'")
            _ensure_column(db, inspector, "knowledge_bases", "doc_form", "TEXT DEFAULT 'text_model'")
            _ensure_column(db, inspector, "knowledge_bases", "embedding_model", "TEXT")
            _ensure_column(db, inspector, "knowledge_bases", "embedding_model_provider", "TEXT")
            _ensure_column(db, inspector, "knowledge_bases", "keyword_number", "INTEGER DEFAULT 10")
            _ensure_column(db, inspector, "knowledge_bases", "retrieval_model", "TEXT")

        if inspector.has_table("documents"):
            columns = {col["name"] for col in inspector.get_columns("documents")}
            if "knowledge_base_id" not in columns:
                default_kb = _ensure_default_kb(db)
                db.execute(text("ALTER TABLE documents ADD COLUMN knowledge_base_id TEXT"))
                db.execute(
                    text(
                        f"UPDATE documents SET knowledge_base_id = '{default_kb.id}' "
                        "WHERE knowledge_base_id IS NULL"
                    )
                )
                db.commit()

            # 统一扩展字段
            _ensure_column(db, inspector, "documents", "doc_form", "TEXT DEFAULT 'text_model'")
            _ensure_column(db, inspector, "documents", "doc_language", "TEXT DEFAULT 'English'")
            _ensure_column(db, inspector, "documents", "data_source_type", "TEXT DEFAULT 'upload_file'")
            _ensure_column(db, inspector, "documents", "data_source_info", "TEXT")
            _ensure_column(db, inspector, "documents", "process_rule_id", "TEXT")
            _ensure_column(db, inspector, "documents", "batch", "TEXT")
            _ensure_column(db, inspector, "documents", "position", "INTEGER DEFAULT 1")
            _ensure_column(db, inspector, "documents", "created_from", "TEXT DEFAULT 'upload_file'")
            _ensure_column(db, inspector, "documents", "is_paused", "BOOLEAN DEFAULT 0")
            _ensure_column(db, inspector, "documents", "processing_started_at", "DATETIME")
            _ensure_column(db, inspector, "documents", "word_count", "INTEGER")
            _ensure_column(db, inspector, "documents", "parsing_completed_at", "DATETIME")
            _ensure_column(db, inspector, "documents", "cleaning_completed_at", "DATETIME")
            _ensure_column(db, inspector, "documents", "splitting_completed_at", "DATETIME")
            _ensure_column(db, inspector, "documents", "tokens", "INTEGER")
            _ensure_column(db, inspector, "documents", "indexing_latency", "FLOAT")
            _ensure_column(db, inspector, "documents", "completed_at", "DATETIME")
            _ensure_column(db, inspector, "documents", "error", "TEXT")
            _ensure_column(db, inspector, "documents", "stopped_at", "DATETIME")
            _ensure_column(db, inspector, "documents", "indexing_status", "TEXT DEFAULT 'waiting'")
            _ensure_column(db, inspector, "documents", "enabled", "BOOLEAN DEFAULT 1")
            _ensure_column(db, inspector, "documents", "disabled_at", "DATETIME")
            _ensure_column(db, inspector, "documents", "disabled_by", "TEXT")
            _ensure_column(db, inspector, "documents", "archived", "BOOLEAN DEFAULT 0")
            _ensure_column(db, inspector, "documents", "archived_reason", "TEXT")
            _ensure_column(db, inspector, "documents", "archived_by", "TEXT")
            _ensure_column(db, inspector, "documents", "archived_at", "DATETIME")

        if inspector.has_table("extraction_results"):
            _ensure_column(db, inspector, "extraction_results", "reasoning", "TEXT")
            _ensure_column(db, inspector, "extraction_results", "original_content", "TEXT")

        if inspector.has_table("document_ingest_jobs"):
            _ensure_column(db, inspector, "document_ingest_jobs", "processing_mode", "TEXT DEFAULT 'queue'")
            _ensure_column(db, inspector, "document_ingest_jobs", "worker_id", "TEXT")
            _ensure_column(db, inspector, "document_ingest_jobs", "max_attempts", "INTEGER DEFAULT 3")
            _ensure_column(db, inspector, "document_ingest_jobs", "started_at", "DATETIME")
            _ensure_column(db, inspector, "document_ingest_jobs", "finished_at", "DATETIME")

        default_kb = _ensure_default_kb(db)
        default_rule = _ensure_default_process_rule(db, default_kb.id)

        # 为历史文档补全 process_rule/data_source 信息
        db.query(Document).filter(Document.process_rule_id.is_(None)).update(
            {Document.process_rule_id: default_rule.id}, synchronize_session=False
        )
        db.query(Document).filter(Document.data_source_type.is_(None)).update(
            {Document.data_source_type: "upload_file"}, synchronize_session=False
        )
        db.query(Document).filter(Document.created_from.is_(None)).update(
            {Document.created_from: "upload_file"}, synchronize_session=False
        )
        db.commit()

        # 为所有知识库补齐默认 process rule
        kb_ids = [item.id for item in db.query(KnowledgeBase.id).all()]
        for kb_id in kb_ids:
            _ensure_default_process_rule(db, kb_id)
    except Exception as exc:  # noqa: BLE001
        print(f"数据库迁移错误: {exc}")
        import traceback

        traceback.print_exc()
        db.rollback()
    finally:
        db.close()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

