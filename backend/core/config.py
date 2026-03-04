"""应用配置。"""
from __future__ import annotations

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """运行时配置。"""

    # Ollama
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2:3b"
    ollama_embedding_model: str = "nomic-embed-text"
    ollama_embedding_batch_size: int = 1

    # 向量库
    lance_db_path: str = "./storage/lancedb"

    # 服务
    api_host: str = "0.0.0.0"
    api_port: int = 8888
    frontend_url: str = "http://localhost:3001"
    debug: bool = False

    # 数据库
    database_url: str = "sqlite:///./storage/database.db"

    # 文件存储
    storage_path: str = "./storage"
    documents_path: str = "./storage/documents"
    uploads_path: str = "./storage/uploads"
    vector_cache_path: str = "./storage/vector-cache"

    # 检索与索引
    default_retrieval_method: str = "basic"
    default_top_k: int = 5
    enable_rerank: bool = False
    indexing_technique_default: str = "high_quality"  # high_quality | economy
    keyword_store: str = "jieba"
    indexing_dual_write: bool = True

    # 解析器
    enable_ocr_server: bool = False
    enable_pdf_parser_server: bool = False
    ocr_server_url: str = "http://127.0.0.1:7001"
    pdf_parser_server_url: str = "http://127.0.0.1:9009"
    parser_mode: str = "local"  # local | server | hybrid
    qanything_model_source: str = "docker-model"  # docker-model | local-model
    parser_runtime_config_path: str = "./storage/system_runtime_config.json"

    # ingest 队列
    ingest_default_mode: str = "queue"  # queue | immediate
    ingest_queue_poll_interval: float = 1.0
    ingest_job_max_attempts: int = 3
    ingest_job_lock_timeout_seconds: int = 900

    # 文本切分默认参数
    chunk_size: int = 1000
    chunk_overlap: int = 200

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


settings = Settings()
