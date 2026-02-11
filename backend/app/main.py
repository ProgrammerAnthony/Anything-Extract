"""FastAPI 应用入口"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import traceback

from core.config import settings
from core.database import init_db
from app.api import tags, documents, extract, system, knowledge_bases, extract_stream
from utils.logging import debug_logger


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时初始化数据库
    init_db()
    yield
    # 关闭时清理资源


app = FastAPI(
    title="AnythingExtract API",
    description="文档结构化提取 API",
    version="0.1.0",
    lifespan=lifespan
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(tags.router, prefix="/api/tags", tags=["标签管理"])
app.include_router(knowledge_bases.router, prefix="/api/knowledge-bases", tags=["知识库管理"])
app.include_router(documents.router, prefix="/api/documents", tags=["文档管理"])
app.include_router(extract.router, prefix="/api/extract", tags=["信息提取"])
app.include_router(extract_stream.router, prefix="/api/extract", tags=["信息提取"])
app.include_router(system.router, prefix="/api/system", tags=["系统配置"])


# 全局异常处理（必须在路由注册之后）
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """全局异常处理器，确保所有错误都被记录"""
    error_msg = f"未处理的异常: {str(exc)}\n{traceback.format_exc()}"
    debug_logger.error(f"请求路径: {request.url.path}\n{error_msg}")
    print(f"ERROR: {error_msg}")  # 确保控制台也输出
    
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": str(exc),
            "detail": error_msg if settings.debug else "内部服务器错误"
        }
    )


@app.get("/")
async def root():
    """根路径"""
    return {"message": "AnythingExtract API", "version": "0.1.0"}


@app.get("/health")
async def health():
    """健康检查"""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.debug
    )

