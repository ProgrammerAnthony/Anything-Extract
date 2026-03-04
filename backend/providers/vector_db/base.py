"""向量数据库抽象接口。"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Optional


class VectorDBProvider(ABC):
    """向量数据库 Provider 抽象基类。"""

    @abstractmethod
    async def add_documents(
        self,
        vectors: list[list[float]],
        texts: list[str],
        metadata: list[dict[str, Any]],
    ):
        """写入向量与文本。"""

    @abstractmethod
    async def search(
        self,
        query_vector: list[float],
        top_k: int = 5,
        filter: Optional[dict[str, Any]] = None,
    ) -> list[dict[str, Any]]:
        """向量相似度检索。"""

    @abstractmethod
    async def search_by_full_text(
        self,
        query: str,
        top_k: int = 5,
        filter: Optional[dict[str, Any]] = None,
    ) -> list[dict[str, Any]]:
        """全文检索。"""

    @abstractmethod
    async def delete_by_document_id(self, document_id: str):
        """按 document_id 删除。"""
