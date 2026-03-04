"""Jieba 倒排关键词服务。"""
from __future__ import annotations

import json
from typing import Iterable

from sqlalchemy.orm import Session

from core.database import Document, DocumentSegment, KnowledgeBase, KnowledgeBaseKeywordTable
from core.rag.datasource.keyword.jieba.jieba_keyword_table_handler import JiebaKeywordTableHandler
from core.rag.models.document import DocumentNode


class JiebaKeywordService:
    def __init__(self, db: Session, knowledge_base: KnowledgeBase):
        self.db = db
        self.knowledge_base = knowledge_base
        self.handler = JiebaKeywordTableHandler()

    def create(self, texts: list[DocumentNode]) -> None:
        keyword_table = self._get_keyword_table()
        keyword_number = self.knowledge_base.keyword_number or 10

        for text in texts:
            node_id = str(text.metadata.get("doc_id") or "")
            if not node_id:
                continue
            keywords = list(self.handler.extract_keywords(text.page_content, keyword_number))
            self._update_segment_keywords(node_id=node_id, keywords=keywords)
            keyword_table = self._add_text_to_keyword_table(keyword_table, node_id, keywords)

        self._save_keyword_table(keyword_table)

    def add_texts(self, texts: list[DocumentNode], keywords_list: list[list[str]] | None = None) -> None:
        keyword_table = self._get_keyword_table()
        keyword_number = self.knowledge_base.keyword_number or 10

        for i, text in enumerate(texts):
            node_id = str(text.metadata.get("doc_id") or "")
            if not node_id:
                continue

            keywords = keywords_list[i] if keywords_list and i < len(keywords_list) else []
            if not keywords:
                keywords = list(self.handler.extract_keywords(text.page_content, keyword_number))

            self._update_segment_keywords(node_id=node_id, keywords=keywords)
            keyword_table = self._add_text_to_keyword_table(keyword_table, node_id, keywords)

        self._save_keyword_table(keyword_table)

    def search(
        self,
        query: str,
        top_k: int = 4,
        document_ids_filter: list[str] | None = None,
        enabled_only: bool = True,
    ) -> list[DocumentSegment]:
        keyword_table = self._get_keyword_table()
        sorted_node_ids = self._retrieve_ids_by_query(keyword_table, query, top_k)
        if not sorted_node_ids:
            return []

        segment_query = self.db.query(DocumentSegment).filter(
            DocumentSegment.knowledge_base_id == self.knowledge_base.id,
            DocumentSegment.index_node_id.in_(sorted_node_ids),
        )
        if enabled_only:
            segment_query = segment_query.filter(DocumentSegment.enabled.is_(True))
        if document_ids_filter:
            segment_query = segment_query.filter(DocumentSegment.document_id.in_(document_ids_filter))

        segments = segment_query.all()
        segment_map = {segment.index_node_id: segment for segment in segments if segment.index_node_id}

        ordered_segments: list[DocumentSegment] = []
        for node_id in sorted_node_ids:
            segment = segment_map.get(node_id)
            if not segment:
                continue
            if enabled_only:
                # 同步校验文档是否可检索，避免命中已禁用或已归档文档。
                document = self.db.query(Document).filter(Document.id == segment.document_id).first()
                if not document or not document.enabled or document.archived:
                    continue
            ordered_segments.append(segment)

        return ordered_segments

    def delete_by_ids(self, node_ids: Iterable[str]) -> None:
        node_ids_set = {node_id for node_id in node_ids if node_id}
        if not node_ids_set:
            return

        keyword_table = self._get_keyword_table()
        keywords_to_remove: list[str] = []

        for keyword, node_id_list in keyword_table.items():
            next_ids = [node_id for node_id in node_id_list if node_id not in node_ids_set]
            if next_ids:
                keyword_table[keyword] = next_ids
            else:
                keywords_to_remove.append(keyword)

        for keyword in keywords_to_remove:
            keyword_table.pop(keyword, None)

        self._save_keyword_table(keyword_table)

    def _retrieve_ids_by_query(self, keyword_table: dict[str, list[str]], query: str, k: int = 4) -> list[str]:
        keywords = self.handler.extract_keywords(query)
        chunk_indices_count: dict[str, int] = {}

        for keyword in keywords:
            if keyword not in keyword_table:
                continue
            for node_id in keyword_table[keyword]:
                chunk_indices_count[node_id] = chunk_indices_count.get(node_id, 0) + 1

        sorted_chunk_indices = sorted(chunk_indices_count.keys(), key=lambda x: chunk_indices_count[x], reverse=True)
        return sorted_chunk_indices[:k]

    def _add_text_to_keyword_table(self, keyword_table: dict[str, list[str]], node_id: str, keywords: list[str]):
        for keyword in keywords:
            existing = keyword_table.setdefault(keyword, [])
            if node_id not in existing:
                existing.append(node_id)
        return keyword_table

    def _update_segment_keywords(self, node_id: str, keywords: list[str]) -> None:
        segment = (
            self.db.query(DocumentSegment)
            .filter(
                DocumentSegment.knowledge_base_id == self.knowledge_base.id,
                DocumentSegment.index_node_id == node_id,
            )
            .first()
        )
        if not segment:
            return
        segment.keywords = json.dumps(keywords, ensure_ascii=False)
        self.db.flush()

    def _get_or_create_keyword_table_row(self) -> KnowledgeBaseKeywordTable:
        row = (
            self.db.query(KnowledgeBaseKeywordTable)
            .filter(KnowledgeBaseKeywordTable.knowledge_base_id == self.knowledge_base.id)
            .first()
        )
        if row:
            return row

        row = KnowledgeBaseKeywordTable(
            knowledge_base_id=self.knowledge_base.id,
            keyword_table="{}",
        )
        self.db.add(row)
        self.db.flush()
        return row

    def _get_keyword_table(self) -> dict[str, list[str]]:
        row = self._get_or_create_keyword_table_row()
        return row.keyword_table_dict

    def _save_keyword_table(self, keyword_table: dict[str, list[str]]) -> None:
        row = self._get_or_create_keyword_table_row()
        row.keyword_table = json.dumps(keyword_table, ensure_ascii=False)
        self.db.flush()
