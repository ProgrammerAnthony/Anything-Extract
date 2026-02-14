"""知识库管理 API"""
from __future__ import annotations

import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.models.schemas import ApiResponse
from core.database import Document, DocumentIngestJob, KnowledgeBase, get_db
from services.ingest_queue_service import IngestQueueService

router = APIRouter()
ingest_queue_service = IngestQueueService()


class KnowledgeBaseCreate(BaseModel):
    name: str


class KnowledgeBaseUpdate(BaseModel):
    name: Optional[str] = None


@router.get("", response_model=ApiResponse)
async def get_knowledge_bases(
    search: Optional[str] = Query(None, description="搜索关键词"),
    db: Session = Depends(get_db),
):
    query = db.query(KnowledgeBase)
    if search:
        query = query.filter(KnowledgeBase.name.contains(search))

    knowledge_bases = query.order_by(KnowledgeBase.created_at.desc()).all()
    kb_list = [
        {
            "id": kb.id,
            "name": kb.name,
            "is_default": kb.is_default,
            "created_at": kb.created_at,
            "updated_at": kb.updated_at,
        }
        for kb in knowledge_bases
    ]

    return ApiResponse(success=True, data={"knowledge_bases": kb_list})


@router.get("/{kb_id}", response_model=ApiResponse)
async def get_knowledge_base(kb_id: str, db: Session = Depends(get_db)):
    kb = db.query(KnowledgeBase).filter(KnowledgeBase.id == kb_id).first()
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")

    return ApiResponse(
        success=True,
        data={
            "knowledge_base": {
                "id": kb.id,
                "name": kb.name,
                "is_default": kb.is_default,
                "created_at": kb.created_at,
                "updated_at": kb.updated_at,
            }
        },
    )


@router.post("", response_model=ApiResponse)
async def create_knowledge_base(kb_data: KnowledgeBaseCreate, db: Session = Depends(get_db)):
    existing = db.query(KnowledgeBase).filter(KnowledgeBase.name == kb_data.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="知识库名称已存在")

    kb = KnowledgeBase(name=kb_data.name, is_default=db.query(KnowledgeBase).count() == 0)
    db.add(kb)
    db.commit()
    db.refresh(kb)

    return ApiResponse(
        success=True,
        data={
            "knowledge_base": {
                "id": kb.id,
                "name": kb.name,
                "is_default": kb.is_default,
                "created_at": kb.created_at,
                "updated_at": kb.updated_at,
            }
        },
        message="知识库创建成功",
    )


@router.put("/{kb_id}", response_model=ApiResponse)
async def update_knowledge_base(
    kb_id: str,
    kb_data: KnowledgeBaseUpdate,
    db: Session = Depends(get_db),
):
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

    db.commit()
    db.refresh(kb)

    return ApiResponse(
        success=True,
        data={
            "knowledge_base": {
                "id": kb.id,
                "name": kb.name,
                "is_default": kb.is_default,
                "created_at": kb.created_at,
                "updated_at": kb.updated_at,
            }
        },
        message="知识库更新成功",
    )


@router.delete("/{kb_id}", response_model=ApiResponse)
async def delete_knowledge_base(kb_id: str, db: Session = Depends(get_db)):
    kb = db.query(KnowledgeBase).filter(KnowledgeBase.id == kb_id).first()
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")

    if db.query(KnowledgeBase).count() == 1:
        raise HTTPException(status_code=400, detail="不能删除最后一个知识库")

    doc_count = db.query(Document).filter(Document.knowledge_base_id == kb_id).count()
    if doc_count > 0:
        raise HTTPException(status_code=400, detail=f"知识库中还有 {doc_count} 个文档，请先删除文档")

    db.delete(kb)
    db.commit()

    return ApiResponse(success=True, message="知识库已删除")


@router.get("/{kb_id}/documents", response_model=ApiResponse)
async def get_knowledge_base_documents(
    kb_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    kb = db.query(KnowledgeBase).filter(KnowledgeBase.id == kb_id).first()
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")

    query = db.query(Document).filter(Document.knowledge_base_id == kb_id)
    if status:
        query = query.filter(Document.status == status)

    total = query.count()
    documents = query.order_by(Document.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    document_ids = [doc.id for doc in documents]
    jobs_map = {}
    if document_ids:
        jobs = db.query(DocumentIngestJob).filter(DocumentIngestJob.document_id.in_(document_ids)).all()
        jobs_map = {job.document_id: job for job in jobs}

    docs_list = []
    for doc in documents:
        docs_list.append(
            {
                "id": doc.id,
                "filename": doc.filename,
                "file_type": doc.file_type,
                "status": doc.status,
                "metadata": json.loads(doc.document_metadata) if doc.document_metadata else None,
                "created_at": doc.created_at.isoformat() if hasattr(doc.created_at, "isoformat") else str(doc.created_at),
                "updated_at": doc.updated_at.isoformat() if hasattr(doc.updated_at, "isoformat") else str(doc.updated_at),
                "ingest_job": ingest_queue_service.serialize_job(jobs_map.get(doc.id)),
            }
        )

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
