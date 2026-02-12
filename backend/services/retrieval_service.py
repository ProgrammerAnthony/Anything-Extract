"""检索服务"""
from typing import List, Dict, Any
import time
# TODO: 以下导入将在实现高级检索功能时使用
# 在新版本 langchain 中，这些类可能需要从不同的包导入
# from langchain.retrievers import (
#     MultiQueryRetriever,
#     ContextualCompressionRetriever,
# )
# from langchain.retrievers.document_compressors import DocumentCompressorPipeline
# from langchain_community.retrievers import BM25Retriever

from providers.vector_db.lancedb import LanceDBProvider
from providers.embedding.ollama import OllamaEmbeddingProvider
from core.config import settings
from utils.logging import retrieval_logger


class RetrievalService:
    """检索服务"""

    SUPPORTED_METHODS = {"basic"}
    
    def __init__(self):
        self.embedding_provider = OllamaEmbeddingProvider(
            base_url=settings.ollama_base_url,
            model=settings.ollama_embedding_model
        )
        # 获取 embedding 维度并传递给向量数据库
        # 维度会在首次使用时自动获取，这里先尝试从映射表获取
        embedding_dim = self.embedding_provider.get_dimension()
        
        self.vector_db = LanceDBProvider(
            settings.lance_db_path,
            expected_dimension=embedding_dim
        )
    
    async def retrieve(
        self,
        query: str,
        document_id: str = None,
        method: str = "basic",
        top_k: int = 5,
        rerank: bool = False
    ) -> List[Dict[str, Any]]:
        """执行检索"""
        start_time = time.time()
        if method not in self.SUPPORTED_METHODS:
            retrieval_logger.warning(f"检索方法 {method} 不支持，自动回退到 basic")
            method = "basic"

        retrieval_logger.info(f"开始检索，查询: {query[:50]}..., 方法: {method}, top_k: {top_k}, 文档ID: {document_id}")
        
        result = None
        if method == "basic":
            result = await self._basic_retrieval(query, document_id, top_k)
        else:
            result = await self._basic_retrieval(query, document_id, top_k)
        
        total_time = time.time() - start_time
        retrieval_logger.info(f"检索完成，耗时: {total_time:.2f}秒，结果数: {len(result) if result else 0}")
        return result
    
    async def _basic_retrieval(
        self,
        query: str,
        document_id: str,
        top_k: int
    ) -> List[Dict[str, Any]]:
        """基础向量检索"""
        # 生成查询向量
        embed_start = time.time()
        query_vector = await self.embedding_provider.embed([query])
        embed_time = time.time() - embed_start
        retrieval_logger.info(f"查询向量生成完成，耗时: {embed_time:.2f}秒")
        
        # 向量检索
        search_start = time.time()
        results = await self.vector_db.search(
            query_vector=query_vector[0],
            top_k=top_k,
            filter={"document_id": document_id} if document_id else None
        )
        search_time = time.time() - search_start
        retrieval_logger.info(f"向量搜索完成，耗时: {search_time:.2f}秒，结果数: {len(results)}")
        
        return results
    
