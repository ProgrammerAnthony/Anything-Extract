"""向量数据库 Provider 基类"""
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional


class VectorDBProvider(ABC):
    """向量数据库 Provider 抽象基类"""
    
    @abstractmethod
    async def add_documents(
        self,
        vectors: List[List[float]],
        texts: List[str],
        metadata: List[Dict[str, Any]]
    ):
        """添加文档向量"""
        pass
    
    @abstractmethod
    async def search(
        self,
        query_vector: List[float],
        top_k: int = 5,
        filter: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """搜索相似向量"""
        pass
    
    @abstractmethod
    async def delete_by_document_id(self, document_id: str):
        """根据文档ID删除所有相关向量"""
        pass

