"""Bridge for QAnything OCR/PDF parser dependent services."""
from __future__ import annotations

import json
import time
from typing import Any, Dict, List, Optional

import httpx

from utils.logging import document_logger


class QAnythingParserBridge:
    """HTTP client wrapper for OCR and PDF parser service calls."""

    async def call_ocr_server(
        self,
        img64: str,
        ocr_server_url: str,
        timeout_seconds: int = 120,
    ) -> Dict[str, Any]:
        endpoint = f"{ocr_server_url.rstrip('/')}/ocr"
        started_at = time.time()
        payload = {"img64": img64}

        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            response = await client.post(endpoint, json=payload)
            response.raise_for_status()

        elapsed_ms = int((time.time() - started_at) * 1000)
        parsed = self._safe_json(response.text)
        result = parsed.get("result")
        lines: List[str]
        if isinstance(result, list):
            lines = [str(item).strip() for item in result if str(item).strip()]
        elif isinstance(result, str):
            lines = [line.strip() for line in result.splitlines() if line.strip()]
        else:
            lines = []

        document_logger.info(
            "OCR server parsed image successfully, endpoint=%s, lines=%s, elapsed_ms=%s",
            endpoint,
            len(lines),
            elapsed_ms,
        )
        return {"lines": lines, "endpoint": endpoint, "elapsed_ms": elapsed_ms}

    async def call_pdf_parser(
        self,
        filename: str,
        save_dir: str,
        pdf_parser_server_url: str,
        timeout_seconds: int = 240,
    ) -> Dict[str, Any]:
        endpoint = f"{pdf_parser_server_url.rstrip('/')}/pdfparser"
        payload = {"filename": filename, "save_dir": save_dir}
        started_at = time.time()

        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            response = await client.post(endpoint, json=payload)
            response.raise_for_status()

        elapsed_ms = int((time.time() - started_at) * 1000)
        parsed = self._safe_json(response.text)
        markdown_file = parsed.get("markdown_file")

        document_logger.info(
            "PDF parser server call succeeded, endpoint=%s, markdown_file=%s, elapsed_ms=%s",
            endpoint,
            markdown_file,
            elapsed_ms,
        )
        return {
            "markdown_file": markdown_file,
            "endpoint": endpoint,
            "elapsed_ms": elapsed_ms,
        }

    def _safe_json(self, text: str) -> Dict[str, Any]:
        if not text:
            return {}
        try:
            raw = json.loads(text)
            return raw if isinstance(raw, dict) else {}
        except Exception:
            return {}

