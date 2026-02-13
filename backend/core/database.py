"""数据库连接和模型定义"""
from sqlalchemy import create_engine, Column, String, Boolean, Integer, DateTime, Text, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
import uuid
from pathlib import Path

from core.config import settings

Base = declarative_base()


class KnowledgeBase(Base):
    """知识库表"""
    __tablename__ = "knowledge_bases"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # 关系
    documents = relationship("Document", back_populates="knowledge_base")


class TagConfig(Base):
    """标签配置表"""
    __tablename__ = "tag_configs"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)  # single_choice, multiple_choice, text_input
    description = Column(Text)
    options = Column(Text)  # JSON string
    required = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Document(Base):
    """文档表"""
    __tablename__ = "documents"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    knowledge_base_id = Column(String, ForeignKey("knowledge_bases.id"), nullable=False)
    filename = Column(String, nullable=False)
    file_type = Column(String, nullable=False)  # pdf, docx, txt, md, csv, json, xlsx, pptx, eml
    file_path = Column(String, nullable=False)
    json_path = Column(String, nullable=False)
    status = Column(String, default="processing")  # processing, completed, failed
    document_metadata = Column(Text)  # JSON string (renamed from 'metadata' to avoid SQLAlchemy reserved name conflict)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # 关系
    knowledge_base = relationship("KnowledgeBase", back_populates="documents")
    vectors = relationship("DocumentVector", back_populates="document")
    extraction_results = relationship("ExtractionResult", back_populates="document", cascade="all, delete-orphan")


class DocumentVector(Base):
    """文档向量表"""
    __tablename__ = "document_vectors"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id = Column(String, ForeignKey("documents.id"), nullable=False)
    chunk_index = Column(Integer, nullable=False)
    vector_id = Column(String)  # reference in LanceDB
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # 关系
    document = relationship("Document", back_populates="vectors")


class ExtractionResult(Base):
    """提取结果表 - 存储每个标签的完整提取信息"""
    __tablename__ = "extraction_results"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tag_config_id = Column(String, ForeignKey("tag_configs.id"), nullable=False)
    document_id = Column(String, ForeignKey("documents.id"), nullable=False)
    result = Column(Text, nullable=False)  # JSON string - 提取结果值
    retrieval_results = Column(Text)  # JSON string - 该标签的检索结果
    prompt = Column(Text)  # 完整提示词
    llm_request = Column(Text)  # LLM请求内容
    llm_response = Column(Text)  # LLM原始响应
    parsed_result = Column(Text)  # 解析后的结果
    extraction_time = Column(String)  # 提取耗时(JSON字符串,包含各阶段耗时)
    reasoning = Column(Text)  # 推理过程
    original_content = Column(Text)  # 推理原文（用于提取的文档片段）
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # 关系
    tag_config = relationship("TagConfig")
    document = relationship("Document", back_populates="extraction_results")


# 创建数据库引擎和会话
engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if "sqlite" in settings.database_url else {}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db():
    """初始化数据库"""
    # 确保数据库目录存在
    if "sqlite" in settings.database_url:
        # 从 sqlite:///./storage/database.db 提取路径
        db_path = settings.database_url.replace("sqlite:///", "")
        db_dir = Path(db_path).parent
        if db_dir:
            db_dir.mkdir(parents=True, exist_ok=True)
    
    # 确保其他存储目录存在
    Path(settings.storage_path).mkdir(parents=True, exist_ok=True)
    Path(settings.documents_path).mkdir(parents=True, exist_ok=True)
    Path(settings.uploads_path).mkdir(parents=True, exist_ok=True)
    Path(settings.vector_cache_path).mkdir(parents=True, exist_ok=True)
    Path(settings.lance_db_path).mkdir(parents=True, exist_ok=True)
    
    Base.metadata.create_all(bind=engine)
    
    # 数据库迁移：检查并添加缺失的字段
    db = SessionLocal()
    try:
        # 检查 documents 表是否有 knowledge_base_id 字段
        from sqlalchemy import inspect, text
        inspector = inspect(engine)
        if inspector.has_table("documents"):
            columns = [col["name"] for col in inspector.get_columns("documents")]
            if "knowledge_base_id" not in columns:
                # 确保默认知识库存在
                default_kb = db.query(KnowledgeBase).filter(KnowledgeBase.is_default == True).first()
                if not default_kb:
                    default_kb = KnowledgeBase(
                        name="默认知识库",
                        is_default=True
                    )
                    db.add(default_kb)
                    db.commit()
                    db.refresh(default_kb)
                
                # 添加 knowledge_base_id 字段（SQLite 中先添加可空列）
                db.execute(text("ALTER TABLE documents ADD COLUMN knowledge_base_id TEXT"))
                # 为现有文档设置默认知识库ID
                db.execute(text(f"UPDATE documents SET knowledge_base_id = '{default_kb.id}' WHERE knowledge_base_id IS NULL"))
                db.commit()
                print("数据库迁移完成：已添加 knowledge_base_id 字段")
        
        # 检查 extraction_results 表是否有 reasoning 和 original_content 字段
        if inspector.has_table("extraction_results"):
            columns = [col["name"] for col in inspector.get_columns("extraction_results")]
            if "reasoning" not in columns:
                db.execute(text("ALTER TABLE extraction_results ADD COLUMN reasoning TEXT"))
                db.commit()
                print("数据库迁移完成：已添加 reasoning 字段到 extraction_results 表")
            if "original_content" not in columns:
                db.execute(text("ALTER TABLE extraction_results ADD COLUMN original_content TEXT"))
                db.commit()
                print("数据库迁移完成：已添加 original_content 字段到 extraction_results 表")
        
        # 创建默认知识库（如果不存在）
        default_kb = db.query(KnowledgeBase).filter(KnowledgeBase.is_default == True).first()
        if not default_kb:
            default_kb = KnowledgeBase(
                name="默认知识库",
                is_default=True
            )
            db.add(default_kb)
            db.commit()
    except Exception as e:
        print(f"数据库迁移错误: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()


def get_db():
    """获取数据库会话"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

