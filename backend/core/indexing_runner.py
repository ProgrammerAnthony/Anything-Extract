"""索引主流程实现（适配本项目）。"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import hashlib
import json
import re
import uuid
from typing import Any

from langchain_text_splitters import RecursiveCharacterTextSplitter
from sqlalchemy.orm import Session

from core.config import settings
from core.database import (
    Document,
    DocumentSegment,
    KnowledgeBase,
    KnowledgeBaseProcessRule,
)
from core.rag.cleaner.clean_processor import CleanProcessor
from core.rag.datasource.keyword.jieba import JiebaKeywordService
from core.rag.models.document import DocumentNode
from providers.embedding.ollama import OllamaEmbeddingProvider
from providers.vector_db.lancedb import LanceDBProvider
from utils.document_parser import DocumentParser
from utils.logging import document_logger


@dataclass
class IndexingSummary:
    total_segments: int
    tokens: int
    word_count: int


class IndexingRunner:
    """索引执行器。"""

    def __init__(self):
        self.parser = DocumentParser()
        # 向量库实例全局复用；embedding provider 按知识库模型动态选择。
        self.vector_db = LanceDBProvider(settings.lance_db_path)
        self._embedding_provider_cache: dict[str, OllamaEmbeddingProvider] = {}

    async def run(self, db: Session, document: Document) -> IndexingSummary:
        """执行完整索引流程。"""
        start_time = datetime.utcnow()
        knowledge_base = db.query(KnowledgeBase).filter(KnowledgeBase.id == document.knowledge_base_id).first()
        if not knowledge_base:
            raise ValueError(f"knowledge base not found: {document.knowledge_base_id}")

        # 解析当前文档应使用的处理规则。
        process_rule = self._resolve_process_rule(db=db, document=document, knowledge_base=knowledge_base)

        self._update_document_status(
            document=document,
            indexing_status="parsing",
            status="processing",
            processing_started_at=datetime.utcnow(),
            error=None,
            stopped_at=None,
        )

        # 1) Extract：从数据源抽取原始文本。
        text_docs = await self._extract(document)
        self._update_document_status(
            document=document,
            indexing_status="cleaning",
            parsing_completed_at=datetime.utcnow(),
        )

        # 2) Transform：清洗 + 分段 + 元数据补全。
        transformed_docs = self._transform(text_docs=text_docs, process_rule=process_rule, doc_form=document.doc_form)

        # 3) Load Segments：先落库分段，便于后续状态追踪与编辑。
        self._load_segments(db=db, document=document, knowledge_base=knowledge_base, documents=transformed_docs)

        # 4) Load：写入向量与关键词索引。
        tokens = await self._load_indexes(
            db=db,
            document=document,
            knowledge_base=knowledge_base,
            documents=transformed_docs,
        )

        end_time = datetime.utcnow()
        word_count = sum(item.word_count for item in transformed_docs)

        self._update_document_status(
            document=document,
            indexing_status="completed",
            status="completed",
            tokens=tokens,
            word_count=word_count,
            completed_at=end_time,
            indexing_latency=(end_time - start_time).total_seconds(),
            error=None,
        )

        document_logger.info(
            "Indexing completed: doc=%s, kb=%s, segments=%s, tokens=%s",
            document.id,
            knowledge_base.id,
            len(transformed_docs),
            tokens,
        )

        return IndexingSummary(total_segments=len(transformed_docs), tokens=tokens, word_count=word_count)

    async def _extract(self, document: Document) -> list[DocumentNode]:
        data_source_info = document.data_source_info_dict
        file_path = data_source_info.get("file_path") or document.file_path
        if not file_path:
            raise ValueError("missing file_path in document data source")

        parsed = await self.parser.parse(file_path=file_path, file_type=document.file_type)
        text_docs: list[DocumentNode] = []

        for page in parsed.get("pages", []):
            page_number = int(page.get("page_number") or 0)
            content = str(page.get("content") or "")
            if not content.strip():
                continue

            metadata = {
                "document_id": document.id,
                "knowledge_base_id": document.knowledge_base_id,
                "page_number": page_number,
                "source_file": file_path,
            }
            text_docs.append(DocumentNode(page_content=content, metadata=metadata))

        return text_docs

    def _resolve_process_rule(
        self,
        db: Session,
        document: Document,
        knowledge_base: KnowledgeBase,
    ) -> dict[str, Any]:
        process_rule = None
        if document.process_rule_id:
            process_rule = (
                db.query(KnowledgeBaseProcessRule)
                .filter(KnowledgeBaseProcessRule.id == document.process_rule_id)
                .first()
            )

        if not process_rule:
            process_rule = (
                db.query(KnowledgeBaseProcessRule)
                .filter(KnowledgeBaseProcessRule.knowledge_base_id == knowledge_base.id)
                .order_by(KnowledgeBaseProcessRule.created_at.asc())
                .first()
            )

        if not process_rule:
            process_rule = KnowledgeBaseProcessRule(
                knowledge_base_id=knowledge_base.id,
                mode="automatic",
                rules=json.dumps(KnowledgeBaseProcessRule.AUTOMATIC_RULES, ensure_ascii=False),
            )
            db.add(process_rule)
            db.flush()

        if not document.process_rule_id:
            document.process_rule_id = process_rule.id

        rule_content = process_rule.rules_dict if process_rule.rules else KnowledgeBaseProcessRule.AUTOMATIC_RULES
        return {
            "mode": process_rule.mode,
            "rules": rule_content,
        }

    def _transform(self, text_docs: list[DocumentNode], process_rule: dict, doc_form: str | None) -> list[DocumentNode]:
        segmentation = self._resolve_segmentation(process_rule)
        splitter = self._get_splitter(
            separator=segmentation.get("separator", "\n"),
            max_tokens=int(segmentation.get("max_tokens") or 500),
            chunk_overlap=int(segmentation.get("chunk_overlap") or 50),
        )

        all_documents: list[DocumentNode] = []

        for text_doc in text_docs:
            cleaned_text = CleanProcessor.clean(text_doc.page_content, process_rule)
            chunks = splitter.split_text(cleaned_text)

            for chunk in chunks:
                normalized = self._normalize_chunk(chunk)
                if not normalized:
                    continue

                node_id = str(uuid.uuid4())
                node_hash = hashlib.sha1(normalized.encode("utf-8")).hexdigest()

                metadata = {
                    **text_doc.metadata,
                    "doc_id": node_id,
                    "doc_hash": node_hash,
                    "doc_form": doc_form or "text_model",
                }

                if (doc_form or "text_model") == "qa_model":
                    question, answer = self._split_qa_chunk(normalized)
                    if answer:
                        metadata["answer"] = answer
                        normalized = question

                all_documents.append(DocumentNode(page_content=normalized, metadata=metadata))

        return all_documents

    def _resolve_segmentation(self, process_rule: dict) -> dict[str, Any]:
        mode = process_rule.get("mode")
        rules = process_rule.get("rules") or {}
        if mode == "automatic":
            return KnowledgeBaseProcessRule.AUTOMATIC_RULES.get("segmentation", {})

        segmentation = rules.get("segmentation") if isinstance(rules, dict) else None
        if not isinstance(segmentation, dict):
            return KnowledgeBaseProcessRule.AUTOMATIC_RULES.get("segmentation", {})

        # 兼容 delimiter 与 separator 两种字段。
        if "separator" not in segmentation and "delimiter" in segmentation:
            segmentation["separator"] = segmentation.get("delimiter")

        return segmentation

    def _get_splitter(self, separator: str, max_tokens: int, chunk_overlap: int):
        max_tokens = max(50, min(max_tokens, 4000))
        chunk_overlap = max(0, min(chunk_overlap, max_tokens // 2))

        if separator:
            separator = separator.replace("\\n", "\n")

        return RecursiveCharacterTextSplitter(
            chunk_size=max_tokens,
            chunk_overlap=chunk_overlap,
            separators=[separator, "\n\n", "\n", "。", ".", " ", ""],
        )

    def _load_segments(
        self,
        db: Session,
        document: Document,
        knowledge_base: KnowledgeBase,
        documents: list[DocumentNode],
    ) -> None:
        # 重新索引时先清空历史分段，避免重复命中。
        db.query(DocumentSegment).filter(DocumentSegment.document_id == document.id).delete()

        now = datetime.utcnow()
        for index, item in enumerate(documents, start=1):
            segment = DocumentSegment(
                document_id=document.id,
                knowledge_base_id=knowledge_base.id,
                position=index,
                content=item.page_content,
                answer=item.metadata.get("answer"),
                word_count=item.word_count,
                tokens=item.tokens,
                keywords=json.dumps([], ensure_ascii=False),
                index_node_id=item.metadata.get("doc_id"),
                index_node_hash=item.metadata.get("doc_hash"),
                enabled=bool(document.enabled),
                status="indexing",
                indexing_at=now,
            )
            db.add(segment)

        self._update_document_status(
            document=document,
            indexing_status="indexing",
            cleaning_completed_at=now,
            splitting_completed_at=now,
        )

    async def _load_indexes(
        self,
        db: Session,
        document: Document,
        knowledge_base: KnowledgeBase,
        documents: list[DocumentNode],
    ) -> int:
        if not documents:
            return 0

        total_tokens = 0

        # 默认双写：向量 + 关键词都写，便于高质量/经济模式快速切换。
        vector_error = None
        try:
            texts = [item.page_content for item in documents]
            embedding_provider = self._get_embedding_provider(knowledge_base)
            vectors = await embedding_provider.embed(texts)
            vector_metas = []
            for idx, item in enumerate(documents):
                vector_metas.append(
                    {
                        "knowledge_base_id": knowledge_base.id,
                        "document_id": document.id,
                        "index_node_id": item.metadata.get("doc_id"),
                        "chunk_id": item.metadata.get("doc_id"),
                        "chunk_index": idx,
                        "page_number": int(item.metadata.get("page_number") or 0),
                    }
                )
            await self.vector_db.add_documents(vectors=vectors, texts=texts, metadata=vector_metas)
            total_tokens += sum(len(text) for text in texts)
        except Exception as exc:  # noqa: BLE001
            vector_error = exc
            document_logger.warning("Vector indexing failed for document=%s: %s", document.id, exc)

        keyword_error = None
        try:
            JiebaKeywordService(db=db, knowledge_base=knowledge_base).add_texts(documents)
        except Exception as exc:  # noqa: BLE001
            keyword_error = exc
            document_logger.warning("Keyword indexing failed for document=%s: %s", document.id, exc)

        # 按当前索引模式决定容错边界，保证主路径可用。
        if knowledge_base.indexing_technique == "high_quality" and vector_error is not None:
            raise vector_error
        if knowledge_base.indexing_technique == "economy" and keyword_error is not None:
            raise keyword_error

        db.query(DocumentSegment).filter(DocumentSegment.document_id == document.id).update(
            {
                DocumentSegment.status: "completed",
                DocumentSegment.enabled: bool(document.enabled),
                DocumentSegment.completed_at: datetime.utcnow(),
            }
        )

        return total_tokens

    def _get_embedding_provider(self, knowledge_base: KnowledgeBase) -> OllamaEmbeddingProvider:
        embedding_model = knowledge_base.embedding_model or settings.ollama_embedding_model
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

    def _update_document_status(self, document: Document, indexing_status: str | None = None, status: str | None = None, **kwargs):
        if indexing_status is not None:
            document.indexing_status = indexing_status
        if status is not None:
            document.status = status
        for key, value in kwargs.items():
            setattr(document, key, value)

    @staticmethod
    def _normalize_chunk(text: str) -> str:
        text = re.sub(r"^[\s\-•*#]+", "", text)
        return text.strip()

    @staticmethod
    def _split_qa_chunk(text: str) -> tuple[str, str | None]:
        # 兼容 Q/A 预览格式。
        regex = r"Q\d+:\s*(.*?)\s*A\d+:\s*([\s\S]*?)$"
        match = re.search(regex, text, re.UNICODE)
        if not match:
            return text, None
        question = (match.group(1) or "").strip()
        answer = (match.group(2) or "").strip()
        return question or text, answer or None
