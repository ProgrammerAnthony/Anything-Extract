"""文档处理与删除等通用服务。"""
from pathlib import Path
from typing import Dict, Any
import json
import os
import time
import traceback

from sqlalchemy.orm import Session

from core.config import settings
from core.database import (
    Document,
    DocumentSegment,
    DocumentVector,
    ExtractionResult,
    KnowledgeBase,
)
from core.rag.datasource.keyword.jieba import JiebaKeywordService
from providers.vector_db.lancedb import LanceDBProvider
from utils.document_parser import DocumentParser
from utils.text_splitter import TextSplitter
from utils.logging import document_logger, debug_logger


class DocumentNotFoundError(Exception):
    """文档不存在。"""


class DocumentDeletionError(Exception):
    """文档删除失败。"""


class DocumentService:
    """文档处理与通用文档相关业务。"""

    def __init__(self):
        self.parser = DocumentParser()
        self.splitter = TextSplitter(
            chunk_size=settings.chunk_size,
            chunk_overlap=settings.chunk_overlap,
        )

    async def process_document(self, file_path: str, file_type: str) -> Dict[str, Any]:
        """处理文档：解析 -> 分块 -> 保存 JSON。"""
        start_time = time.time()
        document_logger.info("开始处理文档: %s, 类型: %s", file_path, file_type)

        # 解析文档
        parse_start = time.time()
        parsed_doc = await self.parser.parse(file_path, file_type)
        parse_time = time.time() - parse_start
        document_logger.info(
            "文档解析完成，耗时: %.2f 秒，页数: %s",
            parse_time,
            len(parsed_doc.get("pages", [])),
        )

        # 按页面分块处理
        split_start = time.time()
        pages_with_chunks = []
        all_chunks = []
        total_word_count = 0

        for page in parsed_doc["pages"]:
            page_number = page["page_number"]
            page_content = page["content"]

            # 对每页内容进行分块
            page_chunks = self.splitter.split_text(page_content)

            # 为每个 chunk 添加页面信息
            page_chunks_with_metadata = []
            for chunk_index, chunk in enumerate(page_chunks):
                chunk_id = f"{parsed_doc['id']}_p{page_number}_c{chunk_index}"
                page_chunks_with_metadata.append(
                    {
                        "chunk_id": chunk_id,
                        "page_number": page_number,
                        "chunk_index": chunk_index,
                        "content": chunk,
                    },
                )
                all_chunks.append(chunk)

            pages_with_chunks.append(
                {
                    "page_number": page_number,
                    "content": page_content,
                    "chunks": page_chunks_with_metadata,
                    "chunk_count": len(page_chunks),
                },
            )

            total_word_count += len(page_content.split())

        # 构建文档 JSON
        doc_json = {
            "id": parsed_doc.get("id"),
            "title": parsed_doc.get("title", Path(file_path).stem),
            "pages": pages_with_chunks,
            "metadata": parsed_doc.get("metadata", {}),
            "word_count": total_word_count,
            "chunk_count": len(all_chunks),
            "page_count": len(pages_with_chunks),
        }

        split_time = time.time() - split_start
        document_logger.info(
            "文档分块完成，耗时: %.2f 秒，总 chunks: %s",
            split_time,
            len(all_chunks),
        )

        # 保存文档 JSON
        save_start = time.time()
        doc_path = Path(settings.documents_path)
        doc_path.mkdir(parents=True, exist_ok=True)

        json_path = doc_path / f"{doc_json['id']}.json"
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(doc_json, f, ensure_ascii=False, indent=2)

        save_time = time.time() - save_start
        total_time = time.time() - start_time
        document_logger.info(
            "文档处理完成，总耗时: %.2f 秒 (解析: %.2f s, 分块: %.2f s, 保存: %.2f s)",
            total_time,
            parse_time,
            split_time,
            save_time,
        )

        return {
            "json_path": str(json_path),
            "document": doc_json,
        }

    async def delete_document_and_artifacts(self, db: Session, document_id: str) -> None:
        """删除文档及其关联产物（向量、关键词、ExtractionResult、物理文件）。

        - 文档不存在时抛出 DocumentNotFoundError
        - 其他异常封装为 DocumentDeletionError，交由 API 层映射为 HTTP 错误
        """
        document = db.query(Document).filter(Document.id == document_id).first()
        if not document:
            raise DocumentNotFoundError(f"document not found: {document_id}")

        try:
            try:
                vector_db = LanceDBProvider(settings.lance_db_path)
                await vector_db.delete_by_document_id(document_id)
            except Exception as exc:  # noqa: BLE001
                document_logger.warning("删除向量失败: %s", exc)
                debug_logger.warning("删除向量失败: %s\n%s", exc, traceback.format_exc())

            try:
                kb = (
                    db.query(KnowledgeBase)
                    .filter(KnowledgeBase.id == document.knowledge_base_id)
                    .first()
                )
                if kb:
                    node_ids = [
                        item.index_node_id
                        for item in db.query(DocumentSegment)
                        .filter(DocumentSegment.document_id == document_id)
                        .all()
                        if item.index_node_id
                    ]
                    if node_ids:
                        JiebaKeywordService(db=db, knowledge_base=kb).delete_by_ids(node_ids)
            except Exception as exc:  # noqa: BLE001
                document_logger.warning("清理关键词倒排失败: %s", exc)

            db.query(DocumentVector).filter(DocumentVector.document_id == document_id).delete()
            db.query(ExtractionResult).filter(ExtractionResult.document_id == document_id).delete()

            if os.path.exists(document.file_path):
                os.remove(document.file_path)
            if document.json_path and os.path.exists(document.json_path):
                os.remove(document.json_path)

            db.delete(document)
            db.commit()
        except Exception as exc:  # noqa: BLE001
            db.rollback()
            error_msg = f"删除文档失败: {exc}\n{traceback.format_exc()}"
            document_logger.error(error_msg)
            debug_logger.error(error_msg)
            raise DocumentDeletionError(str(exc)) from exc


