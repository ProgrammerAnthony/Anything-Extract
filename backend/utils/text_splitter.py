"""文本分块工具"""
from typing import List, Any
try:
    # 新版本 langchain (>=0.1.0)
    from langchain_text_splitters import RecursiveCharacterTextSplitter
except ImportError:
    # 旧版本 langchain (<0.1.0)
    from langchain.text_splitter import RecursiveCharacterTextSplitter


class TextSplitter:
    """文本分块器"""
    
    def __init__(self, chunk_size: int = 1000, chunk_overlap: int = 200):
        self.splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separators=["\n\n", "\n", "。", "！", "？", " ", ""]
        )
    
    def split_text(self, text: str) -> List[str]:
        """分割文本"""
        return self.splitter.split_text(text)
    
    def split_documents(self, documents: List[Any]) -> List[Any]:
        """分割文档"""
        return self.splitter.split_documents(documents)

