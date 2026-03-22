"""系统配置 API"""
from fastapi import APIRouter, HTTPException

from core.config import settings
from app.models.schemas import (
    SystemConfigResponse,
    SystemConfigUpdate,
    ApiResponse
)
from app.utils.error_handler import wrap_api_response
from services.runtime_config_service import runtime_config_service

router = APIRouter()


def _build_system_config_response() -> SystemConfigResponse:
    parser_config = runtime_config_service.get_parser_config()

    return SystemConfigResponse(
        llm={
            "provider": "ollama",
            "base_url": settings.ollama_base_url,
            "model": settings.ollama_model,
        },
        embedding={
            "provider": "ollama",
            "base_url": settings.ollama_base_url,
            "model": settings.ollama_embedding_model,
        },
        vector_db={
            "provider": "lancedb",
            "path": settings.lance_db_path,
        },
        retrieval={
            "default_method": settings.default_retrieval_method,
            "available_methods": ["basic"],
        },
        parser={
            "mode": parser_config.get("mode", "local"),
            "available_modes": ["local", "server", "hybrid"],
            "enable_ocr_server": bool(parser_config.get("enable_ocr_server", False)),
            "enable_pdf_parser_server": bool(parser_config.get("enable_pdf_parser_server", False)),
            "ocr_server_url": parser_config.get("ocr_server_url"),
            "pdf_parser_server_url": parser_config.get("pdf_parser_server_url"),
            "model_source": parser_config.get("model_source", "docker-model"),
            "available_model_sources": ["docker-model", "local-model"],
        },
    )


@router.get("/config", response_model=ApiResponse)
@wrap_api_response()
async def get_config():
    """获取系统配置"""
    return _build_system_config_response()


@router.put("/config", response_model=ApiResponse)
@wrap_api_response(message="配置更新成功（解析配置即时生效）")
async def update_config(config: SystemConfigUpdate):
    """更新系统配置"""
    try:
        if config.parser is not None:
            runtime_config_service.update_parser_config(config.parser)
    except ValueError as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return _build_system_config_response()

