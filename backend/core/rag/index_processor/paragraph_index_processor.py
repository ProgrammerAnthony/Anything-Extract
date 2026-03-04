"""段落索引处理器（简化版）。"""
from __future__ import annotations

from core.rag.models.document import DocumentNode


class ParagraphIndexProcessor:
    """当前仅封装 text_model 的处理入口。"""

    @staticmethod
    def transform(documents: list[DocumentNode]) -> list[DocumentNode]:
        # 当前清洗与切分由 IndexingRunner 负责，这里保留后续扩展入口。
        return documents
