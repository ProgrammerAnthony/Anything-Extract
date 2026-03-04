"""RAG 文档节点模型。"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class DocumentNode:
    """用于索引与检索的统一文档节点。"""

    page_content: str
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def word_count(self) -> int:
        return len((self.page_content or "").split())

    @property
    def tokens(self) -> int:
        return len(self.page_content or "")


@dataclass
class RetrievalDocument:
    """检索返回结构（兼容现有 extraction_service 的字段习惯）。"""

    chunk_id: str
    content: str
    similarity: float
    metadata: dict[str, Any] = field(default_factory=dict)
