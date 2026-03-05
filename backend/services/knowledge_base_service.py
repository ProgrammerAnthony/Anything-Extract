"""知识库领域服务：封装删除知识库与文档详情聚合等业务逻辑。"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Optional, Tuple, List
import uuid

from sqlalchemy import func
from sqlalchemy.orm import Session

from core.config import settings
from core.database import (
    Document,
    DocumentIngestJob,
    DocumentSegment,
    KnowledgeBase,
    KnowledgeBaseProcessRule,
)
from core.rag.datasource.keyword.jieba import JiebaKeywordService
from providers.vector_db.lancedb import LanceDBProvider
from services.ingest_queue_service import IngestQueueService


class KnowledgeBaseNotFoundError(Exception):
    """知识库不存在。"""


class CannotDeleteLastKnowledgeBaseError(Exception):
    """不能删除最后一个知识库。"""


class KnowledgeBaseHasDocumentsError(Exception):
    """知识库中仍然存在文档，不能直接删除。"""


class DocumentNotFoundError(Exception):
    """文档不存在。"""


class KnowledgeBaseService:
    """知识库相关核心业务逻辑。

    - 删除知识库（含业务校验）
    - 聚合文档详情（document + ingest_job + segment/hit_count + process_rule）
    - 按本地 file_path 创建文档并入队
    """

    def __init__(self, ingest_queue_service: IngestQueueService | None = None) -> None:
        self.ingest_queue_service = ingest_queue_service or IngestQueueService()

    # ---------- 内部辅助 ----------

    def _ensure_kb_process_rule(
        self,
        db: Session,
        kb_id: str,
        process_rule: Optional["ProcessRule"] = None,
    ) -> KnowledgeBaseProcessRule:
        """保证知识库存在一条处理规则；若传入 process_rule 则新建一条规则并返回。

        为避免循环依赖，这里用字符串注解 ProcessRule，并在需要时动态导入。
        """
        if process_rule:
            rule = KnowledgeBaseProcessRule(
                knowledge_base_id=kb_id,
                mode=process_rule.mode,
                rules=json.dumps(process_rule.model_dump(mode="json"), ensure_ascii=False),
            )
            db.add(rule)
            db.flush()
            return rule

        rule = (
            db.query(KnowledgeBaseProcessRule)
            .filter(KnowledgeBaseProcessRule.knowledge_base_id == kb_id)
            .order_by(KnowledgeBaseProcessRule.created_at.asc())
            .first()
        )
        if rule:
            return rule

        rule = KnowledgeBaseProcessRule(
            knowledge_base_id=kb_id,
            mode="automatic",
            rules=json.dumps(KnowledgeBaseProcessRule.AUTOMATIC_RULES, ensure_ascii=False),
        )
        db.add(rule)
        db.flush()
        return rule

    def _get_dataset_process_rule(self, db: Session, kb_id: str) -> KnowledgeBaseProcessRule | None:
        """取知识库下最早创建的一条处理规则（用作数据集默认）。"""
        return (
            db.query(KnowledgeBaseProcessRule)
            .filter(KnowledgeBaseProcessRule.knowledge_base_id == kb_id)
            .order_by(KnowledgeBaseProcessRule.created_at.asc())
            .first()
        )

    def _serialize_kb(self, kb: KnowledgeBase) -> Dict[str, Any]:
        return {
            "id": kb.id,
            "name": kb.name,
            "is_default": kb.is_default,
            "indexing_technique": kb.indexing_technique,
            "doc_form": kb.doc_form,
            "embedding_model": kb.embedding_model,
            "embedding_model_provider": kb.embedding_model_provider,
            "keyword_number": kb.keyword_number,
            "retrieval_model": kb.retrieval_model_dict,
            "created_at": kb.created_at,
            "updated_at": kb.updated_at,
        }

    def _serialize_process_rule(
        self,
        rule: KnowledgeBaseProcessRule | None,
    ) -> Dict[str, Any] | None:
        if not rule:
            return None
        return {
            "id": rule.id,
            "knowledge_base_id": rule.knowledge_base_id,
            "mode": rule.mode,
            "rules": rule.rules_dict,
            "created_at": rule.created_at,
        }

    def _serialize_document(
        self,
        doc: Document,
        ingest_job: DocumentIngestJob | None = None,
        hit_count: int | None = None,
    ) -> Dict[str, Any]:
        return {
            "id": doc.id,
            "knowledge_base_id": doc.knowledge_base_id,
            "filename": doc.filename,
            "name": doc.filename,
            "file_type": doc.file_type,
            "status": doc.status,
            "display_status": doc.display_status,
            "indexing_status": doc.indexing_status,
            "enabled": doc.enabled,
            "archived": doc.archived,
            "archived_reason": doc.archived_reason,
            "word_count": doc.word_count,
            "tokens": doc.tokens,
            "hit_count": int(hit_count or 0),
            "doc_form": doc.doc_form,
            "doc_language": doc.doc_language,
            "data_source_type": doc.data_source_type,
            "data_source_info": doc.data_source_info_dict,
            "batch": doc.batch,
            "position": doc.position,
            "error": doc.error,
            "metadata": json.loads(doc.document_metadata) if doc.document_metadata else None,
            "process_rule_id": doc.process_rule_id,
            "created_from": doc.created_from,
            "processing_started_at": doc.processing_started_at,
            "parsing_completed_at": doc.parsing_completed_at,
            "cleaning_completed_at": doc.cleaning_completed_at,
            "splitting_completed_at": doc.splitting_completed_at,
            "completed_at": doc.completed_at,
            "archived_at": doc.archived_at,
            "disabled_at": doc.disabled_at,
            "created_at": doc.created_at,
            "updated_at": doc.updated_at,
            "ingest_job": self.ingest_queue_service.serialize_job(ingest_job),
        }

    # ---------- 业务方法 ----------

    def delete_knowledge_base(self, db: Session, kb_id: str) -> None:
        """删除知识库，包含业务规则：

        - 若不存在则抛出 KnowledgeBaseNotFoundError
        - 若为最后一个知识库则抛出 CannotDeleteLastKnowledgeBaseError
        - 若知识库下仍有文档则抛出 KnowledgeBaseHasDocumentsError
        """
        kb = db.query(KnowledgeBase).filter(KnowledgeBase.id == kb_id).first()
        if not kb:
            raise KnowledgeBaseNotFoundError(f"knowledge base not found: {kb_id}")

        if db.query(KnowledgeBase).count() == 1:
            raise CannotDeleteLastKnowledgeBaseError("不能删除最后一个知识库")

        doc_count = db.query(Document).filter(Document.knowledge_base_id == kb_id).count()
        if doc_count > 0:
            raise KnowledgeBaseHasDocumentsError(
                f"知识库中还有 {doc_count} 个文档，请先删除文档",
            )

        db.delete(kb)
        db.commit()

    def get_document_detail(
        self,
        db: Session,
        kb_id: str,
        doc_id: str,
    ) -> Dict[str, Any]:
        """聚合文档详情：

        - document 基本信息
        - ingest_job 状态
        - segment_count、hit_count 聚合
        - 文档与数据集级别的 process_rule
        - 所属知识库与技术参数
        """
        doc = (
            db.query(Document)
            .filter(Document.id == doc_id, Document.knowledge_base_id == kb_id)
            .first()
        )
        if not doc:
            raise DocumentNotFoundError(f"document not found: {doc_id}")

        job = db.query(DocumentIngestJob).filter(DocumentIngestJob.document_id == doc.id).first()
        segment_count = db.query(DocumentSegment).filter(DocumentSegment.document_id == doc.id).count()
        hit_count_rows = (
            db.query(DocumentSegment.hit_count)
            .filter(DocumentSegment.document_id == doc.id)
            .all()
        )
        total_hit_count = sum(item[0] or 0 for item in hit_count_rows)

        kb = db.query(KnowledgeBase).filter(KnowledgeBase.id == kb_id).first()

        document_rule = None
        if doc.process_rule_id:
            document_rule = (
                db.query(KnowledgeBaseProcessRule)
                .filter(KnowledgeBaseProcessRule.id == doc.process_rule_id)
                .first()
            )
        dataset_rule = self._get_dataset_process_rule(db=db, kb_id=kb_id)

        payload = self._serialize_document(doc, job, hit_count=int(total_hit_count))
        payload["segment_count"] = segment_count
        payload["document_process_rule"] = self._serialize_process_rule(document_rule)
        payload["dataset_process_rule"] = self._serialize_process_rule(dataset_rule)
        payload["knowledge_base"] = self._serialize_kb(kb) if kb else None
        payload["technical_parameters"] = {
            "indexing_technique": kb.indexing_technique if kb else None,
            "embedding_model": kb.embedding_model if kb else None,
            "embedding_model_provider": kb.embedding_model_provider if kb else None,
            "retrieval_model": kb.retrieval_model_dict if kb else None,
            "keyword_number": kb.keyword_number if kb else None,
        }

        return payload

    def create_document_for_knowledge_base(
        self,
        db: Session,
        kb: KnowledgeBase,
        file_path: str,
        file_type: str,
        *,
        name: Optional[str] = None,
        process_rule: Optional["ProcessRule"] = None,
        retrieval_model: Optional["RetrievalConfig"] = None,
        doc_form: Optional[str] = None,
        doc_language: str = "English",
        batch: Optional[str] = None,
    ) -> Tuple[Document, DocumentIngestJob | None, str]:
        """按本地 file_path 创建文档并入队。

        返回：(document, ingest_job, batch_id)
        """
        # 避免循环依赖，在运行时导入类型
        from app.models.knowledge_entities import ProcessRule, RetrievalConfig  # noqa: WPS433

        # 类型提示仅为 IDE 友好，这里做一次运行时校验
        if process_rule is not None and not isinstance(process_rule, ProcessRule):
            raise TypeError("process_rule must be a ProcessRule or None")
        if retrieval_model is not None and not isinstance(retrieval_model, RetrievalConfig):
            raise TypeError("retrieval_model must be a RetrievalConfig or None")

        kb_id = kb.id
        rule = self._ensure_kb_process_rule(db=db, kb_id=kb_id, process_rule=process_rule)

        if retrieval_model is not None:
            kb.retrieval_model = json.dumps(retrieval_model.model_dump(mode="json"), ensure_ascii=False)

        batch_id = batch or uuid.uuid4().hex
        position = (
            db.query(Document)
            .filter(Document.knowledge_base_id == kb_id, Document.batch == batch_id)
            .count()
            + 1
        )

        document = Document(
            knowledge_base_id=kb_id,
            filename=name or Path(file_path).name,
            file_type=file_type,
            file_path=file_path,
            json_path="",
            status="queued",
            indexing_status="waiting",
            doc_form=doc_form or kb.doc_form,
            doc_language=doc_language,
            data_source_type="upload_file",
            data_source_info=json.dumps({"file_path": file_path}, ensure_ascii=False),
            process_rule_id=rule.id,
            batch=batch_id,
            position=position,
            created_from="upload_file",
            enabled=True,
            archived=False,
        )
        db.add(document)
        db.flush()

        job = self.ingest_queue_service.enqueue_document(
            db,
            document.id,
            processing_mode=settings.ingest_default_mode,
        )
        db.commit()
        db.refresh(document)
        db.refresh(job)

        return document, job, batch_id

