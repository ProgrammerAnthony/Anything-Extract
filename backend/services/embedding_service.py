"""向量化服务"""
from typing import List, Dict, Any
import json
from pathlib import Path
import hashlib
import time

from core.config import settings
from providers.embedding.ollama import OllamaEmbeddingProvider
from providers.vector_db.lancedb import LanceDBProvider
from utils.logging import embed_logger


class EmbeddingService:
    """向量化服务"""
    
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
    
    async def embed_document(
        self,
        document_id: str,
        chunks_data: List[Dict[str, Any]],
        metadata: Dict[str, Any]
    ):
        """向量化文档
        
        Args:
            document_id: 文档ID
            chunks_data: chunks数据列表，每个元素包含:
                - chunk_id: chunk唯一标识
                - content: chunk文本内容
                - page_number: 页码
                - chunk_index: chunk在页面中的索引
            metadata: 额外的元数据
        """
        start_time = time.time()
        embed_logger.info(f"开始向量化文档: {document_id}, chunks数量: {len(chunks_data)}")
        
        # 提取所有chunk内容用于向量化
        chunk_contents = [chunk["content"] for chunk in chunks_data]
        
        # 检查缓存
        cache_key = self._get_cache_key(chunk_contents)
        cached_vectors = self._load_cache(cache_key)
        
        if cached_vectors:
            embed_logger.info(f"使用缓存向量，文档: {document_id}")
            vectors = cached_vectors
        else:
            # 生成向量
            embed_start = time.time()
            vectors = await self.embedding_provider.embed(chunk_contents)
            embed_time = time.time() - embed_start
            embed_logger.info(f"向量生成完成，耗时: {embed_time:.2f}秒，文档: {document_id}")
            # 保存缓存
            self._save_cache(cache_key, vectors)
        
        # 确保向量维度已获取（从实际向量中）
        if vectors:
            actual_dim = len(vectors[0])
            # 更新 embedding provider 的维度
            if self.embedding_provider._dimension is None:
                self.embedding_provider._dimension = actual_dim
            # 确保向量数据库使用正确的维度
            if self.vector_db.expected_dimension != actual_dim:
                embed_logger.warning(
                    f"向量维度不匹配，更新向量数据库维度: "
                    f"{self.vector_db.expected_dimension} -> {actual_dim}"
                )
                self.vector_db.expected_dimension = actual_dim
                # 重建表以匹配新维度
                self.vector_db._ensure_table(dimension=actual_dim)
        
        # 准备元数据（包含页面信息）
        vectors_metadata = []
        texts = []
        for i, chunk_data in enumerate(chunks_data):
            vectors_metadata.append({
                "document_id": document_id,
                "chunk_id": chunk_data["chunk_id"],
                "chunk_index": chunk_data["chunk_index"],
                "page_number": chunk_data["page_number"],
                **metadata
            })
            texts.append(chunk_data["content"])
        
        # 存储到向量数据库
        store_start = time.time()
        await self.vector_db.add_documents(
            vectors=vectors,
            texts=texts,
            metadata=vectors_metadata
        )
        store_time = time.time() - store_start
        total_time = time.time() - start_time
        embed_logger.info(f"向量存储完成，耗时: {store_time:.2f}秒，总耗时: {total_time:.2f}秒，文档: {document_id}")
    
    def _get_cache_key(self, chunks: List[str]) -> str:
        """生成缓存键"""
        content = "".join(chunks)
        return hashlib.sha256(content.encode()).hexdigest()
    
    def _load_cache(self, cache_key: str) -> List[List[float]]:
        """加载向量缓存"""
        cache_path = Path(settings.vector_cache_path) / f"{cache_key}.json"
        if cache_path.exists():
            with open(cache_path, "r") as f:
                return json.load(f)
        return None
    
    def _save_cache(self, cache_key: str, vectors: List[List[float]]):
        """保存向量缓存"""
        cache_path = Path(settings.vector_cache_path)
        cache_path.mkdir(parents=True, exist_ok=True)
        
        with open(cache_path / f"{cache_key}.json", "w") as f:
            json.dump(vectors, f)

