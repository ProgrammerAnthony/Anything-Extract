"""Database models and session helpers."""
from datetime import datetime
from pathlib import Path
import uuid

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, sessionmaker

from core.config import settings

Base = declarative_base()


class KnowledgeBase(Base):
    __tablename__ = "knowledge_bases"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    documents = relationship("Document", back_populates="knowledge_base")


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
    status = Column(String, default="processing")  # queued, processing, completed, failed
    document_metadata = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    knowledge_base = relationship("KnowledgeBase", back_populates="documents")
    vectors = relationship("DocumentVector", back_populates="document")
    extraction_results = relationship("ExtractionResult", back_populates="document", cascade="all, delete-orphan")
    ingest_job = relationship("DocumentIngestJob", back_populates="document", uselist=False, cascade="all, delete-orphan")


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
        return default_kb

    default_kb = KnowledgeBase(name="默认知识库", is_default=True)
    db.add(default_kb)
    db.commit()
    db.refresh(default_kb)
    return default_kb


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
        from sqlalchemy import inspect, text

        inspector = inspect(engine)

        if inspector.has_table("documents"):
            columns = [col["name"] for col in inspector.get_columns("documents")]
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

        if inspector.has_table("extraction_results"):
            columns = [col["name"] for col in inspector.get_columns("extraction_results")]
            if "reasoning" not in columns:
                db.execute(text("ALTER TABLE extraction_results ADD COLUMN reasoning TEXT"))
                db.commit()
            if "original_content" not in columns:
                db.execute(text("ALTER TABLE extraction_results ADD COLUMN original_content TEXT"))
                db.commit()

        if inspector.has_table("document_ingest_jobs"):
            columns = [col["name"] for col in inspector.get_columns("document_ingest_jobs")]
            if "processing_mode" not in columns:
                db.execute(text("ALTER TABLE document_ingest_jobs ADD COLUMN processing_mode TEXT DEFAULT 'queue'"))
                db.commit()
            if "worker_id" not in columns:
                db.execute(text("ALTER TABLE document_ingest_jobs ADD COLUMN worker_id TEXT"))
                db.commit()
            if "max_attempts" not in columns:
                db.execute(text("ALTER TABLE document_ingest_jobs ADD COLUMN max_attempts INTEGER DEFAULT 3"))
                db.commit()
            if "started_at" not in columns:
                db.execute(text("ALTER TABLE document_ingest_jobs ADD COLUMN started_at DATETIME"))
                db.commit()
            if "finished_at" not in columns:
                db.execute(text("ALTER TABLE document_ingest_jobs ADD COLUMN finished_at DATETIME"))
                db.commit()

        _ensure_default_kb(db)
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
