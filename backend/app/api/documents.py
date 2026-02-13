"""Document management API."""
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
    DocumentVector,
    ExtractionResult,
    KnowledgeBase,
    SessionLocal,
    get_db,
)
from providers.vector_db.lancedb import LanceDBProvider
from services.document_ingest_service import DocumentIngestService
from services.ingest_queue_service import IngestQueueService
from utils.logging import debug_logger, document_logger

router = APIRouter()
ingest_queue_service = IngestQueueService()

SUPPORTED_UPLOAD_EXTENSIONS = {"pdf", "docx", "txt", "md", "csv", "json", "xlsx", "pptx", "eml"}
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
}


def _resolve_upload_file_type(file: UploadFile) -> str:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")

    file_extension = Path(file.filename).suffix.lower().lstrip(".")
    if file_extension not in SUPPORTED_UPLOAD_EXTENSIONS:
        allowed = ", ".join(sorted(SUPPORTED_UPLOAD_EXTENSIONS))
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {file_extension or 'unknown'}. Supported: {allowed}",
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
        "filename": document.filename,
        "file_type": document.file_type,
        "status": document.status,
        "metadata": metadata,
        "created_at": document.created_at.isoformat() if hasattr(document.created_at, "isoformat") else str(document.created_at),
        "updated_at": document.updated_at.isoformat() if hasattr(document.updated_at, "isoformat") else str(document.updated_at),
        "ingest_job": ingest_queue_service.serialize_job(ingest_job),
    }


async def _process_document_immediate(document_id: str) -> None:
    db_session = SessionLocal()
    try:
        document = db_session.query(Document).filter(Document.id == document_id).first()
        if not document:
            document_logger.error("Document not found for immediate ingest: %s", document_id)
            return

        ingest_service = DocumentIngestService()
        await ingest_service.ingest_document(db_session, document)
        db_session.commit()
        document_logger.info("Immediate ingest completed: %s", document_id)
    except Exception as exc:  # noqa: BLE001
        db_session.rollback()
        error_msg = f"Immediate ingest failed: {exc}\n{traceback.format_exc()}"
        document_logger.error(error_msg)
        debug_logger.error(error_msg)

        try:
            document = db_session.query(Document).filter(Document.id == document_id).first()
            if document:
                document.status = "failed"
                db_session.commit()
        except Exception as mark_exc:  # noqa: BLE001
            document_logger.error("Failed to mark immediate ingest status: %s", mark_exc)
    finally:
        db_session.close()


@router.post("/upload", response_model=ApiResponse)
async def upload_document(
    file: UploadFile = File(...),
    knowledge_base_id: str = Form(...),
    processing_mode: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    kb = db.query(KnowledgeBase).filter(KnowledgeBase.id == knowledge_base_id).first()
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

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
    document = Document(
        knowledge_base_id=knowledge_base_id,
        filename=file.filename,
        file_type=file_type,
        file_path=str(file_path),
        json_path="",
        status=initial_status,
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
        message = "Upload accepted, document is processing in background"
    else:
        message = "Upload accepted, document queued for worker"

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
        raise HTTPException(status_code=404, detail="Document not found")

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
        raise HTTPException(status_code=404, detail="Document not found")

    progress_map = {"queued": 10, "processing": 70, "completed": 100, "failed": 0}

    return ApiResponse(
        success=True,
        data=DocumentStatusResponse(
            status=document.status,
            progress=progress_map.get(document.status, 0),
            message=f"Document status: {document.status}",
        ),
    )


@router.post("/{document_id}/retry", response_model=ApiResponse)
async def retry_document_ingest(document_id: str, db: Session = Depends(get_db)):
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

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
        message="Document job queued for retry",
    )


@router.delete("/{document_id}", response_model=ApiResponse)
async def delete_document(document_id: str, db: Session = Depends(get_db)):
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    try:
        try:
            vector_db = LanceDBProvider(settings.lance_db_path)
            await vector_db.delete_by_document_id(document_id)
        except Exception as exc:  # noqa: BLE001
            document_logger.warning("Failed to delete vectors: %s", exc)
            debug_logger.warning("Failed to delete vectors: %s\n%s", exc, traceback.format_exc())

        db.query(DocumentVector).filter(DocumentVector.document_id == document_id).delete()
        db.query(ExtractionResult).filter(ExtractionResult.document_id == document_id).delete()

        if os.path.exists(document.file_path):
            os.remove(document.file_path)
        if document.json_path and os.path.exists(document.json_path):
            os.remove(document.json_path)

        db.delete(document)
        db.commit()

        return ApiResponse(success=True, message="Document and related data deleted")
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        error_msg = f"Failed to delete document: {exc}\n{traceback.format_exc()}"
        document_logger.error(error_msg)
        debug_logger.error(error_msg)
        raise HTTPException(status_code=500, detail=f"Failed to delete document: {exc}") from exc
