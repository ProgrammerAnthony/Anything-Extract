"""文档解析工具"""

from pathlib import Path
from typing import Any, Dict, List, Optional
import uuid

from utils.loaders import CSVLoader, JSONLoader, convert_markdown_to_langchaindoc

try:
    from langchain_community.document_loaders import (
        TextLoader,
        UnstructuredEmailLoader,
        UnstructuredFileLoader,
        UnstructuredPowerPointLoader,
        UnstructuredWordDocumentLoader,
    )
except ImportError as exc:
    raise RuntimeError("缺少 langchain_community 依赖，请先安装 requirements.txt") from exc


class DocumentParser:
    """文档解析器"""

    SUPPORTED_TYPES = {
        "pdf",
        "docx",
        "txt",
        "md",
        "csv",
        "json",
        "xlsx",
        "pptx",
        "eml",
    }

    async def parse(self, file_path: str, file_type: Optional[str] = None) -> Dict[str, Any]:
        """解析文档，返回统一结构"""
        parsed_type = self._normalize_file_type(file_path, file_type)

        parser = getattr(self, f"_parse_{parsed_type}", None)
        if parser is None:
            raise ValueError(f"不支持的文件类型: {parsed_type}")

        return await parser(file_path)

    def _normalize_file_type(self, file_path: str, file_type: Optional[str]) -> str:
        if file_type:
            normalized = file_type.lower().lstrip(".")
        else:
            normalized = Path(file_path).suffix.lower().lstrip(".")

        if normalized not in self.SUPPORTED_TYPES:
            raise ValueError(f"不支持的文件类型: {normalized}")
        return normalized

    def _build_result(
        self,
        file_path: str,
        pages: List[Dict[str, Any]],
        metadata: Optional[Dict[str, Any]] = None,
        title: Optional[str] = None,
    ) -> Dict[str, Any]:
        normalized_pages: List[Dict[str, Any]] = []
        for idx, page in enumerate(pages, start=1):
            content = (page.get("content") or "").strip()
            if not content:
                continue
            normalized_pages.append({"page_number": idx, "content": content})

        if not normalized_pages:
            normalized_pages = [{"page_number": 1, "content": ""}]

        return {
            "id": str(uuid.uuid4()),
            "pages": normalized_pages,
            "title": title or Path(file_path).stem,
            "metadata": {
                "page_count": len(normalized_pages),
                **(metadata or {}),
            },
        }

    def _docs_to_pages(self, docs: List[Any]) -> List[Dict[str, Any]]:
        pages = []
        for index, doc in enumerate(docs, start=1):
            pages.append(
                {
                    "page_number": index,
                    "content": (getattr(doc, "page_content", "") or "").strip(),
                }
            )
        return pages

    async def _parse_pdf(self, file_path: str) -> Dict[str, Any]:
        try:
            import PyPDF2

            with open(file_path, "rb") as file:
                pdf_reader = PyPDF2.PdfReader(file)
                pages = []
                for page_num, page in enumerate(pdf_reader.pages, start=1):
                    pages.append({"page_number": page_num, "content": page.extract_text() or ""})

                metadata = pdf_reader.metadata or {}
                return self._build_result(
                    file_path=file_path,
                    pages=pages,
                    title=metadata.get("/Title") or Path(file_path).stem,
                    metadata={"author": metadata.get("/Author", "")},
                )
        except Exception:
            pass

        try:
            import pdfplumber

            with pdfplumber.open(file_path) as pdf:
                pages = []
                for page_num, page in enumerate(pdf.pages, start=1):
                    pages.append({"page_number": page_num, "content": page.extract_text() or ""})
                return self._build_result(file_path=file_path, pages=pages)
        except Exception:
            loader = UnstructuredFileLoader(file_path, strategy="fast")
            docs = loader.load()
            return self._build_result(
                file_path=file_path,
                pages=self._docs_to_pages(docs),
                metadata={"source": "unstructured_pdf_fallback"},
            )

    async def _parse_docx(self, file_path: str) -> Dict[str, Any]:
        try:
            loader = UnstructuredWordDocumentLoader(file_path, strategy="fast")
            docs = loader.load()
            return self._build_result(file_path=file_path, pages=self._docs_to_pages(docs))
        except Exception:
            from docx import Document as DocxDocument

            doc = DocxDocument(file_path)
            content = []
            for paragraph in doc.paragraphs:
                if paragraph.text.strip():
                    content.append(paragraph.text.strip())

            return self._build_result(
                file_path=file_path,
                pages=[{"page_number": 1, "content": "\n".join(content)}],
                title=doc.core_properties.title or Path(file_path).stem,
                metadata={
                    "author": doc.core_properties.author or "",
                    "paragraph_count": len(content),
                },
            )

    async def _parse_txt(self, file_path: str) -> Dict[str, Any]:
        loader = TextLoader(file_path, autodetect_encoding=True)
        docs = loader.load()
        return self._build_result(file_path=file_path, pages=self._docs_to_pages(docs))

    async def _parse_md(self, file_path: str) -> Dict[str, Any]:
        try:
            docs = convert_markdown_to_langchaindoc(file_path)
            pages = []
            for idx, doc in enumerate(docs, start=1):
                title_lst = doc.metadata.get("title_lst", []) if hasattr(doc, "metadata") else []
                title_prefix = "\n".join(title_lst)
                content = (doc.page_content or "").strip()
                merged = f"{title_prefix}\n{content}".strip() if title_prefix else content
                pages.append({"page_number": idx, "content": merged})
            return self._build_result(file_path=file_path, pages=pages)
        except Exception:
            loader = UnstructuredFileLoader(file_path, strategy="fast")
            docs = loader.load()
            return self._build_result(file_path=file_path, pages=self._docs_to_pages(docs))

    async def _parse_csv(self, file_path: str) -> Dict[str, Any]:
        loader = CSVLoader(
            file_path,
            autodetect_encoding=True,
            csv_args={"delimiter": ",", "quotechar": '"'},
        )
        docs = loader.load()
        return self._build_result(file_path=file_path, pages=self._docs_to_pages(docs))

    async def _parse_json(self, file_path: str) -> Dict[str, Any]:
        loader = JSONLoader(file_path, autodetect_encoding=True)
        docs = loader.load()
        return self._build_result(file_path=file_path, pages=self._docs_to_pages(docs))

    async def _parse_xlsx(self, file_path: str) -> Dict[str, Any]:
        pages = self._xlsx_to_markdown_pages(file_path)
        if pages:
            return self._build_result(file_path=file_path, pages=pages)

        loader = UnstructuredFileLoader(file_path, strategy="fast")
        docs = loader.load()
        return self._build_result(file_path=file_path, pages=self._docs_to_pages(docs))

    async def _parse_pptx(self, file_path: str) -> Dict[str, Any]:
        try:
            loader = UnstructuredPowerPointLoader(file_path, strategy="fast")
            docs = loader.load()
        except Exception:
            loader = UnstructuredFileLoader(file_path, strategy="fast")
            docs = loader.load()
        return self._build_result(file_path=file_path, pages=self._docs_to_pages(docs))

    async def _parse_eml(self, file_path: str) -> Dict[str, Any]:
        try:
            loader = UnstructuredEmailLoader(file_path, strategy="fast")
            docs = loader.load()
        except Exception:
            loader = TextLoader(file_path, autodetect_encoding=True)
            docs = loader.load()
        return self._build_result(file_path=file_path, pages=self._docs_to_pages(docs))

    def _xlsx_to_markdown_pages(self, file_path: str) -> List[Dict[str, Any]]:
        try:
            import openpyxl
        except ImportError:
            return []

        def clean_cell_content(cell: Any) -> str:
            if cell is None:
                return ""
            return " ".join(str(cell).split())

        workbook = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
        pages: List[Dict[str, Any]] = []

        for page_number, sheet_name in enumerate(workbook.sheetnames, start=1):
            sheet = workbook[sheet_name]
            rows = [[clean_cell_content(cell) for cell in row] for row in sheet.iter_rows(values_only=True)]
            non_empty_rows = [row for row in rows if any(cell != "" for cell in row)]
            if not non_empty_rows:
                continue

            max_cols = max(len(row) for row in non_empty_rows)
            lines = [f"# {sheet_name}", ""]
            for row_index, row in enumerate(non_empty_rows):
                padded_row = row + [""] * (max_cols - len(row))
                lines.append("| " + " | ".join(padded_row) + " |")
                if row_index == 0:
                    lines.append("|" + "|".join(["---"] * max_cols) + "|")
            pages.append({"page_number": page_number, "content": "\n".join(lines)})

        workbook.close()
        return pages
