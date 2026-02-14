"""Standalone ingest worker process."""
from __future__ import annotations

import asyncio
import os
import signal
import sys
from pathlib import Path

# Add parent directory to sys.path to enable imports (QAnything style)
current_script_path = Path(__file__).resolve()
backend_dir = current_script_path.parent.parent  # Go up from workers/ to backend/
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

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
        document_logger.info("Ingest worker started: %s (poll_interval=%.2fs)", self.worker_id, self.poll_interval)
        while not self._stopping:
            db = SessionLocal()
            try:
                processed = await self.queue_service.process_next_job(db, self.worker_id)
                if processed:
                    document_logger.debug("Worker %s processed a job", self.worker_id)
            except Exception as exc:  # noqa: BLE001
                document_logger.error("Ingest worker loop error: %s", exc, exc_info=True)
                processed = False
            finally:
                db.close()

            # QAnything style: sleep 0.1s if processed, 3s if no job
            sleep_time = 0.1 if processed else self.poll_interval
            await asyncio.sleep(sleep_time)

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
