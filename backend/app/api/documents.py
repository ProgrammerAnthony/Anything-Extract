"""文档管理 API"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional
import os
import shutil
import json
from pathlib import Path
import traceback

from core.database import get_db, Document, KnowledgeBase, SessionLocal, ExtractionResult, DocumentVector
from core.config import settings
from app.models.schemas import (
    DocumentResponse,
    DocumentStatusResponse,
    ApiResponse
)
from services.document_service import DocumentService
from services.embedding_service import EmbeddingService
from providers.vector_db.lancedb import LanceDBProvider
from utils.logging import document_logger, debug_logger
import asyncio

router = APIRouter()

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
            f"MIME mismatch for file upload: {file.filename}, extension={file_extension}, content_type={content_type}"
        )

    return file_extension


@router.post("/upload", response_model=ApiResponse)
async def upload_document(
    file: UploadFile = File(...),
    knowledge_base_id: str = Form(...),
    db: Session = Depends(get_db)
):
    """上传文档"""
    # 验证知识库存在
    kb = db.query(KnowledgeBase).filter(KnowledgeBase.id == knowledge_base_id).first()
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")
    
    # Stage 1: validate and normalize upload extension
    file_type = _resolve_upload_file_type(file)

    # Save file
    upload_path = Path(settings.uploads_path)
    upload_path.mkdir(parents=True, exist_ok=True)
    
    file_path = upload_path / file.filename
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Create document record
    document_logger.info(f"开始上传文档: {file.filename}, 知识库ID: {knowledge_base_id}")
    document = Document(
        knowledge_base_id=knowledge_base_id,
        filename=file.filename,
        file_type=file_type,
        file_path=str(file_path),
        json_path="",  # 将在处理完成后更新
        status="processing"
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    document_logger.info(f"文档记录已创建: {document.id}, 文件名: {file.filename}, 状态: processing")
    
    # 异步处理文档
    async def process_document_task():
        db_session = SessionLocal()
        try:
            # 重新获取文档对象（在新会话中）
            doc = db_session.query(Document).filter(Document.id == document.id).first()
            if not doc:
                document_logger.error(f"文档不存在: {document.id}")
                return
            
            document_logger.info(f"开始处理文档任务: {doc.filename} (ID: {doc.id})")
            
            doc_service = DocumentService()
            embedding_service = EmbeddingService()
            
            # 处理文档
            document_logger.info(f"步骤1/3: 解析和分块文档: {doc.filename}")
            result = await doc_service.process_document(doc.file_path, file_type)
            
            # 更新文档记录
            doc.json_path = result["json_path"]
            doc.document_metadata = json.dumps(result["document"].get("metadata", {}))
            db_session.commit()
            document_logger.info(f"步骤2/3: 文档解析完成，保存JSON: {doc.json_path}")
            
            # 提取所有chunks用于向量化（包含页面信息）
            all_chunks_data = []
            for page in result["document"]["pages"]:
                for chunk_data in page["chunks"]:
                    all_chunks_data.append({
                        "chunk_id": chunk_data["chunk_id"],
                        "content": chunk_data["content"],
                        "page_number": chunk_data["page_number"],
                        "chunk_index": chunk_data["chunk_index"]
                    })
            
            # 向量化
            document_logger.info(f"步骤3/3: 开始向量化，chunks数量: {len(all_chunks_data)}")
            await embedding_service.embed_document(
                document_id=doc.id,
                chunks_data=all_chunks_data,
                metadata={"document_id": doc.id}
            )
            
            doc.status = "completed"
            db_session.commit()
            document_logger.info(f"文档处理成功: {doc.filename} (ID: {doc.id})")
        except Exception as e:
            error_msg = f"文档处理失败: {str(e)}\n{traceback.format_exc()}"
            document_logger.error(error_msg)
            debug_logger.error(error_msg)
            
            # 更新文档状态为失败
            try:
                doc = db_session.query(Document).filter(Document.id == document.id).first()
                if doc:
                    doc.status = "failed"
                    db_session.commit()
            except Exception as db_error:
                document_logger.error(f"更新文档状态失败: {db_error}")
        finally:
            db_session.close()
    
    # 启动后台任务
    asyncio.create_task(process_document_task())
    
    doc_dict = {
        "id": document.id,
        "filename": document.filename,
        "file_type": document.file_type,
        "status": document.status,
        "metadata": None,
        "created_at": document.created_at.isoformat() if hasattr(document.created_at, 'isoformat') else str(document.created_at),
        "updated_at": document.updated_at.isoformat() if hasattr(document.updated_at, 'isoformat') else str(document.updated_at)
    }
    
    document_logger.info(f"文档上传接口返回成功，文档ID: {document.id}, 文件名: {document.filename}, 状态: {document.status}")
    
    return ApiResponse(
        success=True,
        data={"document": doc_dict},
        message="文档上传成功，正在后台处理"
    )


@router.get("", response_model=ApiResponse)
async def get_documents(
    page: int = 1,
    page_size: int = 20,
    status: Optional[str] = None,
    knowledge_base_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """获取文档列表"""
    query = db.query(Document)
    
    if knowledge_base_id:
        query = query.filter(Document.knowledge_base_id == knowledge_base_id)
    
    if status:
        query = query.filter(Document.status == status)
    
    total = query.count()
    documents = query.offset((page - 1) * page_size).limit(page_size).all()
    
    import json
    docs_list = []
    for doc in documents:
        docs_list.append({
            "id": doc.id,
            "filename": doc.filename,
            "file_type": doc.file_type,
            "status": doc.status,
            "metadata": json.loads(doc.document_metadata) if doc.document_metadata else None,
            "created_at": doc.created_at.isoformat() if hasattr(doc.created_at, 'isoformat') else str(doc.created_at),
            "updated_at": doc.updated_at.isoformat() if hasattr(doc.updated_at, 'isoformat') else str(doc.updated_at)
        })
    
    return ApiResponse(
        success=True,
        data={
            "documents": docs_list,
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": total,
                "total_pages": (total + page_size - 1) // page_size
            }
        }
    )


@router.get("/{document_id}", response_model=ApiResponse)
async def get_document(document_id: str, db: Session = Depends(get_db)):
    """获取文档详情，包含历史提取结果"""
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="文档不存在")
    
    import json
    metadata = json.loads(document.document_metadata) if document.document_metadata else None
    
    # 获取历史提取结果
    extraction_results = db.query(ExtractionResult).filter(
        ExtractionResult.document_id == document_id
    ).order_by(ExtractionResult.created_at.desc()).all()
    
    # 按标签组织提取结果
    extraction_history = {}
    for er in extraction_results:
        tag_id = er.tag_config_id
        if tag_id not in extraction_history:
            extraction_history[tag_id] = {
                "tag_config_id": tag_id,
                "latest_result": None,
                "all_results": []
            }
        
        result_data = {
            "id": er.id,
            "result": json.loads(er.result) if er.result else {},
            "retrieval_results": json.loads(er.retrieval_results) if er.retrieval_results else [],
            "prompt": er.prompt,
            "llm_response": er.llm_response,
            "parsed_result": json.loads(er.parsed_result) if er.parsed_result else {},
            "extraction_time": json.loads(er.extraction_time) if er.extraction_time else {},
            "created_at": er.created_at.isoformat() if hasattr(er.created_at, 'isoformat') else str(er.created_at)
        }
        
        extraction_history[tag_id]["all_results"].append(result_data)
        if extraction_history[tag_id]["latest_result"] is None:
            extraction_history[tag_id]["latest_result"] = result_data
    
    # 检查是否有提取结果，标记文档状态
    has_extraction = len(extraction_history) > 0
    
    doc_dict = {
        "id": document.id,
        "filename": document.filename,
        "file_type": document.file_type,
        "status": document.status,
        "metadata": metadata,
        "has_extraction": has_extraction,
        "extraction_history": extraction_history,
        "created_at": document.created_at.isoformat() if hasattr(document.created_at, 'isoformat') else str(document.created_at),
        "updated_at": document.updated_at.isoformat() if hasattr(document.updated_at, 'isoformat') else str(document.updated_at)
    }
    
    return ApiResponse(
        success=True,
        data={"document": doc_dict}
    )


@router.get("/{document_id}/status", response_model=ApiResponse)
async def get_document_status(document_id: str, db: Session = Depends(get_db)):
    """获取文档处理状态"""
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="文档不存在")
    
    progress = 100 if document.status == "completed" else 50 if document.status == "processing" else 0
    
    return ApiResponse(
        success=True,
        data=DocumentStatusResponse(
            status=document.status,
            progress=progress,
            message=f"文档状态: {document.status}"
        )
    )


@router.delete("/{document_id}", response_model=ApiResponse)
async def delete_document(document_id: str, db: Session = Depends(get_db)):
    """删除文档及其所有关联数据"""
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="文档不存在")
    
    document_logger.info(f"开始删除文档: {document.filename} (ID: {document_id})")
    
    try:
        # 1. 删除向量数据库中的向量
        try:
            vector_db = LanceDBProvider(settings.lance_db_path)
            await vector_db.delete_by_document_id(document_id)
            document_logger.info(f"已删除向量数据库中的向量: {document_id}")
        except Exception as e:
            document_logger.warning(f"删除向量数据失败: {str(e)}")
            debug_logger.warning(f"删除向量数据失败: {str(e)}\n{traceback.format_exc()}")
        
        # 2. 删除数据库中的向量记录
        db.query(DocumentVector).filter(DocumentVector.document_id == document_id).delete()
        document_logger.info(f"已删除数据库中的向量记录: {document_id}")
        
        # 3. 删除提取结果（由于设置了cascade，应该会自动删除，但显式删除更安全）
        db.query(ExtractionResult).filter(ExtractionResult.document_id == document_id).delete()
        document_logger.info(f"已删除提取结果: {document_id}")
        
        # 4. 删除文件
        if os.path.exists(document.file_path):
            os.remove(document.file_path)
            document_logger.info(f"已删除原始文件: {document.file_path}")
        if document.json_path and os.path.exists(document.json_path):
            os.remove(document.json_path)
            document_logger.info(f"已删除JSON文件: {document.json_path}")
        
        # 5. 删除文档记录
        db.delete(document)
        db.commit()
        
        document_logger.info(f"文档删除成功: {document.filename} (ID: {document_id})")
        
        return ApiResponse(
            success=True,
            message="文档及其所有关联数据已删除"
        )
    except Exception as e:
        db.rollback()
        error_msg = f"删除文档失败: {str(e)}\n{traceback.format_exc()}"
        document_logger.error(error_msg)
        debug_logger.error(error_msg)
        raise HTTPException(status_code=500, detail=f"删除文档失败: {str(e)}")

