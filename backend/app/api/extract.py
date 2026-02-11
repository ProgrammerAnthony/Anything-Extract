"""信息提取 API"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import time
import traceback

from core.database import get_db, TagConfig, Document, ExtractionResult
from app.models.schemas import (
    ExtractionRequest,
    ExtractionResult,
    MultiTagExtractionRequest,
    BatchExtractionRequest,
    BatchExtractionResponse,
    ApiResponse
)
from services.extraction_service import ExtractionService
from utils.logging import extract_logger, debug_logger

router = APIRouter()


@router.post("", response_model=ApiResponse)
async def extract(
    request: ExtractionRequest,
    db: Session = Depends(get_db)
):
    """执行信息提取（统一使用多标签提取逻辑）"""
    # 将单标签提取请求转换为多标签提取
    multi_request = MultiTagExtractionRequest(
        tag_config_ids=[request.tag_config_id],
        document_id=request.document_id,
        retrieval_method=request.retrieval_method,
        top_k=request.top_k,
        rerank=request.rerank
    )
    
    # 调用多标签提取接口
    return await multi_tag_extract(multi_request, db)


@router.post("/multi-tags", response_model=ApiResponse)
async def multi_tag_extract(
    request: MultiTagExtractionRequest,
    db: Session = Depends(get_db)
):
    """多标签提取"""
    # 验证请求参数
    if not request.tag_config_ids or len(request.tag_config_ids) == 0:
        raise HTTPException(status_code=400, detail="至少需要选择一个标签配置")
    
    # 验证标签配置
    tag_configs = db.query(TagConfig).filter(TagConfig.id.in_(request.tag_config_ids)).all()
    if len(tag_configs) != len(request.tag_config_ids):
        found_ids = {tc.id for tc in tag_configs}
        missing_ids = set(request.tag_config_ids) - found_ids
        raise HTTPException(status_code=404, detail=f"部分标签配置不存在: {missing_ids}")
    
    # 验证文档
    document = db.query(Document).filter(Document.id == request.document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="文档不存在")
    
    if document.status != "completed":
        raise HTTPException(status_code=400, detail="文档尚未处理完成")
    
    # 执行多标签提取
    start_time = time.time()
    extraction_service = ExtractionService(db)
    
    try:
        tag_names = [tc.name for tc in tag_configs]
        extract_logger.info(f"开始多标签提取，标签: {tag_names}, 文档ID: {request.document_id}, 标签数量: {len(tag_configs)}")
        
        result = await extraction_service.extract_multiple_tags(
            tag_configs=tag_configs,
            document=document,
            retrieval_method=request.retrieval_method,
            top_k=request.top_k,
            rerank=request.rerank
        )
        
        extraction_time = time.time() - start_time
        
        # 确保返回的数据结构正确
        if not isinstance(result, dict) or "result" not in result:
            error_msg = f"提取服务返回的数据格式不正确: {type(result)}, keys: {result.keys() if isinstance(result, dict) else 'N/A'}"
            extract_logger.error(error_msg)
            raise ValueError(error_msg)
        
        extract_logger.info(f"多标签提取成功，耗时: {extraction_time:.2f}秒")
        
        # 构建响应，包含每个标签的详细信息
        response_data = {
            "result": result["result"],
            "sources": result.get("sources", []),
            "tag_results": result.get("tag_results", {}),
            "extraction_time": extraction_time,
            "detailed_time": result.get("extraction_time", {})
        }
        
        return ApiResponse(
            success=True,
            data=response_data
        )
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"多标签提取失败: {str(e)}\n{traceback.format_exc()}"
        extract_logger.error(error_msg)
        debug_logger.error(error_msg)
        print(f"ERROR: {error_msg}")  # 确保控制台也输出
        raise HTTPException(status_code=500, detail=f"提取失败: {str(e)}")


@router.post("/batch", response_model=ApiResponse)
async def batch_extract(
    request: BatchExtractionRequest,
    db: Session = Depends(get_db)
):
    """批量提取（统一使用多标签提取逻辑）"""
    # 验证标签配置
    tag_config = db.query(TagConfig).filter(TagConfig.id == request.tag_config_id).first()
    if not tag_config:
        raise HTTPException(status_code=404, detail="标签配置不存在")
    
    # 验证文档
    documents = db.query(Document).filter(Document.id.in_(request.document_ids)).all()
    if len(documents) != len(request.document_ids):
        raise HTTPException(status_code=404, detail="部分文档不存在")
    
    # 执行批量提取
    extraction_service = ExtractionService(db)
    results = []
    
    for document in documents:
        if document.status != "completed":
            continue
        
        try:
            # 使用多标签提取逻辑（单个标签）
            result = await extraction_service.extract_multiple_tags(
                tag_configs=[tag_config],
                document=document,
                retrieval_method=request.retrieval_method,
                top_k=request.top_k,
                rerank=False
            )
            
            # 从多标签结果中提取单个标签的结果
            tag_result = result.get("tag_results", {}).get(tag_config.id, {})
            results.append({
                "document_id": document.id,
                "result": {tag_config.name: tag_result.get("result")},
                "sources": tag_result.get("sources", [])
            })
        except Exception as e:
            results.append({
                "document_id": document.id,
                "result": {},
                "sources": [],
                "error": str(e)
            })
    
    return ApiResponse(
        success=True,
        data={"results": results}
    )

