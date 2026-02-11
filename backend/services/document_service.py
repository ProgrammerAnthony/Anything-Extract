"""文档处理服务"""
from pathlib import Path
from typing import Dict, Any
import json
import time

from core.config import settings
from utils.document_parser import DocumentParser
from utils.text_splitter import TextSplitter
from utils.logging import document_logger


class DocumentService:
    """文档处理服务"""
    
    def __init__(self):
        self.parser = DocumentParser()
        self.splitter = TextSplitter(
            chunk_size=settings.chunk_size,
            chunk_overlap=settings.chunk_overlap
        )
    
    async def process_document(self, file_path: str, file_type: str) -> Dict[str, Any]:
        """处理文档"""
        start_time = time.time()
        document_logger.info(f"开始处理文档: {file_path}, 类型: {file_type}")
        
        # 解析文档
        parse_start = time.time()
        parsed_doc = await self.parser.parse(file_path, file_type)
        parse_time = time.time() - parse_start
        document_logger.info(f"文档解析完成，耗时: {parse_time:.2f}秒，页数: {len(parsed_doc.get('pages', []))}")
        
        # 按页面分块处理
        split_start = time.time()
        pages_with_chunks = []
        all_chunks = []
        total_word_count = 0
        
        for page in parsed_doc["pages"]:
            page_number = page["page_number"]
            page_content = page["content"]
            
            # 对每页内容进行分块
            page_chunks = self.splitter.split_text(page_content)
            
            # 为每个chunk添加页面信息
            page_chunks_with_metadata = []
            for chunk_index, chunk in enumerate(page_chunks):
                chunk_id = f"{parsed_doc['id']}_p{page_number}_c{chunk_index}"
                page_chunks_with_metadata.append({
                    "chunk_id": chunk_id,
                    "page_number": page_number,
                    "chunk_index": chunk_index,
                    "content": chunk
                })
                all_chunks.append(chunk)
            
            pages_with_chunks.append({
                "page_number": page_number,
                "content": page_content,
                "chunks": page_chunks_with_metadata,
                "chunk_count": len(page_chunks)
            })
            
            total_word_count += len(page_content.split())
        
        # 构建文档 JSON
        doc_json = {
            "id": parsed_doc.get("id"),
            "title": parsed_doc.get("title", Path(file_path).stem),
            "pages": pages_with_chunks,
            "metadata": parsed_doc.get("metadata", {}),
            "word_count": total_word_count,
            "chunk_count": len(all_chunks),
            "page_count": len(pages_with_chunks)
        }
        
        split_time = time.time() - split_start
        document_logger.info(f"文档分块完成，耗时: {split_time:.2f}秒，总chunks: {len(all_chunks)}")
        
        # 保存文档 JSON
        save_start = time.time()
        doc_path = Path(settings.documents_path)
        doc_path.mkdir(parents=True, exist_ok=True)
        
        json_path = doc_path / f"{doc_json['id']}.json"
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(doc_json, f, ensure_ascii=False, indent=2)
        
        save_time = time.time() - save_start
        total_time = time.time() - start_time
        document_logger.info(f"文档处理完成，总耗时: {total_time:.2f}秒 (解析: {parse_time:.2f}s, 分块: {split_time:.2f}s, 保存: {save_time:.2f}s)")
        
        return {
            "json_path": str(json_path),
            "document": doc_json
        }

