"""信息提取流式 API - 实时通知提取过程（统一使用多标签提取逻辑）"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import json
import time
import asyncio

from core.database import get_db, TagConfig, Document
from app.models.schemas import ExtractionRequest, MultiTagExtractionRequest
from services.extraction_service import ExtractionService
from utils.logging import extract_logger

router = APIRouter()


async def extract_with_stream(
    tag_configs: list[TagConfig],
    document: Document,
    extraction_service: ExtractionService,
    retrieval_method: str = "basic",
    top_k: int = 5,
    rerank: bool = False,
    rag_enhancement_enabled: bool = False,
    rag_tag_enhancements: dict | None = None,
):
    """带流式输出的多标签提取过程"""
    start_time = time.time()
    tag_names = [tc.name for tc in tag_configs]
    
    # 发送开始消息
    yield f"data: {json.dumps({'stage': 'start', 'message': f'开始提取 {len(tag_configs)} 个标签', 'tag_names': tag_names, 'timestamp': time.time()})}\n\n"
    extract_logger.info(f"开始流式提取，标签: {tag_names}, 文档: {document.id}")
    
    # 调用多标签提取服务
    try:
        result = await extraction_service.extract_multiple_tags(
            tag_configs=tag_configs,
            document=document,
            retrieval_method=retrieval_method,
            top_k=top_k,
            rerank=rerank,
            rag_enhancement_enabled=rag_enhancement_enabled,
            rag_tag_enhancements=rag_tag_enhancements,
            save_to_db=True
        )
        
        # 构建响应数据
        if len(tag_configs) == 1:
            # 单标签时，保持兼容性
            tag_config = tag_configs[0]
            tag_result = result.get("tag_results", {}).get(tag_config.id, {})
            response_data = {
                "result": {tag_config.name: tag_result.get("result")},
                "sources": tag_result.get("sources", []),
                "tag_id": tag_result.get("tag_id"),
                "tag_name": tag_result.get("tag_name"),
                "retrieval_results": tag_result.get("retrieval_results", []),
                "extraction_time": result.get("extraction_time", {})
            }
        else:
            # 多标签时，返回完整结果
            response_data = {
                "result": result.get("result", {}),
                "sources": result.get("sources", []),
                "tag_results": result.get("tag_results", {}),
                "extraction_time": result.get("extraction_time", {})
            }
        
        # 发送完成消息
        yield f"data: {json.dumps({'stage': 'complete', **response_data, 'timestamp': time.time()})}\n\n"
        extract_logger.info(f"流式提取完成")
        
    except Exception as e:
        error_msg = f"提取失败: {str(e)}"
        extract_logger.error(error_msg)
        yield f"data: {json.dumps({'stage': 'error', 'message': error_msg, 'timestamp': time.time()})}\n\n"


@router.post("/stream")
async def extract_stream(
    request: ExtractionRequest,
    db: Session = Depends(get_db)
):
    """流式信息提取（统一使用多标签提取逻辑）"""
    # 验证标签配置
    tag_config = db.query(TagConfig).filter(TagConfig.id == request.tag_config_id).first()
    if not tag_config:
        raise HTTPException(status_code=404, detail="标签配置不存在")
    
    # 验证文档
    document = db.query(Document).filter(Document.id == request.document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="文档不存在")
    
    if document.status != "completed":
        raise HTTPException(status_code=400, detail="文档尚未处理完成")
    
    # 创建提取服务
    extraction_service = ExtractionService(db)
    
    return StreamingResponse(
        extract_with_stream(
            tag_configs=[tag_config],
            document=document,
            extraction_service=extraction_service,
            retrieval_method=request.retrieval_method,
            top_k=request.top_k,
            rerank=request.rerank,
            rag_enhancement_enabled=request.rag_enhancement_enabled,
            rag_tag_enhancements=request.rag_tag_enhancements,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

