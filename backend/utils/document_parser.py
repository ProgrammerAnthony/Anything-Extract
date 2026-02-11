"""文档解析工具"""
from pathlib import Path
from typing import Dict, Any
import uuid


class DocumentParser:
    """文档解析器"""
    
    async def parse(self, file_path: str, file_type: str) -> Dict[str, Any]:
        """解析文档"""
        if file_type == "pdf":
            return await self._parse_pdf(file_path)
        elif file_type == "docx":
            return await self._parse_docx(file_path)
        else:
            raise ValueError(f"不支持的文件类型: {file_type}")
    
    async def _parse_pdf(self, file_path: str) -> Dict[str, Any]:
        """解析 PDF"""
        try:
            import PyPDF2
            
            with open(file_path, "rb") as file:
                pdf_reader = PyPDF2.PdfReader(file)
                pages = []
                
                for page_num, page in enumerate(pdf_reader.pages):
                    text = page.extract_text()
                    pages.append({
                        "page_number": page_num + 1,
                        "content": text
                    })
                
                return {
                    "id": str(uuid.uuid4()),
                    "pages": pages,
                    "title": pdf_reader.metadata.get("/Title", Path(file_path).stem) if pdf_reader.metadata else Path(file_path).stem,
                    "metadata": {
                        "page_count": len(pdf_reader.pages),
                        "author": pdf_reader.metadata.get("/Author", "") if pdf_reader.metadata else "",
                    }
                }
        except Exception as e:
            # 尝试使用 pdfplumber
            try:
                import pdfplumber
                
                pages = []
                with pdfplumber.open(file_path) as pdf:
                    for page_num, page in enumerate(pdf.pages):
                        text = page.extract_text()
                        if text:
                            pages.append({
                                "page_number": page_num + 1,
                                "content": text
                            })
                        else:
                            # 即使页面为空也保留，确保页码连续
                            pages.append({
                                "page_number": page_num + 1,
                                "content": ""
                            })
                
                return {
                    "id": str(uuid.uuid4()),
                    "pages": pages,
                    "title": Path(file_path).stem,
                    "metadata": {
                        "page_count": len(pdf.pages)
                    }
                }
            except Exception as e2:
                raise Exception(f"PDF 解析失败: {str(e2)}")
    
    async def _parse_docx(self, file_path: str) -> Dict[str, Any]:
        """解析 Word 文档"""
        from docx import Document as DocxDocument
        
        doc = DocxDocument(file_path)
        content = []
        
        for paragraph in doc.paragraphs:
            if paragraph.text.strip():
                content.append(paragraph.text)
        
        # Word文档将整个文档作为一页
        full_content = "\n".join(content)
        pages = [{
            "page_number": 1,
            "content": full_content
        }]
        
        return {
            "id": str(uuid.uuid4()),
            "pages": pages,
            "title": doc.core_properties.title or Path(file_path).stem,
            "metadata": {
                "author": doc.core_properties.author or "",
                "word_count": len(content),
                "page_count": 1
            }
        }

