"""Stage 2 ingest queue service (QAnything insert_files_serve style)."""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Dict, Optional
import traceback

from sqlalchemy.orm import Session

from core.config import settings
from core.database import Document, DocumentIngestJob
from services.document_ingest_service import DocumentIngestService
from utils.logging import document_logger, debug_logger

VALID_JOB_STATUSES = {"queued", "processing", "completed", "failed"}


class IngestQueueService:
    """Queue orchestration and worker-safe job transitions."""

    def __init__(self):
        self.max_attempts = max(1, int(settings.ingest_job_max_attempts))
        self.lock_timeout_seconds = max(30, int(settings.ingest_job_lock_timeout_seconds))
        self._ingest_service: Optional[DocumentIngestService] = None


    @property
    def ingest_service(self) -> DocumentIngestService:
        if self._ingest_service is None:
            self._ingest_service = DocumentIngestService()
        return self._ingest_service

    def normalize_mode(self, processing_mode: Optional[str]) -> str:
        mode = (processing_mode or settings.ingest_default_mode or "queue").strip().lower()
        if mode not in {"queue", "immediate"}:
            raise ValueError("processing_mode must be one of: queue, immediate")
        return mode

    def enqueue_document(self, db: Session, document_id: str, processing_mode: str = "queue") -> DocumentIngestJob:
        mode = self.normalize_mode(processing_mode)
        job = db.query(DocumentIngestJob).filter(DocumentIngestJob.document_id == document_id).first()
        if job:
            job.status = "queued"
            job.error_msg = None
            job.processing_mode = mode
            job.worker_id = None
            job.finished_at = None
            job.started_at = None
            job.max_attempts = self.max_attempts
        else:
            job = DocumentIngestJob(
                document_id=document_id,
                status="queued",
                attempts=0,
                max_attempts=self.max_attempts,
                processing_mode=mode,
            )
            db.add(job)

        document = db.query(Document).filter(Document.id == document_id).first()
        if document:
            document.status = "queued"

        db.flush()
        return job

    def get_job_for_document(self, db: Session, document_id: str) -> Optional[DocumentIngestJob]:
        return db.query(DocumentIngestJob).filter(DocumentIngestJob.document_id == document_id).first()

    def serialize_job(self, job: Optional[DocumentIngestJob]) -> Optional[Dict[str, object]]:
        if not job:
            return None
        return {
            "id": job.id,
            "document_id": job.document_id,
            "status": job.status,
            "attempts": job.attempts,
            "max_attempts": job.max_attempts,
            "error_msg": job.error_msg,
            "worker_id": job.worker_id,
            "processing_mode": job.processing_mode,
            "created_at": job.created_at.isoformat() if job.created_at else None,
            "updated_at": job.updated_at.isoformat() if job.updated_at else None,
            "started_at": job.started_at.isoformat() if job.started_at else None,
            "finished_at": job.finished_at.isoformat() if job.finished_at else None,
        }

    def _requeue_stale_processing_jobs(self, db: Session) -> None:
        lock_deadline = datetime.utcnow() - timedelta(seconds=self.lock_timeout_seconds)
        stale_jobs = (
            db.query(DocumentIngestJob)
            .filter(
                DocumentIngestJob.status == "processing",
                DocumentIngestJob.started_at.isnot(None),
                DocumentIngestJob.started_at < lock_deadline,
            )
            .all()
        )
        for job in stale_jobs:
            document_logger.warning("Requeue stale ingest job: %s", job.id)
            if job.attempts >= job.max_attempts:
                job.status = "failed"
                job.error_msg = "ingest worker timeout"
                job.finished_at = datetime.utcnow()
                document = db.query(Document).filter(Document.id == job.document_id).first()
                if document:
                    document.status = "failed"
                continue

            job.status = "queued"
            job.worker_id = None
            job.started_at = None
            job.error_msg = "job timed out in previous worker"
            document = db.query(Document).filter(Document.id == job.document_id).first()
            if document:
                document.status = "queued"

        if stale_jobs:
            db.commit()

    def claim_next_job(self, db: Session, worker_id: str) -> Optional[DocumentIngestJob]:
        self._requeue_stale_processing_jobs(db)

        queued_jobs = (
            db.query(DocumentIngestJob)
            .filter(DocumentIngestJob.status == "queued")
            .order_by(DocumentIngestJob.created_at.asc())
            .limit(20)
            .all()
        )
        for candidate in queued_jobs:
            now = datetime.utcnow()
            updated = (
                db.query(DocumentIngestJob)
                .filter(
                    DocumentIngestJob.id == candidate.id,
                    DocumentIngestJob.status == "queued",
                )
                .update(
                    {
                        DocumentIngestJob.status: "processing",
                        DocumentIngestJob.worker_id: worker_id,
                        DocumentIngestJob.started_at: now,
                        DocumentIngestJob.finished_at: None,
                        DocumentIngestJob.error_msg: None,
                        DocumentIngestJob.attempts: candidate.attempts + 1,
                    },
                    synchronize_session=False,
                )
            )
            if not updated:
                db.rollback()
                continue

            document = db.query(Document).filter(Document.id == candidate.document_id).first()
            if document:
                document.status = "processing"
            db.commit()
            return db.query(DocumentIngestJob).filter(DocumentIngestJob.id == candidate.id).first()

        return None

    def _mark_job_failed_or_retry(self, db: Session, job_id: str, error_msg: str) -> None:
        job = db.query(DocumentIngestJob).filter(DocumentIngestJob.id == job_id).first()
        if not job:
            return

        document = db.query(Document).filter(Document.id == job.document_id).first()
        safe_error = (error_msg or "unknown ingest error")[:4000]

        if job.attempts >= job.max_attempts:
            job.status = "failed"
            job.error_msg = safe_error
            job.finished_at = datetime.utcnow()
            job.worker_id = None
            if document:
                document.status = "failed"
            document_logger.error("Ingest failed permanently: job=%s err=%s", job.id, safe_error)
        else:
            job.status = "queued"
            job.error_msg = safe_error
            job.worker_id = None
            job.started_at = None
            if document:
                document.status = "queued"
            document_logger.warning(
                "Ingest failed and requeued: job=%s attempts=%s/%s",
                job.id,
                job.attempts,
                job.max_attempts,
            )

        db.commit()

    async def process_job(self, db: Session, job: DocumentIngestJob) -> None:
        document = db.query(Document).filter(Document.id == job.document_id).first()
        if not document:
            self._mark_job_failed_or_retry(db, job.id, "document not found")
            return

        try:
            await self.ingest_service.ingest_document(db, document)
            job = db.query(DocumentIngestJob).filter(DocumentIngestJob.id == job.id).first()
            if not job:
                return
            job.status = "completed"
            job.error_msg = None
            job.worker_id = None
            job.finished_at = datetime.utcnow()
            document.status = "completed"
            db.commit()
            document_logger.info("Ingest completed: document=%s job=%s", document.id, job.id)
        except Exception as exc:  # noqa: BLE001
            db.rollback()
            error_msg = f"{exc}\n{traceback.format_exc()}"
            debug_logger.error("Ingest processing failed: %s", error_msg)
            self._mark_job_failed_or_retry(db, job.id, str(exc))

    async def process_next_job(self, db: Session, worker_id: str) -> bool:
        job = self.claim_next_job(db, worker_id)
        if not job:
            return False

        await self.process_job(db, job)
        return True

    def retry_document_job(self, db: Session, document_id: str) -> DocumentIngestJob:
        job = self.get_job_for_document(db, document_id)
        if not job:
            raise ValueError("document ingest job not found")

        if job.status not in {"failed", "completed"}:
            raise ValueError("only failed/completed jobs can be retried")

        job.status = "queued"
        job.error_msg = None
        job.worker_id = None
        job.started_at = None
        job.finished_at = None
        job.attempts = 0
        job.max_attempts = self.max_attempts

        document = db.query(Document).filter(Document.id == document_id).first()
        if document:
            document.status = "queued"

        db.flush()
        return job
