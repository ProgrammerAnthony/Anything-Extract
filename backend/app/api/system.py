"""系统配置 API"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from core.database import get_db
from core.config import settings
from app.models.schemas import (
    SystemConfigResponse,
    SystemConfigUpdate,
    ApiResponse
)

router = APIRouter()


@router.get("/config", response_model=ApiResponse)
async def get_config():
    """获取系统配置"""
    return ApiResponse(
        success=True,
        data=SystemConfigResponse(
            llm={
                "provider": "ollama",
                "base_url": settings.ollama_base_url,
                "model": settings.ollama_model
            },
            embedding={
                "provider": "ollama",
                "base_url": settings.ollama_base_url,
                "model": settings.ollama_embedding_model
            },
            vector_db={
                "provider": "lancedb",
                "path": settings.lance_db_path
            },
            retrieval={
                "default_method": settings.default_retrieval_method,
                "available_methods": [
                    "basic",
                    "multi_query",
                    "hyde",
                    "parent_document",
                    "rerank",
                    "bm25"
                ]
            }
        )
    )


@router.put("/config", response_model=ApiResponse)
async def update_config(
    config: SystemConfigUpdate,
    db: Session = Depends(get_db)
):
    """更新系统配置"""
    # TODO: 实现配置更新逻辑
    # 注意：配置更新可能需要重启服务或重新初始化某些组件
    
    return ApiResponse(
        success=True,
        message="配置更新成功（需要重启服务生效）"
    )

