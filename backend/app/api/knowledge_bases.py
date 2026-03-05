"""
知识库 API：知识库 CRUD、文档与分段管理、预览/召回测试、索引状态与重新入队。

路由前缀：/api/knowledge-bases
- 知识库：创建、查询、更新、删除、初始化（含批量文档）
- 文档：列表、创建、详情、重命名、设置、预览块、重新入队、索引状态、分段 CRUD
- 召回测试：POST hit-testing，使用检索服务返回命中的分段与分数
"""
from __future__ import annotations

from datetime import datetime
import hashlib
import json
from pathlib import Path
from typing import Any, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.knowledge_entities import ProcessRule, RetrievalConfig
from app.models.schemas import ApiResponse
from core.config import settings
from core.database import (
    Document,
    DocumentIngestJob,
    DocumentSegment,
    KnowledgeBase,
    KnowledgeBaseProcessRule,
    KnowledgeBaseQuery,
    get_db,
)
from core.rag.datasource.keyword.jieba import JiebaKeywordService
from core.rag.models.document import DocumentNode
from providers.embedding.ollama import OllamaEmbeddingProvider
from providers.vector_db.lancedb import LanceDBProvider
from core.indexing_runner import IndexingRunner
from services.hit_testing_service import HitTestingService
from services.ingest_queue_service import IngestQueueService
from services.knowledge_base_service import (
    KnowledgeBaseService,
    KnowledgeBaseNotFoundError,
    CannotDeleteLastKnowledgeBaseError,
    KnowledgeBaseHasDocumentsError,
    DocumentNotFoundError,
)

router = APIRouter()
indexing_runner = IndexingRunner()  # 文档索引主流程：抽取 -> 清洗分段 -> 落库分段 -> 写向量/关键词
ingest_queue_service = IngestQueueService()  # 文档入队与任务状态
hit_testing_service = HitTestingService()  # 召回测试：按检索配置查询并返回命中分段
kb_service = KnowledgeBaseService(ingest_queue_service=ingest_queue_service)


# ---------- 请求/响应模型 ----------

class KnowledgeBaseCreate(BaseModel):
    """创建知识库：名称、索引方式（高质量/经济）、分段模式、检索与 embedding 配置。"""
    name: str
    indexing_technique: str = "high_quality"
    doc_form: str = "text_model"
    retrieval_model: dict[str, Any] | None = None
    embedding_model: str | None = None
    embedding_model_provider: str | None = None
    keyword_number: int = 10


class KnowledgeBaseUpdate(BaseModel):
    name: Optional[str] = None
    indexing_technique: Optional[str] = None
    doc_form: Optional[str] = None
    retrieval_model: Optional[dict[str, Any]] = None
    embedding_model: Optional[str] = None
    embedding_model_provider: Optional[str] = None
    keyword_number: Optional[int] = None


class KnowledgeBaseInitRequest(BaseModel):
    """一次性创建知识库并可选批量添加文档（本地路径），共用 process_rule。"""
    knowledge_base: KnowledgeBaseCreate
    file_paths: list[str] = Field(default_factory=list)
    process_rule: ProcessRule | None = None


class DocumentCreateRequest(BaseModel):
    """按本地 file_path 创建文档并入队；batch 用于同批多文档。"""
    name: str | None = None
    file_path: str
    file_type: str
    process_rule: ProcessRule | None = None
    retrieval_model: RetrievalConfig | None = None
    doc_form: str | None = None
    doc_language: str = "English"
    batch: str | None = None


class SegmentUpdateRequest(BaseModel):
    content: str | None = None
    answer: str | None = None
    keywords: list[str] | None = None
    enabled: bool | None = None


class SegmentCreateRequest(BaseModel):
    content: str = Field(..., min_length=1)
    answer: str | None = None
    keywords: list[str] | None = None
    enabled: bool = True
    summary: str | None = None


class DocumentRenameRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)


class DocumentSettingsUpdateRequest(BaseModel):
    doc_form: str | None = None
    doc_language: str | None = None
    indexing_technique: str | None = None
    retrieval_model: dict[str, Any] | None = None
    embedding_model: str | None = None
    embedding_model_provider: str | None = None
    keyword_number: int | None = None
    process_rule: ProcessRule | None = None


class PreviewChunksRequest(BaseModel):
    """预览块请求：可选传入 process_rule，不传则使用文档当前规则。"""
    process_rule: dict[str, Any] | None = None


class HitTestingRequest(BaseModel):
    query: str
    retrieval_model: dict[str, Any] | None = None
    document_ids: list[str] | None = None


def _default_retrieval_model() -> dict[str, Any]:
    """默认检索配置：语义检索、top_k=3、无重排。"""
    return {
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
        "weights": None,
    }


# ---------- 序列化：ORM -> API 响应 ----------

def _serialize_kb(kb: KnowledgeBase) -> dict[str, Any]:
    """知识库实体转前端所需字段（含 retrieval_model 解析）。"""
    return {
        "id": kb.id,
        "name": kb.name,
        "is_default": kb.is_default,
        "indexing_technique": kb.indexing_technique,
        "doc_form": kb.doc_form,
        "embedding_model": kb.embedding_model,
        "embedding_model_provider": kb.embedding_model_provider,
        "keyword_number": kb.keyword_number,
        "retrieval_model": kb.retrieval_model_dict,
        "created_at": kb.created_at,
        "updated_at": kb.updated_at,
    }


def _serialize_process_rule(rule: KnowledgeBaseProcessRule | None) -> dict[str, Any] | None:
    """处理规则：mode + rules（预处理与分段）转 JSON 字典。"""
    if not rule:
        return None
    return {
        "id": rule.id,
        "knowledge_base_id": rule.knowledge_base_id,
        "mode": rule.mode,
        "rules": rule.rules_dict,
        "created_at": rule.created_at,
    }


def _serialize_document(
    doc: Document,
    ingest_job: DocumentIngestJob | None = None,
    hit_count: int | None = None,
) -> dict[str, Any]:
    """文档实体转 API 响应，含 ingest_job 状态（队列/处理中/完成）。"""
    return {
        "id": doc.id,
        "knowledge_base_id": doc.knowledge_base_id,
        "filename": doc.filename,
        "name": doc.filename,
        "file_type": doc.file_type,
        "status": doc.status,
        "display_status": doc.display_status,
        "indexing_status": doc.indexing_status,
        "enabled": doc.enabled,
        "archived": doc.archived,
        "archived_reason": doc.archived_reason,
        "word_count": doc.word_count,
        "tokens": doc.tokens,
        "hit_count": int(hit_count or 0),
        "doc_form": doc.doc_form,
        "doc_language": doc.doc_language,
        "data_source_type": doc.data_source_type,
        "data_source_info": doc.data_source_info_dict,
        "batch": doc.batch,
        "position": doc.position,
        "error": doc.error,
        "metadata": json.loads(doc.document_metadata) if doc.document_metadata else None,
        "process_rule_id": doc.process_rule_id,
        "created_from": doc.created_from,
        "processing_started_at": doc.processing_started_at,
        "parsing_completed_at": doc.parsing_completed_at,
        "cleaning_completed_at": doc.cleaning_completed_at,
        "splitting_completed_at": doc.splitting_completed_at,
        "completed_at": doc.completed_at,
        "archived_at": doc.archived_at,
        "disabled_at": doc.disabled_at,
        "created_at": doc.created_at,
        "updated_at": doc.updated_at,
        "ingest_job": ingest_queue_service.serialize_job(ingest_job),
    }


def _serialize_segment(segment: DocumentSegment) -> dict[str, Any]:
    """分段实体转 API 响应（content/keywords/status/index_node_id 等）。"""
    return {
        "id": segment.id,
        "document_id": segment.document_id,
        "knowledge_base_id": segment.knowledge_base_id,
        "position": segment.position,
        "content": segment.content,
        "answer": segment.answer,
        "word_count": segment.word_count,
        "tokens": segment.tokens,
        "keywords": segment.keywords_list,
        "index_node_id": segment.index_node_id,
        "index_node_hash": segment.index_node_hash,
        "hit_count": segment.hit_count,
        "enabled": segment.enabled,
        "status": segment.status,
        "error": segment.error,
        "created_at": segment.created_at,
        "updated_at": segment.updated_at,
    }


def _serialize_kb_query(item: KnowledgeBaseQuery) -> dict[str, Any]:
    query_text = ""
    for content in item.content_list:
        if content.get("content_type") == "text_query":
            query_text = str(content.get("content") or "")
            break
    if not query_text and item.content_list:
        query_text = str(item.content_list[0].get("content") or "")

    return {
        "id": item.id,
        "knowledge_base_id": item.knowledge_base_id,
        "query": query_text,
        "content": item.content_list,
        "source": item.source,
        "created_by": item.created_by,
        "created_at": item.created_at,
    }


# ---------- 内部辅助：处理规则与数据集默认规则 ----------

def _ensure_kb_process_rule(
    db: Session,
    kb_id: str,
    process_rule: ProcessRule | None = None,
) -> KnowledgeBaseProcessRule:
    """若传入 process_rule 则新建一条规则并返回；否则返回该知识库已有第一条规则或创建默认规则。"""
    if process_rule:
        rule = KnowledgeBaseProcessRule(
            knowledge_base_id=kb_id,
            mode=process_rule.mode,
            rules=json.dumps(process_rule.model_dump(mode="json"), ensure_ascii=False),
        )
        db.add(rule)
        db.flush()
        return rule

    rule = (
        db.query(KnowledgeBaseProcessRule)
        .filter(KnowledgeBaseProcessRule.knowledge_base_id == kb_id)
        .order_by(KnowledgeBaseProcessRule.created_at.asc())
        .first()
    )
    if rule:
        return rule

    rule = KnowledgeBaseProcessRule(
        knowledge_base_id=kb_id,
        mode="automatic",
        rules=json.dumps(KnowledgeBaseProcessRule.AUTOMATIC_RULES, ensure_ascii=False),
    )
    db.add(rule)
    db.flush()
    return rule


def _get_dataset_process_rule(db: Session, kb_id: str) -> KnowledgeBaseProcessRule | None:
    """取知识库下最早创建的一条处理规则（用作数据集默认）。"""
    return (
        db.query(KnowledgeBaseProcessRule)
        .filter(KnowledgeBaseProcessRule.knowledge_base_id == kb_id)
        .order_by(KnowledgeBaseProcessRule.created_at.asc())
        .first()
    )


def _build_segment_node(
    segment: DocumentSegment,
    doc: Document,
    kb: KnowledgeBase,
) -> DocumentNode:
    return DocumentNode(
        page_content=segment.content,
        metadata={
            "doc_id": segment.index_node_id or segment.id,
            "document_id": doc.id,
            "knowledge_base_id": kb.id,
            "page_number": 0,
        },
    )


async def _reindex_single_segment(
    db: Session,
    kb: KnowledgeBase,
    doc: Document,
    segment: DocumentSegment,
    keywords_override: list[str] | None = None,
) -> None:
    """单分段重新建索引：删旧向量/关键词后按知识库配置写回（编辑分段内容或关键词时用）。"""
    index_node_id = segment.index_node_id or segment.id
    segment.index_node_id = index_node_id

    vector_db = LanceDBProvider(settings.lance_db_path)
    vector_error = None
    keyword_error = None

    # 先删除旧索引，再写新索引，避免重复命中。
    await vector_db.delete_by_index_node_ids([index_node_id, segment.id])
    keyword_service = JiebaKeywordService(db=db, knowledge_base=kb)
    keyword_service.delete_by_ids([index_node_id])

    node = _build_segment_node(segment=segment, doc=doc, kb=kb)

    try:
        embedding_provider = OllamaEmbeddingProvider(
            base_url=settings.ollama_base_url,
            model=kb.embedding_model or settings.ollama_embedding_model,
        )
        vectors = await embedding_provider.embed([segment.content])
        await vector_db.add_documents(
            vectors=[vectors[0]],
            texts=[segment.content],
            metadata=[
                {
                    "knowledge_base_id": kb.id,
                    "document_id": doc.id,
                    "index_node_id": index_node_id,
                    "chunk_id": index_node_id,
                    "chunk_index": int(segment.position or 0),
                    "page_number": 0,
                }
            ],
        )
    except Exception as exc:  # noqa: BLE001
        vector_error = exc

    try:
        keyword_service.add_texts(
            [node],
            keywords_list=[keywords_override] if keywords_override else None,
        )
    except Exception as exc:  # noqa: BLE001
        keyword_error = exc

    if kb.indexing_technique == "high_quality" and vector_error is not None:
        raise vector_error
    if kb.indexing_technique == "economy" and keyword_error is not None:
        raise keyword_error

    segment.status = "completed"
    segment.completed_at = datetime.utcnow()
    segment.error = None


def _build_document_filters(
    query,
    status: str | None,
):
    """按 status 筛选文档列表：available/disabled/archived/error，与前端筛选口径一致。"""
    if not status:
        return query

    # 与前端状态筛选口径保持一致
    if status == "available":
        return query.filter(
            Document.indexing_status == "completed",
            Document.archived.is_(False),
            Document.enabled.is_(True),
        )
    if status == "disabled":
        return query.filter(
            Document.indexing_status == "completed",
            Document.archived.is_(False),
            Document.enabled.is_(False),
        )
    if status == "archived":
        return query.filter(Document.archived.is_(True))
    if status == "error":
        return query.filter(Document.indexing_status == "error")

    # 兜底旧字段状态
    return query.filter(Document.status == status)


# ---------- 知识库 CRUD ----------

@router.get("", response_model=ApiResponse)
async def get_knowledge_bases(
    keyword: Optional[str] = Query(None, description="关键词"),
    search: Optional[str] = Query(None, description="兼容旧参数"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """知识库列表：支持 keyword/search 搜索、分页。"""
    if not keyword and search:
        keyword = search

    query = db.query(KnowledgeBase)
    if keyword:
        query = query.filter(KnowledgeBase.name.contains(keyword))

    total = query.count()
    items = query.order_by(KnowledgeBase.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    return ApiResponse(
        success=True,
        data={
            "knowledge_bases": [_serialize_kb(kb) for kb in items],
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "has_more": page * limit < total,
            },
        },
    )


@router.get("/{kb_id}", response_model=ApiResponse)
async def get_knowledge_base(kb_id: str, db: Session = Depends(get_db)):
    """单个知识库详情（含序列化后的 retrieval_model）。"""
    kb = db.query(KnowledgeBase).filter(KnowledgeBase.id == kb_id).first()
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")

    return ApiResponse(success=True, data={"knowledge_base": _serialize_kb(kb)})


@router.post("", response_model=ApiResponse)
async def create_knowledge_base(kb_data: KnowledgeBaseCreate, db: Session = Depends(get_db)):
    """创建知识库并初始化默认 process_rule；名称不可重复。"""
    existing = db.query(KnowledgeBase).filter(KnowledgeBase.name == kb_data.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="知识库名称已存在")

    kb = KnowledgeBase(
        name=kb_data.name,
        is_default=db.query(KnowledgeBase).count() == 0,
        indexing_technique=kb_data.indexing_technique,
        doc_form=kb_data.doc_form,
        embedding_model=kb_data.embedding_model or settings.ollama_embedding_model,
        embedding_model_provider=kb_data.embedding_model_provider or "ollama",
        keyword_number=kb_data.keyword_number,
        retrieval_model=json.dumps(kb_data.retrieval_model or _default_retrieval_model(), ensure_ascii=False),
    )
    db.add(kb)
    db.flush()

    _ensure_kb_process_rule(db=db, kb_id=kb.id)
    db.commit()
    db.refresh(kb)

    return ApiResponse(
        success=True,
        data={"knowledge_base": _serialize_kb(kb)},
        message="知识库创建成功",
    )


@router.post("/init", response_model=ApiResponse)
async def init_knowledge_base(payload: KnowledgeBaseInitRequest, db: Session = Depends(get_db)):
    """一次性创建知识库 + 可选批量创建文档（file_paths），共用 process_rule，全部入队。"""
    # 1) 创建知识库
    kb_payload = payload.knowledge_base
    existing = db.query(KnowledgeBase).filter(KnowledgeBase.name == kb_payload.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="知识库名称已存在")

    kb = KnowledgeBase(
        name=kb_payload.name,
        is_default=db.query(KnowledgeBase).count() == 0,
        indexing_technique=kb_payload.indexing_technique,
        doc_form=kb_payload.doc_form,
        embedding_model=kb_payload.embedding_model or settings.ollama_embedding_model,
        embedding_model_provider=kb_payload.embedding_model_provider or "ollama",
        keyword_number=kb_payload.keyword_number,
        retrieval_model=json.dumps(kb_payload.retrieval_model or _default_retrieval_model(), ensure_ascii=False),
    )
    db.add(kb)
    db.flush()

    process_rule = _ensure_kb_process_rule(db=db, kb_id=kb.id, process_rule=payload.process_rule)

    # 2) 批量创建文档记录（使用本地文件路径）
    batch_id = uuid.uuid4().hex
    created_documents: list[Document] = []
    for idx, file_path in enumerate(payload.file_paths, start=1):
        ext = Path(file_path).suffix.lower().lstrip(".")
        doc = Document(
            knowledge_base_id=kb.id,
            filename=Path(file_path).name,
            file_type=ext or "txt",
            file_path=file_path,
            json_path="",
            status="queued",
            indexing_status="waiting",
            doc_form=kb.doc_form,
            doc_language="English",
            data_source_type="upload_file",
            data_source_info=json.dumps({"file_path": file_path}, ensure_ascii=False),
            process_rule_id=process_rule.id,
            batch=batch_id,
            position=idx,
            created_from="upload_file",
            enabled=True,
            archived=False,
        )
        db.add(doc)
        db.flush()
        ingest_queue_service.enqueue_document(db, doc.id, processing_mode=settings.ingest_default_mode)
        created_documents.append(doc)

    db.commit()
    db.refresh(kb)

    return ApiResponse(
        success=True,
        data={
            "knowledge_base": _serialize_kb(kb),
            "batch": batch_id,
            "documents": [_serialize_document(doc) for doc in created_documents],
        },
    )


@router.patch("/{kb_id}", response_model=ApiResponse)
async def patch_knowledge_base(kb_id: str, kb_data: KnowledgeBaseUpdate, db: Session = Depends(get_db)):
    kb = db.query(KnowledgeBase).filter(KnowledgeBase.id == kb_id).first()
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")

    if kb_data.name:
        existing = (
            db.query(KnowledgeBase)
            .filter(KnowledgeBase.name == kb_data.name, KnowledgeBase.id != kb_id)
            .first()
        )
        if existing:
            raise HTTPException(status_code=400, detail="知识库名称已存在")
        kb.name = kb_data.name

    if kb_data.indexing_technique:
        kb.indexing_technique = kb_data.indexing_technique
    if kb_data.doc_form:
        kb.doc_form = kb_data.doc_form
    if kb_data.embedding_model is not None:
        kb.embedding_model = kb_data.embedding_model
    if kb_data.embedding_model_provider is not None:
        kb.embedding_model_provider = kb_data.embedding_model_provider
    if kb_data.keyword_number is not None:
        kb.keyword_number = kb_data.keyword_number
    if kb_data.retrieval_model is not None:
        kb.retrieval_model = json.dumps(kb_data.retrieval_model, ensure_ascii=False)

    db.commit()
    db.refresh(kb)

    return ApiResponse(success=True, data={"knowledge_base": _serialize_kb(kb)}, message="知识库更新成功")


@router.put("/{kb_id}", response_model=ApiResponse)
async def update_knowledge_base(kb_id: str, kb_data: KnowledgeBaseUpdate, db: Session = Depends(get_db)):
    # 兼容旧接口
    return await patch_knowledge_base(kb_id=kb_id, kb_data=kb_data, db=db)


@router.delete("/{kb_id}", response_model=ApiResponse)
async def delete_knowledge_base(kb_id: str, db: Session = Depends(get_db)):
    """删除知识库；若为最后一个知识库则禁止删除。

    具体业务校验委托给 KnowledgeBaseService，router 仅负责异常到 HTTP 的映射。
    """
    try:
        kb_service.delete_knowledge_base(db=db, kb_id=kb_id)
    except KnowledgeBaseNotFoundError:
        raise HTTPException(status_code=404, detail="知识库不存在") from None
    except CannotDeleteLastKnowledgeBaseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    except KnowledgeBaseHasDocumentsError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None

    return ApiResponse(success=True, message="知识库已删除")


# ---------- 文档：列表、创建、详情、重命名、设置、预览、重新入队、索引状态 ----------

@router.get("/{kb_id}/documents", response_model=ApiResponse)
async def get_knowledge_base_documents(
    kb_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None, description="available/disabled/archived/error"),
    sort_by: str = Query("created_at", description="created_at/updated_at"),
    sort_order: str = Query("desc", description="asc/desc"),
    db: Session = Depends(get_db),
):
    """文档列表：按 status 筛选、分页、排序；返回每条文档的 ingest_job 与 hit_count。"""
    kb = db.query(KnowledgeBase).filter(KnowledgeBase.id == kb_id).first()
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")

    query = db.query(Document).filter(Document.knowledge_base_id == kb_id)
    query = _build_document_filters(query, status)

    sort_column = Document.updated_at if sort_by == "updated_at" else Document.created_at
    if sort_order.lower() == "asc":
        query = query.order_by(sort_column.asc())
    else:
        query = query.order_by(sort_column.desc())

    total = query.count()
    documents = query.offset((page - 1) * page_size).limit(page_size).all()

    document_ids = [doc.id for doc in documents]
    jobs_map = {}
    if document_ids:
        jobs = db.query(DocumentIngestJob).filter(DocumentIngestJob.document_id.in_(document_ids)).all()
        jobs_map = {job.document_id: job for job in jobs}
    # 一次聚合计算文档召回次数，避免前端列表逐条请求。
    hit_count_map: dict[str, int] = {}
    if document_ids:
        hit_rows = (
            db.query(
                DocumentSegment.document_id.label("document_id"),
                func.sum(DocumentSegment.hit_count).label("hit_count"),
            )
            .filter(DocumentSegment.document_id.in_(document_ids))
            .group_by(DocumentSegment.document_id)
            .all()
        )
        hit_count_map = {str(row.document_id): int(row.hit_count or 0) for row in hit_rows}

    return ApiResponse(
        success=True,
        data={
            "documents": [
                _serialize_document(
                    doc,
                    jobs_map.get(doc.id),
                    hit_count=hit_count_map.get(doc.id, 0),
                )
                for doc in documents
            ],
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": total,
                "total_pages": (total + page_size - 1) // page_size,
            },
        },
    )


@router.post("/{kb_id}/documents", response_model=ApiResponse)
async def create_knowledge_base_document(kb_id: str, payload: DocumentCreateRequest, db: Session = Depends(get_db)):
    """按本地 file_path 创建文档记录并加入 ingest 队列；可选 batch 同批多文档。

    具体的文档创建与入队逻辑委托给 KnowledgeBaseService，router 仅做参数校验与 HTTP 映射。
    """
    kb = db.query(KnowledgeBase).filter(KnowledgeBase.id == kb_id).first()
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")

    if not Path(payload.file_path).exists():
        raise HTTPException(status_code=400, detail=f"文件不存在: {payload.file_path}")

    try:
        document, job, batch_id = kb_service.create_document_for_knowledge_base(
            db=db,
            kb=kb,
            file_path=payload.file_path,
            file_type=payload.file_type,
            name=payload.name,
            process_rule=payload.process_rule,
            retrieval_model=payload.retrieval_model,
            doc_form=payload.doc_form,
            doc_language=payload.doc_language,
            batch=payload.batch,
        )
    except TypeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return ApiResponse(
        success=True,
        data={
            "document": _serialize_document(document, job),
            "batch": batch_id,
        },
        message="文档已加入索引队列",
    )


@router.get("/{kb_id}/documents/{doc_id}", response_model=ApiResponse)
async def get_knowledge_base_document(kb_id: str, doc_id: str, db: Session = Depends(get_db)):
    """文档详情：含 document_process_rule、dataset_process_rule、technical_parameters、segment_count、hit_count。"""
    try:
        payload = kb_service.get_document_detail(db=db, kb_id=kb_id, doc_id=doc_id)
    except DocumentNotFoundError:
        raise HTTPException(status_code=404, detail="文档不存在") from None

    return ApiResponse(success=True, data={"document": payload})


@router.patch("/{kb_id}/documents/{doc_id}/name", response_model=ApiResponse)
async def rename_knowledge_base_document(
    kb_id: str,
    doc_id: str,
    payload: DocumentRenameRequest,
    db: Session = Depends(get_db),
):
    doc = (
        db.query(Document)
        .filter(Document.id == doc_id, Document.knowledge_base_id == kb_id)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    # 业务规则：归档文档不可编辑名称。
    if doc.archived:
        raise HTTPException(status_code=400, detail="归档文档不可编辑，请先取消归档")

    new_name = payload.name.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="文档名称不能为空")

    doc.filename = new_name
    doc.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(doc)

    job = db.query(DocumentIngestJob).filter(DocumentIngestJob.document_id == doc.id).first()
    hit_count = (
        db.query(func.sum(DocumentSegment.hit_count))
        .filter(DocumentSegment.document_id == doc.id)
        .scalar()
    )

    return ApiResponse(
        success=True,
        data={"document": _serialize_document(doc, job, hit_count=int(hit_count or 0))},
        message="文档重命名成功",
    )


@router.patch("/{kb_id}/documents/{doc_id}/settings", response_model=ApiResponse)
async def patch_document_settings(
    kb_id: str,
    doc_id: str,
    payload: DocumentSettingsUpdateRequest,
    db: Session = Depends(get_db),
):
    """更新文档处理规则、检索配置等；不触发重新索引，需单独调用 reindex 入队。"""
    doc = (
        db.query(Document)
        .filter(Document.id == doc_id, Document.knowledge_base_id == kb_id)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    if doc.archived:
        raise HTTPException(status_code=400, detail="归档文档不可编辑，请先取消归档")

    kb = db.query(KnowledgeBase).filter(KnowledgeBase.id == kb_id).first()
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")

    if payload.doc_form is not None:
        doc.doc_form = payload.doc_form
    if payload.doc_language is not None:
        doc.doc_language = payload.doc_language

    if payload.process_rule is not None:
        doc_rule = KnowledgeBaseProcessRule(
            knowledge_base_id=kb_id,
            mode=payload.process_rule.mode,
            rules=json.dumps(payload.process_rule.model_dump(mode="json"), ensure_ascii=False),
        )
        db.add(doc_rule)
        db.flush()
        doc.process_rule_id = doc_rule.id

    if payload.indexing_technique is not None:
        kb.indexing_technique = payload.indexing_technique
    if payload.retrieval_model is not None:
        kb.retrieval_model = json.dumps(payload.retrieval_model, ensure_ascii=False)
    if payload.embedding_model is not None:
        kb.embedding_model = payload.embedding_model
    if payload.embedding_model_provider is not None:
        kb.embedding_model_provider = payload.embedding_model_provider
    if payload.keyword_number is not None:
        kb.keyword_number = payload.keyword_number

    doc.updated_at = datetime.utcnow()
    kb.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(doc)
    db.refresh(kb)

    job = db.query(DocumentIngestJob).filter(DocumentIngestJob.document_id == doc.id).first()
    hit_count = (
        db.query(func.sum(DocumentSegment.hit_count))
        .filter(DocumentSegment.document_id == doc.id)
        .scalar()
    )

    document_rule = None
    if doc.process_rule_id:
        document_rule = (
            db.query(KnowledgeBaseProcessRule)
            .filter(KnowledgeBaseProcessRule.id == doc.process_rule_id)
            .first()
        )
    dataset_rule = _get_dataset_process_rule(db=db, kb_id=kb_id)

    result_doc = _serialize_document(doc, ingest_job=job, hit_count=int(hit_count or 0))
    result_doc["document_process_rule"] = _serialize_process_rule(document_rule)
    result_doc["dataset_process_rule"] = _serialize_process_rule(dataset_rule)

    return ApiResponse(
        success=True,
        data={
            "document": result_doc,
            "knowledge_base": _serialize_kb(kb),
        },
        message="文档设置保存成功",
    )


@router.post("/{kb_id}/documents/{doc_id}/preview-chunks", response_model=ApiResponse)
async def preview_document_chunks(
    kb_id: str,
    doc_id: str,
    payload: PreviewChunksRequest,
    db: Session = Depends(get_db),
):
    """按当前或传入的 process_rule 执行抽取与分段，返回 total_segments 与 preview；不落库、不建索引。"""
    doc = (
        db.query(Document)
        .filter(Document.id == doc_id, Document.knowledge_base_id == kb_id)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    process_rule_override = None
    if payload.process_rule:
        pr = payload.process_rule
        rules = pr.get("rules") or {}
        seg = (rules.get("segmentation") or {}) if isinstance(rules, dict) else {}
        process_rule_override = {
            "mode": pr.get("mode", "automatic"),
            "rules": {
                "segmentation": {
                    "separator": seg.get("separator", "\n"),
                    "max_tokens": int(seg.get("max_tokens") or 500),
                    "chunk_overlap": int(seg.get("chunk_overlap") or 50),
                },
                "pre_processing_rules": rules.get("pre_processing_rules") if isinstance(rules, dict) else None,
            },
        }

    try:
        result = await indexing_runner.preview(
            db=db,
            document=doc,
            process_rule_override=process_rule_override,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return ApiResponse(success=True, data=result)


# ---------- 分段：列表、创建、删除、更新、批量启用/禁用 ----------

@router.get("/{kb_id}/documents/{doc_id}/segments", response_model=ApiResponse)
async def get_document_segments(
    kb_id: str,
    doc_id: str,
    enabled: bool | None = Query(None),
    keyword: str | None = Query(None),
    db: Session = Depends(get_db),
):
    doc = db.query(Document).filter(Document.id == doc_id, Document.knowledge_base_id == kb_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    query = db.query(DocumentSegment).filter(
        DocumentSegment.document_id == doc_id,
        DocumentSegment.knowledge_base_id == kb_id,
    )
    if enabled is not None:
        query = query.filter(DocumentSegment.enabled.is_(enabled))
    if keyword:
        query = query.filter(
            or_(
                DocumentSegment.content.contains(keyword),
                DocumentSegment.keywords.contains(keyword),
            )
        )

    segments = query.order_by(DocumentSegment.position.asc()).all()
    return ApiResponse(success=True, data={"segments": [_serialize_segment(item) for item in segments]})


@router.post("/{kb_id}/documents/{doc_id}/segment", response_model=ApiResponse)
async def create_document_segment(
    kb_id: str,
    doc_id: str,
    payload: SegmentCreateRequest,
    db: Session = Depends(get_db),
):
    doc = db.query(Document).filter(Document.id == doc_id, Document.knowledge_base_id == kb_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    if doc.archived:
        raise HTTPException(status_code=400, detail="归档文档不可编辑，请先取消归档")

    kb = db.query(KnowledgeBase).filter(KnowledgeBase.id == kb_id).first()
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")

    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="content 不能为空")

    next_position = (
        db.query(func.max(DocumentSegment.position))
        .filter(DocumentSegment.document_id == doc_id)
        .scalar()
        or 0
    ) + 1

    index_node_id = str(uuid.uuid4())
    segment = DocumentSegment(
        document_id=doc.id,
        knowledge_base_id=kb.id,
        position=next_position,
        content=content,
        answer=payload.answer,
        word_count=len(content),
        tokens=max(1, len(content) // 4),
        keywords=json.dumps(payload.keywords or [], ensure_ascii=False),
        index_node_id=index_node_id,
        index_node_hash=hashlib.sha1(content.encode("utf-8")).hexdigest(),
        hit_count=0,
        enabled=bool(payload.enabled and doc.enabled),
        status="indexing",
        indexing_at=datetime.utcnow(),
    )
    if not segment.enabled:
        segment.disabled_at = datetime.utcnow()
        segment.disabled_by = "system"

    db.add(segment)
    db.flush()

    try:
        await _reindex_single_segment(
            db=db,
            kb=kb,
            doc=doc,
            segment=segment,
            keywords_override=payload.keywords,
        )
    except Exception as exc:  # noqa: BLE001
        segment.status = "error"
        segment.error = str(exc)
        db.commit()
        raise HTTPException(status_code=400, detail=f"新增分段失败: {exc}") from exc

    db.commit()
    db.refresh(segment)
    return ApiResponse(success=True, data={"segment": _serialize_segment(segment)}, message="分段新增成功")


@router.delete("/{kb_id}/documents/{doc_id}/segments", response_model=ApiResponse)
async def delete_document_segments(
    kb_id: str,
    doc_id: str,
    segment_id: list[str] = Query([]),
    db: Session = Depends(get_db),
):
    doc = db.query(Document).filter(Document.id == doc_id, Document.knowledge_base_id == kb_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    if doc.archived:
        raise HTTPException(status_code=400, detail="归档文档不可编辑，请先取消归档")
    if not segment_id:
        raise HTTPException(status_code=400, detail="至少传一个 segment_id")

    kb = db.query(KnowledgeBase).filter(KnowledgeBase.id == kb_id).first()
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")

    segments = (
        db.query(DocumentSegment)
        .filter(
            DocumentSegment.knowledge_base_id == kb_id,
            DocumentSegment.document_id == doc_id,
            DocumentSegment.id.in_(segment_id),
        )
        .all()
    )
    if not segments:
        raise HTTPException(status_code=404, detail="分段不存在")

    node_ids = [item.index_node_id or item.id for item in segments]
    vector_db = LanceDBProvider(settings.lance_db_path)
    await vector_db.delete_by_index_node_ids(node_ids)
    JiebaKeywordService(db=db, knowledge_base=kb).delete_by_ids(node_ids)

    db.query(DocumentSegment).filter(
        DocumentSegment.knowledge_base_id == kb_id,
        DocumentSegment.document_id == doc_id,
        DocumentSegment.id.in_(segment_id),
    ).delete(synchronize_session=False)

    # 删除后重排 position，避免前端展示断层。
    remaining = (
        db.query(DocumentSegment)
        .filter(
            DocumentSegment.knowledge_base_id == kb_id,
            DocumentSegment.document_id == doc_id,
        )
        .order_by(DocumentSegment.position.asc())
        .all()
    )
    for idx, item in enumerate(remaining, start=1):
        item.position = idx

    db.commit()
    return ApiResponse(
        success=True,
        data={"deleted": len(segments), "segment_ids": segment_id},
        message="分段删除成功",
    )


@router.patch("/{kb_id}/documents/{doc_id}/segments/{seg_id}", response_model=ApiResponse)
async def patch_document_segment(
    kb_id: str,
    doc_id: str,
    seg_id: str,
    payload: SegmentUpdateRequest,
    db: Session = Depends(get_db),
):
    doc = db.query(Document).filter(Document.id == doc_id, Document.knowledge_base_id == kb_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    # 业务规则：归档文档不可编辑。
    if doc.archived:
        raise HTTPException(status_code=400, detail="归档文档不可编辑，请先取消归档")

    segment = (
        db.query(DocumentSegment)
        .filter(
            DocumentSegment.id == seg_id,
            DocumentSegment.document_id == doc_id,
            DocumentSegment.knowledge_base_id == kb_id,
        )
        .first()
    )
    if not segment:
        raise HTTPException(status_code=404, detail="分段不存在")

    need_reindex = False
    keywords_override: list[str] | None = None

    if payload.content is not None:
        next_content = payload.content.strip()
        if not next_content:
            raise HTTPException(status_code=400, detail="content 不能为空")
        segment.content = next_content
        segment.word_count = len(next_content)
        segment.tokens = max(1, len(next_content) // 4)
        segment.index_node_hash = hashlib.sha1(next_content.encode("utf-8")).hexdigest()
        segment.status = "indexing"
        segment.indexing_at = datetime.utcnow()
        need_reindex = True
    if payload.answer is not None:
        segment.answer = payload.answer
    if payload.enabled is not None:
        segment.enabled = payload.enabled
        if payload.enabled:
            segment.disabled_at = None
            segment.disabled_by = None
        else:
            segment.disabled_at = datetime.utcnow()
            segment.disabled_by = "system"
    if payload.keywords is not None:
        segment.keywords = json.dumps(payload.keywords, ensure_ascii=False)
        keywords_override = payload.keywords
        need_reindex = True

    if need_reindex:
        kb = db.query(KnowledgeBase).filter(KnowledgeBase.id == kb_id).first()
        if not kb:
            raise HTTPException(status_code=404, detail="知识库不存在")
        try:
            await _reindex_single_segment(
                db=db,
                kb=kb,
                doc=doc,
                segment=segment,
                keywords_override=keywords_override,
            )
        except Exception as exc:  # noqa: BLE001
            segment.status = "error"
            segment.error = str(exc)
            db.commit()
            raise HTTPException(status_code=400, detail=f"分段重建索引失败: {exc}") from exc

    segment.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(segment)

    return ApiResponse(success=True, data={"segment": _serialize_segment(segment)}, message="分段更新成功")


@router.patch("/{kb_id}/documents/{doc_id}/segment/{action}", response_model=ApiResponse)
async def patch_document_segments_status(
    kb_id: str,
    doc_id: str,
    action: str,
    segment_id: list[str] = Query([]),
    db: Session = Depends(get_db),
):
    doc = db.query(Document).filter(Document.id == doc_id, Document.knowledge_base_id == kb_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    # 业务规则：归档文档不可编辑分段状态。
    if doc.archived:
        raise HTTPException(status_code=400, detail="归档文档不可编辑，请先取消归档")

    if action not in {"enable", "disable"}:
        raise HTTPException(status_code=400, detail="action 必须是 enable/disable")
    if not segment_id:
        raise HTTPException(status_code=400, detail="至少传一个 segment_id")

    query = db.query(DocumentSegment).filter(
        DocumentSegment.knowledge_base_id == kb_id,
        DocumentSegment.document_id == doc_id,
        DocumentSegment.id.in_(segment_id),
    )
    segments = query.all()
    if not segments:
        raise HTTPException(status_code=404, detail="分段不存在")

    if action == "enable":
        query.update(
            {
                DocumentSegment.enabled: True,
                DocumentSegment.disabled_at: None,
                DocumentSegment.disabled_by: None,
            },
            synchronize_session=False,
        )
    else:
        query.update(
            {
                DocumentSegment.enabled: False,
                DocumentSegment.disabled_at: datetime.utcnow(),
                DocumentSegment.disabled_by: "system",
            },
            synchronize_session=False,
        )

    db.commit()

    return ApiResponse(
        success=True,
        data={"updated": len(segments), "action": action, "segment_ids": segment_id},
    )


# ---------- 重新入队与索引状态 ----------

@router.post("/{kb_id}/documents/{doc_id}/reindex", response_model=ApiResponse)
async def reindex_document(kb_id: str, doc_id: str, db: Session = Depends(get_db)):
    """将文档设为 indexing_status=waiting 并加入 ingest 队列（process 页「保存并处理」后调用）。"""
    doc = db.query(Document).filter(Document.id == doc_id, Document.knowledge_base_id == kb_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    if doc.archived:
        raise HTTPException(status_code=400, detail="归档文档不可重新索引")
    doc.indexing_status = "waiting"
    doc.updated_at = datetime.utcnow()
    ingest_queue_service.enqueue_document(db, doc.id, processing_mode=settings.ingest_default_mode)
    db.commit()
    db.refresh(doc)
    return ApiResponse(success=True, data={"document_id": doc_id}, message="已加入索引队列")


@router.get("/{kb_id}/documents/{doc_id}/indexing-status", response_model=ApiResponse)
async def get_document_indexing_status(kb_id: str, doc_id: str, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == doc_id, Document.knowledge_base_id == kb_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    total_segments = db.query(DocumentSegment).filter(DocumentSegment.document_id == doc.id).count()
    completed_segments = (
        db.query(DocumentSegment)
        .filter(DocumentSegment.document_id == doc.id, DocumentSegment.status == "completed")
        .count()
    )

    return ApiResponse(
        success=True,
        data={
            "indexing_status": doc.indexing_status,
            "completed_segments": completed_segments,
            "total_segments": total_segments,
            "parsing_completed_at": doc.parsing_completed_at,
            "cleaning_completed_at": doc.cleaning_completed_at,
            "splitting_completed_at": doc.splitting_completed_at,
            "completed_at": doc.completed_at,
            "error": doc.error,
        },
    )


@router.get("/{kb_id}/batch/{batch_id}/indexing-status", response_model=ApiResponse)
async def get_batch_indexing_status(kb_id: str, batch_id: str, db: Session = Depends(get_db)):
    docs = (
        db.query(Document)
        .filter(Document.knowledge_base_id == kb_id, Document.batch == batch_id)
        .order_by(Document.position.asc())
        .all()
    )
    if not docs:
        raise HTTPException(status_code=404, detail="批次不存在")

    items = []
    for doc in docs:
        total_segments = db.query(DocumentSegment).filter(DocumentSegment.document_id == doc.id).count()
        completed_segments = (
            db.query(DocumentSegment)
            .filter(DocumentSegment.document_id == doc.id, DocumentSegment.status == "completed")
            .count()
        )
        items.append(
            {
                "document_id": doc.id,
                "filename": doc.filename,
                "indexing_status": doc.indexing_status,
                "completed_segments": completed_segments,
                "total_segments": total_segments,
                "parsing_completed_at": doc.parsing_completed_at,
                "cleaning_completed_at": doc.cleaning_completed_at,
                "splitting_completed_at": doc.splitting_completed_at,
                "completed_at": doc.completed_at,
                "error": doc.error,
            }
        )

    return ApiResponse(success=True, data={"batch": batch_id, "documents": items})


# ---------- 文档批量状态（启用/禁用/归档/取消归档） ----------

@router.patch("/{kb_id}/documents/status/{action}/batch", response_model=ApiResponse)
async def patch_documents_status_batch(
    kb_id: str,
    action: str,
    document_id: list[str] = Query([]),
    db: Session = Depends(get_db),
):
    if action not in {"enable", "disable", "archive", "un_archive"}:
        raise HTTPException(status_code=400, detail="action 仅支持 enable/disable/archive/un_archive")
    if not document_id:
        raise HTTPException(status_code=400, detail="至少传一个 document_id")

    docs_query = db.query(Document).filter(Document.knowledge_base_id == kb_id, Document.id.in_(document_id))
    docs = docs_query.all()
    if not docs:
        raise HTTPException(status_code=404, detail="文档不存在")

    now = datetime.utcnow()
    if action == "enable":
        docs_query.update(
            {
                Document.enabled: True,
                Document.disabled_at: None,
                Document.disabled_by: None,
            },
            synchronize_session=False,
        )
        db.query(DocumentSegment).filter(
            DocumentSegment.knowledge_base_id == kb_id,
            DocumentSegment.document_id.in_(document_id),
        ).update(
            {
                DocumentSegment.enabled: True,
                DocumentSegment.disabled_at: None,
                DocumentSegment.disabled_by: None,
            },
            synchronize_session=False,
        )
    elif action == "disable":
        docs_query.update(
            {
                Document.enabled: False,
                Document.disabled_at: now,
                Document.disabled_by: "system",
            },
            synchronize_session=False,
        )
        db.query(DocumentSegment).filter(
            DocumentSegment.knowledge_base_id == kb_id,
            DocumentSegment.document_id.in_(document_id),
        ).update(
            {
                DocumentSegment.enabled: False,
                DocumentSegment.disabled_at: now,
                DocumentSegment.disabled_by: "system",
            },
            synchronize_session=False,
        )
    elif action == "archive":
        docs_query.update(
            {
                Document.archived: True,
                Document.archived_reason: "manual_archive",
                Document.archived_by: "system",
                Document.archived_at: now,
            },
            synchronize_session=False,
        )
    else:  # un_archive
        docs_query.update(
            {
                Document.archived: False,
                Document.archived_reason: None,
                Document.archived_by: None,
                Document.archived_at: None,
            },
            synchronize_session=False,
        )

    db.commit()

    return ApiResponse(
        success=True,
        data={"updated": len(docs), "action": action, "document_ids": document_id},
    )


# ---------- 召回测试 ----------

@router.post("/{kb_id}/hit-testing", response_model=ApiResponse)
async def hit_testing(kb_id: str, payload: HitTestingRequest, db: Session = Depends(get_db)):
    """召回测试：按 query 与可选 retrieval_model/document_ids 检索，返回命中的 records 与 hits。"""
    kb = db.query(KnowledgeBase).filter(KnowledgeBase.id == kb_id).first()
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")

    try:
        HitTestingService.hit_testing_args_check(payload.model_dump(mode="json"))
    except ValueError as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    response = await hit_testing_service.retrieve(
        db=db,
        knowledge_base=kb,
        query=payload.query,
        retrieval_model=payload.retrieval_model,
        document_ids=payload.document_ids,
        limit=10,
    )

    return ApiResponse(
        success=True,
        data={
            # 兼容现有前端：query 保持字符串；query_payload 给后续页面扩展使用。
            "query": response["query"]["content"],
            "query_payload": response["query"],
            "retrieval_model": response["retrieval_model"],
            "records": response["records"],
            "hits": response["hits"],
        },
    )


@router.get("/{kb_id}/queries", response_model=ApiResponse)
async def get_hit_testing_queries(
    kb_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    kb = db.query(KnowledgeBase).filter(KnowledgeBase.id == kb_id).first()
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")

    query = db.query(KnowledgeBaseQuery).filter(KnowledgeBaseQuery.knowledge_base_id == kb_id)
    total = query.count()
    items = (
        query.order_by(KnowledgeBaseQuery.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    return ApiResponse(
        success=True,
        data={
            "queries": [_serialize_kb_query(item) for item in items],
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "has_more": page * limit < total,
            },
        },
    )

