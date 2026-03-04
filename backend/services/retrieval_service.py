"""检索服务（语义/全文/混合/关键词）。"""
from __future__ import annotations

import asyncio
import json
from typing import Any

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.knowledge_entities import RetrievalMethod
from core.config import settings
from core.database import Document, DocumentSegment, KnowledgeBase, SessionLocal
from core.rag.datasource.keyword.jieba import JiebaKeywordService
from providers.embedding.ollama import OllamaEmbeddingProvider
from providers.vector_db.lancedb import LanceDBProvider
from utils.logging import retrieval_logger


class RetrievalService:
    """知识库检索服务。"""

    SUPPORTED_METHODS = {
        "basic",
        RetrievalMethod.SEMANTIC_SEARCH,
        RetrievalMethod.FULL_TEXT_SEARCH,
        RetrievalMethod.HYBRID_SEARCH,
        RetrievalMethod.KEYWORD_SEARCH,
    }
    DEFAULT_HYBRID_VECTOR_WEIGHT = 0.65
    DEFAULT_HYBRID_KEYWORD_WEIGHT = 0.35

    def __init__(self):
        # 向量库实例可复用；维度由写入阶段自动对齐。
        self.vector_db = LanceDBProvider(settings.lance_db_path)
        # embedding Provider 按模型缓存，避免每次检索重复初始化。
        self._embedding_provider_cache: dict[str, OllamaEmbeddingProvider] = {}

    async def retrieve(
        self,
        query: str,
        document_id: str | None = None,
        knowledge_base_id: str | None = None,
        method: str = "basic",
        top_k: int = 5,
        rerank: bool = False,
        retrieval_model: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        if not query or not query.strip():
            return []

        with SessionLocal() as db:
            kb, target_document = self._resolve_context(
                db=db,
                knowledge_base_id=knowledge_base_id,
                document_id=document_id,
            )
            if not kb:
                return []

            model_cfg: dict[str, Any] = dict(kb.retrieval_model_dict or {})
            if retrieval_model:
                model_cfg.update(retrieval_model)

            # 经济模式仅使用关键词召回，避免误走向量路径。
            if kb.indexing_technique == "economy":
                model_cfg["search_method"] = RetrievalMethod.KEYWORD_SEARCH

            search_method = self._normalize_method(method, model_cfg)
            top_k_value = int(model_cfg.get("top_k") or top_k or 5)
            top_k_value = max(1, min(top_k_value, 50))

            score_threshold = None
            if model_cfg.get("score_threshold_enabled"):
                score_threshold = float(model_cfg.get("score_threshold") or 0)

            reranking_enable = bool(model_cfg.get("reranking_enable") or rerank)
            reranking_mode = str(model_cfg.get("reranking_mode") or "reranking_model")
            weights = model_cfg.get("weights") if isinstance(model_cfg.get("weights"), dict) else None

            retrieval_logger.info(
                "开始检索: kb=%s doc=%s method=%s top_k=%s",
                kb.id,
                target_document.id if target_document else None,
                search_method,
                top_k_value,
            )

            doc_filter_id = target_document.id if target_document else None
            if search_method == RetrievalMethod.KEYWORD_SEARCH:
                scored_segments = self._keyword_search(
                    db=db,
                    kb=kb,
                    query=query,
                    top_k=top_k_value,
                    document_id=doc_filter_id,
                )
            elif search_method == RetrievalMethod.FULL_TEXT_SEARCH:
                scored_segments = await self._full_text_search(
                    db=db,
                    kb=kb,
                    query=query,
                    top_k=top_k_value,
                    score_threshold=score_threshold,
                    document_id=doc_filter_id,
                )
            elif search_method == RetrievalMethod.HYBRID_SEARCH:
                semantic_segments, full_text_segments = await asyncio.gather(
                    self._semantic_search(
                        db=db,
                        kb=kb,
                        query=query,
                        top_k=top_k_value,
                        score_threshold=score_threshold,
                        document_id=doc_filter_id,
                    ),
                    self._full_text_search(
                        db=db,
                        kb=kb,
                        query=query,
                        top_k=top_k_value,
                        score_threshold=score_threshold,
                        document_id=doc_filter_id,
                    ),
                )
                scored_segments = self._merge_hybrid(
                    semantic_segments=semantic_segments,
                    full_text_segments=full_text_segments,
                    top_k=top_k_value,
                    reranking_enable=reranking_enable,
                    reranking_mode=reranking_mode,
                    weights=weights,
                )
            else:
                # basic 与 semantic_search 统一走语义检索。
                scored_segments = await self._semantic_search(
                    db=db,
                    kb=kb,
                    query=query,
                    top_k=top_k_value,
                    score_threshold=score_threshold,
                    document_id=doc_filter_id,
                )

            # 语义/全文检索下，如开启重排但暂未配置模型，先执行稳定排序兜底。
            if reranking_enable and len(scored_segments) > 1 and search_method != RetrievalMethod.HYBRID_SEARCH:
                scored_segments = sorted(scored_segments, key=lambda item: item[1], reverse=True)

            self._increase_hit_count(db=db, segments=[segment for segment, _ in scored_segments])
            return self._format_results(scored_segments)

    def _resolve_context(
        self,
        db: Session,
        knowledge_base_id: str | None,
        document_id: str | None,
    ) -> tuple[KnowledgeBase | None, Document | None]:
        target_document = None
        if document_id:
            target_document = db.query(Document).filter(Document.id == document_id).first()
            if not target_document:
                return None, None
            knowledge_base_id = target_document.knowledge_base_id

        if not knowledge_base_id:
            return None, target_document

        kb = db.query(KnowledgeBase).filter(KnowledgeBase.id == knowledge_base_id).first()
        return kb, target_document

    def _normalize_method(self, method: str, model_cfg: dict[str, Any]) -> str:
        normalized = (method or "basic").strip().lower()
        if normalized == "basic":
            normalized = str(model_cfg.get("search_method") or RetrievalMethod.SEMANTIC_SEARCH)

        if normalized not in self.SUPPORTED_METHODS:
            retrieval_logger.warning("未知检索方式 %s，回退 semantic_search", normalized)
            return RetrievalMethod.SEMANTIC_SEARCH

        if normalized == "basic":
            return RetrievalMethod.SEMANTIC_SEARCH
        return normalized

    def _get_embedding_provider(self, kb: KnowledgeBase) -> OllamaEmbeddingProvider:
        embedding_model = kb.embedding_model or settings.ollama_embedding_model
        cache_key = f"ollama::{embedding_model}"
        provider = self._embedding_provider_cache.get(cache_key)
        if provider:
            return provider

        provider = OllamaEmbeddingProvider(
            base_url=settings.ollama_base_url,
            model=embedding_model,
        )
        self._embedding_provider_cache[cache_key] = provider
        return provider

    async def _semantic_search(
        self,
        db: Session,
        kb: KnowledgeBase,
        query: str,
        top_k: int,
        score_threshold: float | None,
        document_id: str | None = None,
    ) -> list[tuple[DocumentSegment, float]]:
        embedding_provider = self._get_embedding_provider(kb)
        query_vector = await embedding_provider.embed([query])

        filters: dict[str, Any] = {"knowledge_base_id": kb.id}
        if document_id:
            filters["document_id"] = document_id

        vector_results = await self.vector_db.search(
            query_vector=query_vector[0],
            top_k=max(top_k * 2, top_k),
            filter=filters,
        )
        return self._map_vector_results(
            db=db,
            kb_id=kb.id,
            vector_results=vector_results,
            top_k=top_k,
            score_threshold=score_threshold,
        )

    async def _full_text_search(
        self,
        db: Session,
        kb: KnowledgeBase,
        query: str,
        top_k: int,
        score_threshold: float | None,
        document_id: str | None = None,
    ) -> list[tuple[DocumentSegment, float]]:
        filters: dict[str, Any] = {"knowledge_base_id": kb.id}
        if document_id:
            filters["document_id"] = document_id

        vector_results = await self.vector_db.search_by_full_text(
            query=query,
            top_k=max(top_k * 2, top_k),
            filter=filters,
        )
        return self._map_vector_results(
            db=db,
            kb_id=kb.id,
            vector_results=vector_results,
            top_k=top_k,
            score_threshold=score_threshold,
        )

    def _keyword_search(
        self,
        db: Session,
        kb: KnowledgeBase,
        query: str,
        top_k: int,
        document_id: str | None = None,
    ) -> list[tuple[DocumentSegment, float]]:
        segment_list = JiebaKeywordService(db=db, knowledge_base=kb).search(
            query=query,
            top_k=top_k,
            document_ids_filter=[document_id] if document_id else None,
            enabled_only=True,
        )

        scored_segments: list[tuple[DocumentSegment, float]] = []
        total = max(len(segment_list), 1)
        for idx, segment in enumerate(segment_list):
            # 关键词召回按命中顺序做线性衰减，便于与其他方式统一排序。
            score = max(0.0, 1.0 - (idx / total))
            scored_segments.append((segment, score))
        return scored_segments

    def _merge_hybrid(
        self,
        semantic_segments: list[tuple[DocumentSegment, float]],
        full_text_segments: list[tuple[DocumentSegment, float]],
        top_k: int,
        reranking_enable: bool,
        reranking_mode: str,
        weights: dict[str, Any] | None,
    ) -> list[tuple[DocumentSegment, float]]:
        vector_weight, keyword_weight = self._resolve_hybrid_weights(
            reranking_enable=reranking_enable,
            reranking_mode=reranking_mode,
            weights=weights,
        )
        merged: dict[str, tuple[DocumentSegment, float]] = {}

        for segment, score in semantic_segments:
            merged[segment.id] = (segment, score * vector_weight)

        for segment, score in full_text_segments:
            current = merged.get(segment.id)
            score_part = score * keyword_weight
            if current:
                merged[segment.id] = (segment, current[1] + score_part)
            else:
                merged[segment.id] = (segment, score_part)

        ranked = sorted(merged.values(), key=lambda item: item[1], reverse=True)
        return ranked[:top_k]

    def _resolve_hybrid_weights(
        self,
        reranking_enable: bool,
        reranking_mode: str,
        weights: dict[str, Any] | None,
    ) -> tuple[float, float]:
        vector_weight = self.DEFAULT_HYBRID_VECTOR_WEIGHT
        keyword_weight = self.DEFAULT_HYBRID_KEYWORD_WEIGHT

        if not (reranking_enable and reranking_mode == "weighted_score" and weights):
            return vector_weight, keyword_weight

        vector_setting = weights.get("vector_setting") if isinstance(weights, dict) else None
        keyword_setting = weights.get("keyword_setting") if isinstance(weights, dict) else None
        if not isinstance(vector_setting, dict) or not isinstance(keyword_setting, dict):
            return vector_weight, keyword_weight

        try:
            vector_weight = float(vector_setting.get("vector_weight"))
            keyword_weight = float(keyword_setting.get("keyword_weight"))
            if vector_weight < 0 or keyword_weight < 0:
                raise ValueError("weight < 0")
            total = vector_weight + keyword_weight
            if total <= 0:
                raise ValueError("weight total <= 0")
            # 统一归一化，避免输入比例异常时分值偏移。
            return vector_weight / total, keyword_weight / total
        except Exception:  # noqa: BLE001
            return self.DEFAULT_HYBRID_VECTOR_WEIGHT, self.DEFAULT_HYBRID_KEYWORD_WEIGHT

    def _map_vector_results(
        self,
        db: Session,
        kb_id: str,
        vector_results: list[dict[str, Any]],
        top_k: int,
        score_threshold: float | None,
    ) -> list[tuple[DocumentSegment, float]]:
        if not vector_results:
            return []

        node_ids: list[str] = []
        scores_by_node: dict[str, float] = {}
        for item in vector_results:
            metadata = item.get("metadata") or {}
            node_id = metadata.get("index_node_id") or item.get("chunk_id")
            if not node_id:
                continue
            score = float(item.get("similarity") or 0)
            if score_threshold is not None and score < score_threshold:
                continue
            node_ids.append(node_id)
            if node_id in scores_by_node:
                scores_by_node[node_id] = max(scores_by_node[node_id], score)
            else:
                scores_by_node[node_id] = score

        if not node_ids:
            return []

        segments = (
            db.query(DocumentSegment)
            .filter(
                DocumentSegment.knowledge_base_id == kb_id,
                DocumentSegment.enabled.is_(True),
                DocumentSegment.status == "completed",
                or_(
                    DocumentSegment.index_node_id.in_(node_ids),
                    DocumentSegment.id.in_(node_ids),
                ),
            )
            .all()
        )

        doc_ids = {segment.document_id for segment in segments}
        valid_docs = {
            doc.id
            for doc in db.query(Document)
            .filter(
                Document.id.in_(doc_ids),
                Document.enabled.is_(True),
                Document.archived.is_(False),
            )
            .all()
        }

        ordered: list[tuple[DocumentSegment, float]] = []
        segment_map_by_node = {segment.index_node_id: segment for segment in segments if segment.index_node_id}
        segment_map_by_id = {segment.id: segment for segment in segments}
        for node_id in node_ids:
            segment = segment_map_by_node.get(node_id) or segment_map_by_id.get(node_id)
            if not segment:
                continue
            if segment.document_id not in valid_docs:
                continue
            ordered.append((segment, scores_by_node.get(node_id, 0.0)))

        # 去重后按分数排序。
        final_map: dict[str, tuple[DocumentSegment, float]] = {}
        for segment, score in ordered:
            current = final_map.get(segment.id)
            if not current or score > current[1]:
                final_map[segment.id] = (segment, score)

        ranked = sorted(final_map.values(), key=lambda item: item[1], reverse=True)
        return ranked[:top_k]

    def _increase_hit_count(self, db: Session, segments: list[DocumentSegment]) -> None:
        if not segments:
            return
        for segment in segments:
            segment.hit_count = int(segment.hit_count or 0) + 1
        db.commit()

    def _format_results(self, scored_segments: list[tuple[DocumentSegment, float]]) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        for segment, score in scored_segments:
            keywords = []
            if segment.keywords:
                try:
                    parsed = json.loads(segment.keywords)
                    if isinstance(parsed, list):
                        keywords = parsed
                except json.JSONDecodeError:
                    keywords = []

            results.append(
                {
                    "chunk_id": segment.index_node_id or segment.id,
                    "content": segment.content,
                    "similarity": float(score),
                    "metadata": {
                        "document_id": segment.document_id,
                        "knowledge_base_id": segment.knowledge_base_id,
                        "index_node_id": segment.index_node_id or segment.id,
                        "position": segment.position,
                        "keywords": keywords,
                    },
                }
            )
        return results
