"""
召回测试服务：按 query 与检索配置在知识库内检索，返回命中的分段与分数。
经济模式强制 keyword_search；支持按 document_ids 限定文档范围。
"""
from __future__ import annotations

import json
from typing import Any

from sqlalchemy import or_
from sqlalchemy.orm import Session

from core.database import (
    Document,
    DocumentSegment,
    KnowledgeBase,
    KnowledgeBaseQuery,
)
from services.retrieval_service import RetrievalService


DEFAULT_RETRIEVAL_MODEL: dict[str, Any] = {
    "search_method": "semantic_search",
    "reranking_enable": False,
    "reranking_model": {
        "reranking_provider_name": "",
        "reranking_model_name": "",
    },
    "reranking_mode": "reranking_model",
    "top_k": 3,
    "score_threshold_enabled": False,
    "score_threshold": 0.5,
    "weights": None,
}


class HitTestingService:
    """知识库召回测试：参数校验 + retrieve 编排（合并检索配置、调用 RetrievalService、组装 records/hits）。"""

    @classmethod
    def hit_testing_args_check(cls, payload: dict[str, Any]) -> None:
        """校验 query 非空且长度、document_ids 类型。"""
        query = str(payload.get("query") or "").strip()
        if not query:
            raise ValueError("query 不能为空")
        if len(query) > 250:
            raise ValueError("query 长度不能超过 250")

        document_ids = payload.get("document_ids")
        if document_ids is not None and not isinstance(document_ids, list):
            raise ValueError("document_ids 必须是数组")

    @classmethod
    async def retrieve(
        cls,
        db: Session,
        knowledge_base: KnowledgeBase,
        query: str,
        retrieval_model: dict[str, Any] | None = None,
        document_ids: list[str] | None = None,
        limit: int = 10,
    ) -> dict[str, Any]:
        """合并知识库与请求的检索配置，调用 RetrievalService 检索，返回 query、retrieval_model、records、hits。"""
        # 合并默认检索配置，避免前端只传部分字段导致后端分支缺参。
        merged_retrieval_model = dict(DEFAULT_RETRIEVAL_MODEL)
        merged_retrieval_model.update(knowledge_base.retrieval_model_dict or {})
        if retrieval_model:
            merged_retrieval_model.update(retrieval_model)

        # 经济模式下强制走关键词检索，保持索引模式语义稳定。
        if knowledge_base.indexing_technique == "economy":
            merged_retrieval_model["search_method"] = "keyword_search"

        top_k = int(merged_retrieval_model.get("top_k") or limit or 10)
        top_k = max(1, min(top_k, 50))

        retrieval_service = RetrievalService()

        hits: list[dict[str, Any]] = []
        if document_ids:
            for doc_id in document_ids:
                segment_hits = await retrieval_service.retrieve(
                    query=query,
                    knowledge_base_id=knowledge_base.id,
                    document_id=doc_id,
                    method=str(merged_retrieval_model.get("search_method") or "semantic_search"),
                    top_k=top_k,
                    rerank=bool(merged_retrieval_model.get("reranking_enable")),
                    retrieval_model=merged_retrieval_model,
                )
                hits.extend(segment_hits)
        else:
            hits = await retrieval_service.retrieve(
                query=query,
                knowledge_base_id=knowledge_base.id,
                method=str(merged_retrieval_model.get("search_method") or "semantic_search"),
                top_k=top_k,
                rerank=bool(merged_retrieval_model.get("reranking_enable")),
                retrieval_model=merged_retrieval_model,
            )

        # 按 chunk_id 去重并保留最高分，避免多路召回重复展示。
        dedup_hits: dict[str, dict[str, Any]] = {}
        for hit in hits:
            chunk_id = str(hit.get("chunk_id") or "")
            if not chunk_id:
                continue
            if chunk_id not in dedup_hits:
                dedup_hits[chunk_id] = hit
                continue
            if float(hit.get("similarity") or 0) > float(dedup_hits[chunk_id].get("similarity") or 0):
                dedup_hits[chunk_id] = hit

        ranked_hits = sorted(
            dedup_hits.values(),
            key=lambda item: float(item.get("similarity") or 0),
            reverse=True,
        )[:top_k]

        records = cls._build_records(db=db, kb_id=knowledge_base.id, hits=ranked_hits)
        cls._save_query_log(db=db, knowledge_base_id=knowledge_base.id, query=query)

        return {
            "query": {"content": query},
            "retrieval_model": merged_retrieval_model,
            "records": records,
            "hits": ranked_hits,
        }

    @classmethod
    def _build_records(cls, db: Session, kb_id: str, hits: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if not hits:
            return []

        index_node_ids: list[str] = []
        chunk_ids: list[str] = []
        for item in hits:
            metadata = item.get("metadata") or {}
            node_id = metadata.get("index_node_id")
            if node_id:
                index_node_ids.append(str(node_id))
            chunk_id = item.get("chunk_id")
            if chunk_id:
                chunk_ids.append(str(chunk_id))

        segment_conditions = []
        if index_node_ids:
            segment_conditions.append(DocumentSegment.index_node_id.in_(index_node_ids))
        if chunk_ids:
            segment_conditions.append(DocumentSegment.id.in_(chunk_ids))

        if not segment_conditions:
            return []

        if len(segment_conditions) == 1:
            condition = segment_conditions[0]
        else:
            condition = or_(*segment_conditions)

        segments = (
            db.query(DocumentSegment)
            .filter(
                DocumentSegment.knowledge_base_id == kb_id,
                condition,
            )
            .all()
        )
        segment_by_node_id = {segment.index_node_id: segment for segment in segments if segment.index_node_id}
        segment_by_id = {segment.id: segment for segment in segments}

        doc_ids = {segment.document_id for segment in segments}
        docs = (
            db.query(Document)
            .filter(Document.id.in_(doc_ids))
            .all()
            if doc_ids
            else []
        )
        doc_map = {doc.id: doc for doc in docs}

        records: list[dict[str, Any]] = []
        for hit in hits:
            metadata = hit.get("metadata") or {}
            chunk_id = str(hit.get("chunk_id") or "")
            node_id = str(metadata.get("index_node_id") or chunk_id)

            segment = segment_by_node_id.get(node_id) or segment_by_id.get(chunk_id)
            document = doc_map.get(segment.document_id) if segment else None

            records.append(
                {
                    "score": float(hit.get("similarity") or 0),
                    "segment": {
                        "id": segment.id if segment else chunk_id,
                        "document_id": segment.document_id if segment else metadata.get("document_id"),
                        "knowledge_base_id": segment.knowledge_base_id if segment else kb_id,
                        "position": segment.position if segment else None,
                        "content": segment.content if segment else str(hit.get("content") or ""),
                        "answer": segment.answer if segment else None,
                        "keywords": segment.keywords_list if segment else [],
                        "hit_count": int(segment.hit_count or 0) if segment else 0,
                        "enabled": bool(segment.enabled) if segment else True,
                    },
                    "document": {
                        "id": document.id if document else metadata.get("document_id"),
                        "name": document.filename if document else None,
                        "doc_form": document.doc_form if document else None,
                    },
                    "metadata": metadata,
                }
            )

        return records

    @classmethod
    def _save_query_log(cls, db: Session, knowledge_base_id: str, query: str) -> None:
        payload = [{"content_type": "text_query", "content": query}]
        row = KnowledgeBaseQuery(
            knowledge_base_id=knowledge_base_id,
            content=json.dumps(payload, ensure_ascii=False),
            source="hit_testing",
            created_by="system",
        )
        db.add(row)
        db.commit()
