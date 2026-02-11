"""Ollama Embedding Provider"""
from typing import List, Optional
import ollama

from providers.embedding.base import EmbeddingProvider
from providers.embedding.model_dimensions import get_embedding_dimension
from core.config import settings
from utils.logging import embed_logger


class OllamaEmbeddingProvider(EmbeddingProvider):
    """Ollama Embedding Provider"""
    
    def __init__(self, base_url: str, model: str):
        self.base_url = base_url
        self.model = model
        self.client = ollama.Client(host=base_url)
        self.batch_size = settings.ollama_embedding_batch_size
        self._dimension: Optional[int] = None
    
    def get_dimension(self) -> Optional[int]:
        """获取 embedding 维度"""
        if self._dimension is None:
            # 先从映射表获取
            self._dimension = get_embedding_dimension(self.model)
            
            # 如果映射表中没有，尝试从实际模型获取
            if self._dimension is None:
                try:
                    # 生成一个测试向量来获取维度
                    response = self.client.embeddings(
                        model=self.model,
                        prompt="test"
                    )
                    self._dimension = len(response["embedding"])
                    embed_logger.info(f"从实际模型获取维度: {self._dimension}, 模型: {self.model}")
                except Exception as e:
                    embed_logger.warning(f"无法获取模型维度: {e}, 模型: {self.model}")
        
        return self._dimension
    
    async def embed(self, texts: List[str]) -> List[List[float]]:
        """生成向量"""
        embeddings = []
        
        # 批量处理
        for i in range(0, len(texts), self.batch_size):
            batch = texts[i:i + self.batch_size]
            for text in batch:
                response = self.client.embeddings(
                    model=self.model,
                    prompt=text
                )
                embeddings.append(response["embedding"])
        
        # 记录维度（首次）
        if self._dimension is None and embeddings:
            self._dimension = len(embeddings[0])
            embed_logger.info(f"Embedding 模型维度: {self._dimension}, 模型: {self.model}")
        
        return embeddings

