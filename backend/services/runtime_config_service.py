"""Runtime system config service with local persistence."""
from __future__ import annotations

import json
from pathlib import Path
from threading import Lock
from typing import Any, Dict

from core.config import settings


VALID_PARSER_MODES = {"local", "server", "hybrid"}
VALID_MODEL_SOURCES = {"docker-model", "local-model"}


class RuntimeConfigService:
    """Manage mutable system config for parser-related stage features."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._file_path = Path(settings.parser_runtime_config_path)
        self._config = self._build_default_config()
        self._load_from_disk()

    def _build_default_config(self) -> Dict[str, Any]:
        return {
            "parser": {
                "mode": self._normalize_parser_mode(settings.parser_mode),
                "enable_ocr_server": bool(settings.enable_ocr_server),
                "enable_pdf_parser_server": bool(settings.enable_pdf_parser_server),
                "ocr_server_url": settings.ocr_server_url.rstrip("/"),
                "pdf_parser_server_url": settings.pdf_parser_server_url.rstrip("/"),
                "model_source": self._normalize_model_source(settings.qanything_model_source),
            }
        }

    def _normalize_parser_mode(self, parser_mode: str) -> str:
        normalized = (parser_mode or "local").strip().lower()
        if normalized not in VALID_PARSER_MODES:
            return "local"
        return normalized

    def _normalize_model_source(self, model_source: str) -> str:
        normalized = (model_source or "docker-model").strip().lower()
        if normalized not in VALID_MODEL_SOURCES:
            return "docker-model"
        return normalized

    def _load_from_disk(self) -> None:
        if not self._file_path.exists():
            return

        try:
            raw = json.loads(self._file_path.read_text(encoding="utf-8"))
            parser_data = raw.get("parser", {}) if isinstance(raw, dict) else {}
            self._config["parser"].update(
                {
                    "mode": self._normalize_parser_mode(parser_data.get("mode", self._config["parser"]["mode"])),
                    "enable_ocr_server": bool(
                        parser_data.get("enable_ocr_server", self._config["parser"]["enable_ocr_server"])
                    ),
                    "enable_pdf_parser_server": bool(
                        parser_data.get(
                            "enable_pdf_parser_server",
                            self._config["parser"]["enable_pdf_parser_server"],
                        )
                    ),
                    "ocr_server_url": str(
                        parser_data.get("ocr_server_url", self._config["parser"]["ocr_server_url"])
                    ).rstrip("/"),
                    "pdf_parser_server_url": str(
                        parser_data.get("pdf_parser_server_url", self._config["parser"]["pdf_parser_server_url"])
                    ).rstrip("/"),
                    "model_source": self._normalize_model_source(
                        parser_data.get("model_source", self._config["parser"]["model_source"])
                    ),
                }
            )
        except Exception:
            # keep defaults when runtime file is corrupted
            pass

    def _persist(self) -> None:
        self._file_path.parent.mkdir(parents=True, exist_ok=True)
        self._file_path.write_text(
            json.dumps(self._config, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def get_snapshot(self) -> Dict[str, Any]:
        with self._lock:
            return json.loads(json.dumps(self._config))

    def get_parser_config(self) -> Dict[str, Any]:
        return self.get_snapshot()["parser"]

    def update_parser_config(self, parser_payload: Dict[str, Any]) -> Dict[str, Any]:
        payload = parser_payload or {}
        with self._lock:
            parser_config = self._config["parser"]

            if "mode" in payload and payload["mode"] is not None:
                mode = str(payload["mode"]).strip().lower()
                if mode not in VALID_PARSER_MODES:
                    raise ValueError("解析策略仅支持: local, server, hybrid")
                parser_config["mode"] = mode

            if "enable_ocr_server" in payload and payload["enable_ocr_server"] is not None:
                parser_config["enable_ocr_server"] = bool(payload["enable_ocr_server"])

            if "enable_pdf_parser_server" in payload and payload["enable_pdf_parser_server"] is not None:
                parser_config["enable_pdf_parser_server"] = bool(payload["enable_pdf_parser_server"])

            if "ocr_server_url" in payload and payload["ocr_server_url"]:
                parser_config["ocr_server_url"] = str(payload["ocr_server_url"]).strip().rstrip("/")

            if "pdf_parser_server_url" in payload and payload["pdf_parser_server_url"]:
                parser_config["pdf_parser_server_url"] = str(payload["pdf_parser_server_url"]).strip().rstrip("/")

            if "model_source" in payload and payload["model_source"] is not None:
                model_source = str(payload["model_source"]).strip().lower()
                if model_source not in VALID_MODEL_SOURCES:
                    raise ValueError("模型来源仅支持: docker-model, local-model")
                parser_config["model_source"] = model_source

            self._persist()
            return json.loads(json.dumps(parser_config))


runtime_config_service = RuntimeConfigService()

