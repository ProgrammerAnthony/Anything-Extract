"""文档管理 API。"""
from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
import shutil
import traceback
import uuid
from typing import Dict, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.models.schemas import ApiResponse, DocumentStatusResponse
from core.config import settings
from core.database import (
    Document,
    DocumentIngestJob,
    DocumentSegment,
    DocumentVector,
    ExtractionResult,
    KnowledgeBase,
    KnowledgeBaseProcessRule,
    SessionLocal,
    get_db,
)
from core.rag.datasource.keyword.jieba import JiebaKeywordService
from providers.vector_db.lancedb import LanceDBProvider
from services.document_ingest_service import DocumentIngestService
from services.document_service import DocumentService, DocumentNotFoundError, DocumentDeletionError
from services.ingest_queue_service import IngestQueueService
from utils.logging import debug_logger, document_logger

router = APIRouter()
ingest_queue_service = IngestQueueService()
document_service = DocumentService()

SUPPORTED_UPLOAD_EXTENSIONS = {
    "pdf",
    "docx",
    "txt",
    "md",
    "csv",
    "json",
    "xlsx",
    "pptx",
    "eml",
    "jpg",
    "jpeg",
    "png",
}
EXTENSION_MIME_TYPES = {
    "pdf": {"application/pdf"},
    "docx": {"application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
    "txt": {"text/plain"},
    "md": {"text/markdown", "text/x-markdown", "text/plain"},
    "csv": {"text/csv", "application/csv", "text/plain"},
    "json": {"application/json", "text/json", "text/plain"},
    "xlsx": {"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},
    "pptx": {"application/vnd.openxmlformats-officedocument.presentationml.presentation"},
    "eml": {"message/rfc822", "text/plain", "application/octet-stream"},
    "jpg": {"image/jpeg"},
    "jpeg": {"image/jpeg"},
    "png": {"image/png"},
}


def _resolve_upload_file_type(file: UploadFile) -> str:
    if not file.filename:
        raise HTTPException(status_code=400, detail="文件名不能为空")

    file_extension = Path(file.filename).suffix.lower().lstrip(".")
    if file_extension not in SUPPORTED_UPLOAD_EXTENSIONS:
        allowed = ", ".join(sorted(SUPPORTED_UPLOAD_EXTENSIONS))
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件类型: {file_extension or 'unknown'}，支持: {allowed}",
        )

    content_type = (file.content_type or "").lower()
    expected_mimes = EXTENSION_MIME_TYPES.get(file_extension, set())
    if content_type and content_type not in expected_mimes and content_type != "application/octet-stream":
        document_logger.warning(
            "MIME mismatch for file upload: %s, extension=%s, content_type=%s",
            file.filename,
            file_extension,
            content_type,
        )

    return file_extension


def _serialize_document(document: Document, ingest_job: Optional[DocumentIngestJob] = None) -> Dict[str, object]:
    metadata = json.loads(document.document_metadata) if document.document_metadata else None
    if ingest_job is None:
        ingest_job = document.ingest_job

    return {
        "id": document.id,
        "knowledge_base_id": document.knowledge_base_id,
        "filename": document.filename,
        "file_type": document.file_type,
        "status": document.status,
        "display_status": document.display_status,
        "indexing_status": document.indexing_status,
        "enabled": document.enabled,
        "archived": document.archived,
        "doc_form": document.doc_form,
        "doc_language": document.doc_language,
        "batch": document.batch,
        "position": document.position,
        "word_count": document.word_count,
        "tokens": document.tokens,
        "error": document.error,
        "metadata": metadata,
        "created_at": document.created_at.isoformat() if hasattr(document.created_at, "isoformat") else str(document.created_at),
        "updated_at": document.updated_at.isoformat() if hasattr(document.updated_at, "isoformat") else str(document.updated_at),
        "ingest_job": ingest_queue_service.serialize_job(ingest_job),
    }


def _ensure_default_process_rule_id(db: Session, knowledge_base_id: str) -> str:
    rule = (
        db.query(KnowledgeBaseProcessRule)
        .filter(KnowledgeBaseProcessRule.knowledge_base_id == knowledge_base_id)
        .order_by(KnowledgeBaseProcessRule.created_at.asc())
        .first()
    )
    if rule:
        return rule.id

    rule = KnowledgeBaseProcessRule(
        knowledge_base_id=knowledge_base_id,
        mode="automatic",
        rules=json.dumps(KnowledgeBaseProcessRule.AUTOMATIC_RULES, ensure_ascii=False),
    )
    db.add(rule)
    db.flush()
    return rule.id


async def _process_document_immediate(document_id: str) -> None:
    db_session = SessionLocal()
    try:
        document = db_session.query(Document).filter(Document.id == document_id).first()
        if not document:
            document_logger.error("即时处理找不到文档: %s", document_id)
            return

        ingest_service = DocumentIngestService()
        await ingest_service.ingest_document(db_session, document)
        db_session.commit()
        document_logger.info("即时处理完成: %s", document_id)
    except Exception as exc:  # noqa: BLE001
        db_session.rollback()
        error_msg = f"即时处理失败: {exc}\n{traceback.format_exc()}"
        document_logger.error(error_msg)
        debug_logger.error(error_msg)

        try:
            document = db_session.query(Document).filter(Document.id == document_id).first()
            if document:
                document.status = "failed"
                document.indexing_status = "error"
                document.error = str(exc)
                document.stopped_at = document.updated_at
                db_session.commit()
        except Exception as mark_exc:  # noqa: BLE001
            document_logger.error("即时处理状态写回失败: %s", mark_exc)
    finally:
        db_session.close()


@router.post("/upload", response_model=ApiResponse)
async def upload_document(
    file: UploadFile = File(...),
    knowledge_base_id: str = Form(...),
    processing_mode: Optional[str] = Form(None),
    batch: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    kb = db.query(KnowledgeBase).filter(KnowledgeBase.id == knowledge_base_id).first()
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")

    file_type = _resolve_upload_file_type(file)

    try:
        mode = ingest_queue_service.normalize_mode(processing_mode)
    except ValueError as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    upload_path = Path(settings.uploads_path)
    upload_path.mkdir(parents=True, exist_ok=True)

    safe_filename = f"{uuid.uuid4().hex}_{file.filename}"
    file_path = upload_path / safe_filename
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    initial_status = "queued" if mode == "queue" else "processing"
    batch_id = batch or uuid.uuid4().hex
    position = (
        db.query(Document)
        .filter(Document.knowledge_base_id == knowledge_base_id, Document.batch == batch_id)
        .count()
        + 1
    )
    process_rule_id = _ensure_default_process_rule_id(db=db, knowledge_base_id=knowledge_base_id)

    document = Document(
        knowledge_base_id=knowledge_base_id,
        filename=file.filename,
        file_type=file_type,
        file_path=str(file_path),
        json_path="",
        status=initial_status,
        indexing_status="waiting",
        doc_form=kb.doc_form or "text_model",
        doc_language="English",
        data_source_type="upload_file",
        data_source_info=json.dumps({"file_path": str(file_path)}, ensure_ascii=False),
        process_rule_id=process_rule_id,
        batch=batch_id,
        position=position,
        created_from="upload_file",
        enabled=True,
        archived=False,
    )
    db.add(document)
    db.flush()

    ingest_job = None
    if mode == "queue":
        ingest_job = ingest_queue_service.enqueue_document(db, document.id, processing_mode=mode)

    db.commit()
    db.refresh(document)
    if ingest_job:
        db.refresh(ingest_job)

    if mode == "immediate":
        asyncio.create_task(_process_document_immediate(document.id))
        message = "文档上传成功，正在后台处理"
    else:
        message = "文档上传成功，已进入后台队列"

    return ApiResponse(
        success=True,
        data={"document": _serialize_document(document, ingest_job), "processing_mode": mode},
        message=message,
    )


@router.get("", response_model=ApiResponse)
async def get_documents(
    page: int = 1,
    page_size: int = 20,
    status: Optional[str] = None,
    knowledge_base_id: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(Document)
    if knowledge_base_id:
        query = query.filter(Document.knowledge_base_id == knowledge_base_id)
    if status:
        query = query.filter(Document.status == status)

    total = query.count()
    documents = query.order_by(Document.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    document_ids = [doc.id for doc in documents]
    jobs_map: Dict[str, DocumentIngestJob] = {}
    if document_ids:
        jobs = db.query(DocumentIngestJob).filter(DocumentIngestJob.document_id.in_(document_ids)).all()
        jobs_map = {job.document_id: job for job in jobs}

    docs_list = [_serialize_document(doc, jobs_map.get(doc.id)) for doc in documents]

    return ApiResponse(
        success=True,
        data={
            "documents": docs_list,
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": total,
                "total_pages": (total + page_size - 1) // page_size,
            },
        },
    )


@router.get("/{document_id}", response_model=ApiResponse)
async def get_document(document_id: str, db: Session = Depends(get_db)):
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="文档不存在")

    extraction_results = (
        db.query(ExtractionResult)
        .filter(ExtractionResult.document_id == document_id)
        .order_by(ExtractionResult.created_at.desc())
        .all()
    )

    extraction_history: Dict[str, Dict[str, object]] = {}
    for extraction_result in extraction_results:
        tag_id = extraction_result.tag_config_id
        if tag_id not in extraction_history:
            extraction_history[tag_id] = {
                "tag_config_id": tag_id,
                "latest_result": None,
                "all_results": [],
            }

        result_data = {
            "id": extraction_result.id,
            "result": json.loads(extraction_result.result) if extraction_result.result else {},
            "retrieval_results": json.loads(extraction_result.retrieval_results) if extraction_result.retrieval_results else [],
            "prompt": extraction_result.prompt,
            "llm_response": extraction_result.llm_response,
            "parsed_result": json.loads(extraction_result.parsed_result) if extraction_result.parsed_result else {},
            "extraction_time": json.loads(extraction_result.extraction_time) if extraction_result.extraction_time else {},
            "created_at": extraction_result.created_at.isoformat()
            if hasattr(extraction_result.created_at, "isoformat")
            else str(extraction_result.created_at),
        }

        extraction_history[tag_id]["all_results"].append(result_data)
        if extraction_history[tag_id]["latest_result"] is None:
            extraction_history[tag_id]["latest_result"] = result_data

    document_data = _serialize_document(document)
    document_data["has_extraction"] = len(extraction_history) > 0
    document_data["extraction_history"] = extraction_history

    return ApiResponse(success=True, data={"document": document_data})


@router.get("/{document_id}/status", response_model=ApiResponse)
async def get_document_status(document_id: str, db: Session = Depends(get_db)):
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="文档不存在")

    progress_map = {"queued": 10, "processing": 70, "completed": 100, "failed": 0}

    return ApiResponse(
        success=True,
        data=DocumentStatusResponse(
            status=document.status,
            progress=progress_map.get(document.status, 0),
            message=f"文档状态: {document.status}",
        ),
    )


@router.post("/{document_id}/retry", response_model=ApiResponse)
async def retry_document_ingest(document_id: str, db: Session = Depends(get_db)):
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="文档不存在")
    # 业务规则：归档文档不可重新索引。
    if document.archived:
        raise HTTPException(status_code=400, detail="归档文档不可重新索引，请先取消归档")

    try:
        job = ingest_queue_service.retry_document_job(db, document_id)
    except ValueError as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    db.commit()
    db.refresh(document)
    db.refresh(job)

    return ApiResponse(
        success=True,
        data={"document": _serialize_document(document, job), "ingest_job": ingest_queue_service.serialize_job(job)},
        message="任务已重新入队",
    )


@router.delete("/{document_id}", response_model=ApiResponse)
async def delete_document(document_id: str, db: Session = Depends(get_db)):
    try:
        await document_service.delete_document_and_artifacts(db=db, document_id=document_id)
    except DocumentNotFoundError:
        raise HTTPException(status_code=404, detail="文档不存在") from None
    except DocumentDeletionError as exc:
        raise HTTPException(status_code=500, detail=f"删除文档失败: {exc}") from exc

    return ApiResponse(success=True, message="文档及关联数据已删除")

