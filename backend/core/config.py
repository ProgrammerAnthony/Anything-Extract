"""配置管理模块"""
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """应用配置"""
    
    # LLM 配置
    ollama_base_url: str = "http://localhost:11434"
    # 轻量级 LLM 模型（适合 CPU 部署）
    # 推荐选项：phi3:mini (3.8B, 推荐), llama3.2:1b (1B, 超轻量), qwen2:0.5b (0.5B, 极轻量)
    ollama_model: str = "qwen2:0.5b"
    # 轻量级 Embedding 模型（适合 CPU 部署）
    # 推荐选项：nomic-embed-text (274MB, 推荐), all-minilm (22MB, 超轻量), bge-small (33MB)
    ollama_embedding_model: str = "nomic-embed-text"
    ollama_embedding_batch_size: int = 1
    
    # 向量数据库
    lance_db_path: str = "./storage/lancedb"
    
    # 应用配置
    api_host: str = "0.0.0.0"
    api_port: int = 8888
    frontend_url: str = "http://localhost:3001"
    debug: bool = False
    
    # 数据库
    database_url: str = "sqlite:///./storage/database.db"
    
    # 存储路径
    storage_path: str = "./storage"
    documents_path: str = "./storage/documents"
    uploads_path: str = "./storage/uploads"
    vector_cache_path: str = "./storage/vector-cache"
    
    # 检索配置
    default_retrieval_method: str = "basic"
    default_top_k: int = 5
    enable_rerank: bool = False
    
    # 文本分割
    chunk_size: int = 1000
    chunk_overlap: int = 200
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


settings = Settings()

