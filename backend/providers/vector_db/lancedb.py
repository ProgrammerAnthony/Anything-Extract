"""LanceDB Vector Database Provider"""
from typing import List, Dict, Any, Optional
import lancedb
import pyarrow as pa
import logging

from providers.vector_db.base import VectorDBProvider
from core.config import settings

logger = logging.getLogger(__name__)


class LanceDBProvider(VectorDBProvider):
    """LanceDB Provider"""
    
    def __init__(self, db_path: str, table_name: str = "documents", expected_dimension: Optional[int] = None):
        self.db_path = db_path
        self.table_name = table_name
        self.db = lancedb.connect(db_path)
        self.expected_dimension = expected_dimension
        self._ensure_table()
    
    def get_current_dimension(self) -> Optional[int]:
        """获取当前表中向量的维度"""
        if self.table_name not in self.db.table_names():
            return None
        
        try:
            table = self.db.open_table(self.table_name)
            schema = table.schema
            
            # 查找 vector 字段
            for field in schema:
                if field.name == "vector":
                    # 获取 fixed_size_list 的 size
                    if isinstance(field.type, pa.FixedSizeListType):
                        return field.type.list_size
                    elif isinstance(field.type, pa.ListType):
                        # 如果是可变长度列表，尝试从数据中获取
                        try:
                            # 读取第一条记录获取维度
                            df = table.head(1).to_pandas()
                            if not df.empty and "vector" in df.columns:
                                vector = df.iloc[0]["vector"]
                                if vector is not None:
                                    return len(vector)
                        except Exception:
                            pass
            return None
        except Exception as e:
            logger.warning(f"无法获取当前向量维度: {e}")
            return None
    
    def _ensure_table(self, dimension: Optional[int] = None):
        """确保表存在，如果存在但缺少字段或维度不匹配则重建
        
        Args:
            dimension: 期望的向量维度，如果为 None 则使用 expected_dimension
        """
        if dimension is None:
            dimension = self.expected_dimension or 768  # 默认 768
        
        if self.table_name not in self.db.table_names():
            # 创建新表
            schema = pa.schema([
                pa.field("vector", pa.list_(pa.float32(), dimension)),
                pa.field("text", pa.string()),
                pa.field("document_id", pa.string()),
                pa.field("chunk_index", pa.int32()),
                pa.field("page_number", pa.int32()),
                pa.field("chunk_id", pa.string()),
                pa.field("metadata", pa.string())
            ])
            self.db.create_table(self.table_name, schema=schema, mode="overwrite")
            logger.info(f"创建向量表，维度: {dimension}")
        else:
            # 检查表结构
            table = self.db.open_table(self.table_name)
            schema = table.schema
            field_names = [field.name for field in schema]
            
            # 检查维度是否匹配
            current_dim = self.get_current_dimension()
            needs_rebuild = False
            rebuild_reason = []
            
            # 检查维度是否匹配
            if current_dim is not None and current_dim != dimension:
                needs_rebuild = True
                rebuild_reason.append(f"维度不匹配: 当前 {current_dim} 维，期望 {dimension} 维")
                logger.warning(
                    f"⚠️  向量维度不匹配！当前数据库使用 {current_dim} 维向量，"
                    f"但配置的模型生成 {dimension} 维向量。"
                    f"这通常是因为切换了 embedding 模型。"
                    f"需要重新向量化所有文档。"
                )
            
            # 检查是否缺少 page_number 字段
            if "page_number" not in field_names:
                needs_rebuild = True
                rebuild_reason.append("缺少 page_number 字段")
            
            if needs_rebuild:
                logger.warning(f"需要重建向量表，原因: {', '.join(rebuild_reason)}")
                logger.warning("⚠️  重建表将删除所有现有向量数据！")
                logger.warning("   如果切换了 embedding 模型，这是正常的，需要重新上传文档进行向量化。")
                
                # 删除旧表并创建新表
                self.db.drop_table(self.table_name)
                schema = pa.schema([
                    pa.field("vector", pa.list_(pa.float32(), dimension)),
                    pa.field("text", pa.string()),
                    pa.field("document_id", pa.string()),
                    pa.field("chunk_index", pa.int32()),
                    pa.field("page_number", pa.int32()),
                    pa.field("chunk_id", pa.string()),
                    pa.field("metadata", pa.string())
                ])
                self.db.create_table(self.table_name, schema=schema, mode="overwrite")
                logger.info(f"已重建向量表，新维度: {dimension}")
    
    def check_dimension_match(self, query_dimension: int) -> bool:
        """检查查询向量维度是否与数据库匹配
        
        Args:
            query_dimension: 查询向量的维度
            
        Returns:
            是否匹配
        """
        current_dim = self.get_current_dimension()
        if current_dim is None:
            return True  # 表为空，可以接受任何维度
        
        if current_dim != query_dimension:
            logger.error(
                f"❌ 向量维度不匹配！"
                f"数据库中的向量是 {current_dim} 维，"
                f"但查询向量是 {query_dimension} 维。"
                f"这通常是因为切换了 embedding 模型。"
                f"请重新向量化所有文档或切换回原来的 embedding 模型。"
            )
            return False
        return True
    
    async def add_documents(
        self,
        vectors: List[List[float]],
        texts: List[str],
        metadata: List[Dict[str, Any]]
    ):
        """添加文档向量"""
        import json
        
        table = self.db.open_table(self.table_name)
        
        data = []
        for i, (vector, text, meta) in enumerate(zip(vectors, texts, metadata)):
            data.append({
                "vector": vector,
                "text": text,
                "document_id": meta.get("document_id", ""),
                "chunk_index": meta.get("chunk_index", i),
                "page_number": meta.get("page_number", 0),
                "chunk_id": meta.get("chunk_id", f"{meta.get('document_id', '')}_{i}"),
                "metadata": json.dumps(meta)
            })
        
        table.add(data)
    
    async def search(
        self,
        query_vector: List[float],
        top_k: int = 5,
        filter: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """搜索相似向量"""
        import json
        
        # 检查维度是否匹配
        query_dim = len(query_vector)
        if not self.check_dimension_match(query_dim):
            raise ValueError(
                f"向量维度不匹配: 查询向量是 {query_dim} 维，"
                f"但数据库中的向量是 {self.get_current_dimension()} 维。"
                f"请检查 embedding 模型配置是否与数据库中的向量匹配。"
            )
        
        table = self.db.open_table(self.table_name)
        
        # 构建查询
        query = table.search(query_vector).limit(top_k)
        
        # 应用过滤
        if filter:
            for key, value in filter.items():
                query = query.where(f"{key} = '{value}'")
        
        # 执行搜索
        results = query.to_pandas()
        
        # 格式化结果
        formatted_results = []
        for _, row in results.iterrows():
            # 优先使用metadata中的chunk_id，如果没有则使用表中的chunk_id字段，最后才构造
            meta = json.loads(row["metadata"]) if row["metadata"] else {}
            chunk_id = meta.get("chunk_id") or row.get("chunk_id") or f"{row['document_id']}_p{row.get('page_number', 0)}_c{row['chunk_index']}"
            
            formatted_results.append({
                "chunk_id": chunk_id,
                "content": row["text"],
                "similarity": 1 - row["_distance"] if "_distance" in row else 0.0,
                "metadata": {
                    **meta,
                    "page_number": row.get("page_number", meta.get("page_number", 0)),
                    "chunk_index": row.get("chunk_index", meta.get("chunk_index", 0))
                }
            })
        
        return formatted_results
    
    async def delete_by_document_id(self, document_id: str):
        """根据文档ID删除所有相关向量"""
        try:
            table = self.db.open_table(self.table_name)
            # LanceDB的delete方法使用where条件
            table.delete(f"document_id = '{document_id}'")
        except Exception as e:
            # 如果表不存在或删除失败，记录警告但不抛出异常
            import logging
            logging.warning(f"删除向量数据失败 (document_id={document_id}): {str(e)}")

