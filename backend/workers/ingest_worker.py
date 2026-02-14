"""Standalone ingest worker process."""
from __future__ import annotations

import asyncio
import os
import signal
import sys

from core.config import settings
from core.database import SessionLocal, init_db
from services.ingest_queue_service import IngestQueueService
from utils.logging import document_logger


class IngestWorker:
    def __init__(self):
        self.worker_id = f"ingest-worker-{os.getpid()}"
        self.poll_interval = max(float(settings.ingest_queue_poll_interval), 0.2)
        self.queue_service = IngestQueueService()
        self._stopping = False

    def stop(self, *_args):
        self._stopping = True

    async def run(self):
        document_logger.info("Ingest worker started: %s", self.worker_id)
        while not self._stopping:
            db = SessionLocal()
            try:
                processed = await self.queue_service.process_next_job(db, self.worker_id)
            except Exception as exc:  # noqa: BLE001
                document_logger.error("Ingest worker loop error: %s", exc)
                processed = False
            finally:
                db.close()

            await asyncio.sleep(0.05 if processed else self.poll_interval)

        document_logger.info("Ingest worker stopped: %s", self.worker_id)


def main():
    init_db()

    worker = IngestWorker()
    signal.signal(signal.SIGINT, worker.stop)
    signal.signal(signal.SIGTERM, worker.stop)

    try:
        asyncio.run(worker.run())
    except KeyboardInterrupt:
        worker.stop()
    except Exception as exc:  # noqa: BLE001
        document_logger.error("Ingest worker fatal error: %s", exc)
        sys.exit(1)


if __name__ == "__main__":
    main()
