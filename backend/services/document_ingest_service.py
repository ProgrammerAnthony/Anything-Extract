"""Document ingest execution helpers."""
import json
from typing import Dict, Any

from sqlalchemy.orm import Session

from core.database import Document
from services.document_service import DocumentService
from services.embedding_service import EmbeddingService
from utils.logging import document_logger


class DocumentIngestService:
    """Execute parse/split/embed for a document."""

    def __init__(self):
        self.document_service = DocumentService()
        self.embedding_service = EmbeddingService()

    async def ingest_document(self, db: Session, document: Document) -> Dict[str, Any]:
        result = await self.document_service.process_document(document.file_path, document.file_type)

        document.json_path = result["json_path"]
        document.document_metadata = json.dumps(result["document"].get("metadata", {}), ensure_ascii=False)

        all_chunks_data = []
        for page in result["document"]["pages"]:
            for chunk_data in page["chunks"]:
                all_chunks_data.append(
                    {
                        "chunk_id": chunk_data["chunk_id"],
                        "content": chunk_data["content"],
                        "page_number": chunk_data["page_number"],
                        "chunk_index": chunk_data["chunk_index"],
                    }
                )

        document_logger.info(
            "???????: %s, chunks=%s",
            document.id,
            len(all_chunks_data),
        )
        await self.embedding_service.embed_document(
            document_id=document.id,
            chunks_data=all_chunks_data,
            metadata={"document_id": document.id},
        )

        document.status = "completed"
        db.flush()
        return result
