"""Embedding Provider 基类"""
from abc import ABC, abstractmethod
from typing import List


class EmbeddingProvider(ABC):
    """Embedding Provider 抽象基类"""
    
    @abstractmethod
    async def embed(self, texts: List[str]) -> List[List[float]]:
        """生成向量"""
        pass

