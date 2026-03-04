"""LanceDB Provider（支持向量检索 + 全文检索）。"""
from __future__ import annotations

import json
import logging
from typing import Any, Optional

import lancedb
import pyarrow as pa

from providers.vector_db.base import VectorDBProvider

logger = logging.getLogger(__name__)


class LanceDBProvider(VectorDBProvider):
    """LanceDB 向量数据库实现。"""

    def __init__(self, db_path: str, table_name: str = "documents", expected_dimension: Optional[int] = None):
        self.db_path = db_path
        self.table_name = table_name
        self.db = lancedb.connect(db_path)
        self.expected_dimension = expected_dimension
        self._fts_ready = False
        self._ensure_table(dimension=expected_dimension)

    def get_current_dimension(self) -> Optional[int]:
        if self.table_name not in self.db.table_names():
            return None

        try:
            table = self.db.open_table(self.table_name)
            vector_field = table.schema.field("vector")
            if isinstance(vector_field.type, pa.FixedSizeListType):
                return vector_field.type.list_size
            if isinstance(vector_field.type, pa.ListType):
                df = table.head(1).to_pandas()
                if not df.empty and "vector" in df.columns and df.iloc[0]["vector"] is not None:
                    return len(df.iloc[0]["vector"])
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed to get LanceDB vector dimension: %s", exc)

        return None

    def _ensure_table(self, dimension: Optional[int] = None) -> None:
        dim = dimension or self.expected_dimension or 768

        if self.table_name not in self.db.table_names():
            schema = pa.schema(
                [
                    pa.field("vector", pa.list_(pa.float32(), dim)),
                    pa.field("text", pa.string()),
                    pa.field("knowledge_base_id", pa.string()),
                    pa.field("document_id", pa.string()),
                    pa.field("index_node_id", pa.string()),
                    pa.field("chunk_index", pa.int32()),
                    pa.field("page_number", pa.int32()),
                    pa.field("chunk_id", pa.string()),
                    pa.field("metadata", pa.string()),
                ]
            )
            self.db.create_table(self.table_name, schema=schema, mode="overwrite")
            logger.info("Created LanceDB table: %s (dim=%s)", self.table_name, dim)
            return

        table = self.db.open_table(self.table_name)
        fields = {field.name for field in table.schema}
        required_fields = {
            "vector",
            "text",
            "knowledge_base_id",
            "document_id",
            "index_node_id",
            "chunk_index",
            "page_number",
            "chunk_id",
            "metadata",
        }

        current_dim = self.get_current_dimension()
        requires_rebuild = False
        reasons: list[str] = []

        if current_dim is not None and current_dim != dim:
            requires_rebuild = True
            reasons.append(f"dimension mismatch ({current_dim} -> {dim})")

        if not required_fields.issubset(fields):
            requires_rebuild = True
            missing = sorted(required_fields - fields)
            reasons.append(f"missing fields: {', '.join(missing)}")

        if requires_rebuild:
            logger.warning("Rebuilding LanceDB table %s: %s", self.table_name, "; ".join(reasons))
            self.db.drop_table(self.table_name)
            schema = pa.schema(
                [
                    pa.field("vector", pa.list_(pa.float32(), dim)),
                    pa.field("text", pa.string()),
                    pa.field("knowledge_base_id", pa.string()),
                    pa.field("document_id", pa.string()),
                    pa.field("index_node_id", pa.string()),
                    pa.field("chunk_index", pa.int32()),
                    pa.field("page_number", pa.int32()),
                    pa.field("chunk_id", pa.string()),
                    pa.field("metadata", pa.string()),
                ]
            )
            self.db.create_table(self.table_name, schema=schema, mode="overwrite")
            self._fts_ready = False

    async def add_documents(
        self,
        vectors: list[list[float]],
        texts: list[str],
        metadata: list[dict[str, Any]],
    ):
        if not vectors:
            return

        vector_dim = len(vectors[0])
        if self.expected_dimension != vector_dim:
            self.expected_dimension = vector_dim
            self._ensure_table(dimension=vector_dim)

        table = self.db.open_table(self.table_name)
        data = []
        for i, (vector, text, meta) in enumerate(zip(vectors, texts, metadata)):
            data.append(
                {
                    "vector": vector,
                    "text": text,
                    "knowledge_base_id": str(meta.get("knowledge_base_id") or ""),
                    "document_id": str(meta.get("document_id") or ""),
                    "index_node_id": str(meta.get("index_node_id") or meta.get("chunk_id") or ""),
                    "chunk_index": int(meta.get("chunk_index") or i),
                    "page_number": int(meta.get("page_number") or 0),
                    "chunk_id": str(meta.get("chunk_id") or meta.get("index_node_id") or ""),
                    "metadata": json.dumps(meta, ensure_ascii=False),
                }
            )

        table.add(data)
        self._ensure_fts_index(table)

    async def search(
        self,
        query_vector: list[float],
        top_k: int = 5,
        filter: Optional[dict[str, Any]] = None,
    ) -> list[dict[str, Any]]:
        if not query_vector:
            return []

        query_dim = len(query_vector)
        current_dim = self.get_current_dimension()
        if current_dim is not None and current_dim != query_dim:
            raise ValueError(f"vector dimension mismatch: db={current_dim}, query={query_dim}")

        table = self.db.open_table(self.table_name)
        query_builder = table.search(query_vector).limit(top_k)
        query_builder = self._apply_filter(query_builder, filter)

        results_df = query_builder.to_pandas()
        return [self._to_result_row(row) for _, row in results_df.iterrows()]

    async def search_by_full_text(
        self,
        query: str,
        top_k: int = 5,
        filter: Optional[dict[str, Any]] = None,
    ) -> list[dict[str, Any]]:
        if not query.strip():
            return []

        table = self.db.open_table(self.table_name)
        self._ensure_fts_index(table)

        query_builder = table.search(query).limit(top_k)
        query_builder = self._apply_filter(query_builder, filter)

        results_df = query_builder.to_pandas()
        return [self._to_result_row(row) for _, row in results_df.iterrows()]

    async def delete_by_document_id(self, document_id: str):
        if not document_id:
            return
        try:
            table = self.db.open_table(self.table_name)
            safe_value = document_id.replace("'", "''")
            table.delete(f"document_id = '{safe_value}'")
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed to delete vectors by document_id=%s: %s", document_id, exc)

    async def delete_by_knowledge_base_id(self, knowledge_base_id: str):
        if not knowledge_base_id:
            return
        try:
            table = self.db.open_table(self.table_name)
            safe_value = knowledge_base_id.replace("'", "''")
            table.delete(f"knowledge_base_id = '{safe_value}'")
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed to delete vectors by knowledge_base_id=%s: %s", knowledge_base_id, exc)

    async def delete_by_index_node_ids(self, index_node_ids: list[str]):
        if not index_node_ids:
            return

        cleaned_ids = [item for item in index_node_ids if item]
        if not cleaned_ids:
            return

        try:
            table = self.db.open_table(self.table_name)
            safe_values = [item.replace("'", "''") for item in cleaned_ids]
            in_values = ", ".join([f"'{item}'" for item in safe_values])
            table.delete(f"index_node_id IN ({in_values}) OR chunk_id IN ({in_values})")
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed to delete vectors by index_node_ids=%s: %s", cleaned_ids, exc)

    def _ensure_fts_index(self, table) -> None:
        if self._fts_ready:
            return
        try:
            table.create_fts_index("text", replace=True)
            self._fts_ready = True
        except Exception as exc:  # noqa: BLE001
            # 某些 LanceDB 版本不支持/已存在索引都不影响主流程
            logger.debug("Failed to create FTS index (ignored): %s", exc)

    def _apply_filter(self, query_builder, filter_dict: Optional[dict[str, Any]]):
        if not filter_dict:
            return query_builder

        expressions: list[str] = []
        for key, value in filter_dict.items():
            if value is None:
                continue
            safe_key = str(key)
            if isinstance(value, str):
                safe_value = value.replace("'", "''")
                expressions.append(f"{safe_key} = '{safe_value}'")
            elif isinstance(value, list):
                safe_values = [str(item).replace("'", "''") for item in value if item is not None]
                if safe_values:
                    in_values = ", ".join([f"'{item}'" for item in safe_values])
                    expressions.append(f"{safe_key} IN ({in_values})")
            else:
                expressions.append(f"{safe_key} = {value}")

        if expressions:
            where_clause = " AND ".join(expressions)
            query_builder = query_builder.where(where_clause)

        return query_builder

    def _to_result_row(self, row) -> dict[str, Any]:
        metadata = {}
        if row.get("metadata"):
            try:
                metadata = json.loads(row["metadata"])
            except json.JSONDecodeError:
                metadata = {}

        chunk_id = metadata.get("chunk_id") or row.get("chunk_id") or row.get("index_node_id")
        index_node_id = metadata.get("index_node_id") or row.get("index_node_id") or chunk_id

        similarity = 0.0
        if "_distance" in row and row["_distance"] is not None:
            # 向量检索通常返回距离，转换为“越大越相似”的分值。
            similarity = 1 - float(row["_distance"])
        elif "_score" in row and row["_score"] is not None:
            # 全文检索通常返回 BM25 分数，直接作为排序分值使用。
            similarity = float(row["_score"])

        metadata.update(
            {
                "knowledge_base_id": row.get("knowledge_base_id") or metadata.get("knowledge_base_id"),
                "document_id": row.get("document_id") or metadata.get("document_id"),
                "index_node_id": index_node_id,
                "chunk_index": row.get("chunk_index") if row.get("chunk_index") is not None else metadata.get("chunk_index"),
                "page_number": row.get("page_number") if row.get("page_number") is not None else metadata.get("page_number"),
            }
        )

        return {
            "chunk_id": chunk_id,
            "content": row.get("text") or "",
            "similarity": similarity,
            "metadata": metadata,
        }
