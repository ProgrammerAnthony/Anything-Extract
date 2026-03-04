"""文档索引执行服务。"""
from __future__ import annotations

import json
from typing import Any, Dict

from sqlalchemy.orm import Session

from core.database import Document
from core.indexing_runner import IndexingRunner
from services.document_service import DocumentService
from utils.logging import document_logger


class DocumentIngestService:
    """执行文档解析与索引。"""

    def __init__(self):
        self.document_service = DocumentService()
        self.indexing_runner = IndexingRunner()

    async def ingest_document(self, db: Session, document: Document) -> Dict[str, Any]:
        # 保留原有 JSON 产物，兼容旧页面与历史调试入口
        parsed_result = await self.document_service.process_document(document.file_path, document.file_type)
        document.json_path = parsed_result["json_path"]
        document.document_metadata = json.dumps(parsed_result["document"].get("metadata", {}), ensure_ascii=False)

        # 按统一四阶段流程执行索引
        summary = await self.indexing_runner.run(db=db, document=document)
        document_logger.info(
            "文档索引完成: document_id=%s, segments=%s, tokens=%s",
            document.id,
            summary.total_segments,
            summary.tokens,
        )

        db.flush()
        return {
            "json_path": parsed_result["json_path"],
            "document": parsed_result["document"],
            "indexing": {
                "total_segments": summary.total_segments,
                "tokens": summary.tokens,
                "word_count": summary.word_count,
            },
        }

