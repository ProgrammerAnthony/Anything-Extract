"""Pydantic 模型定义"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum


class TagType(str, Enum):
    """标签类型"""
    SINGLE_CHOICE = "single_choice"
    MULTIPLE_CHOICE = "multiple_choice"
    TEXT_INPUT = "text_input"


class TagConfigBase(BaseModel):
    """标签配置基础模型"""
    name: str = Field(..., description="标签名称")
    type: TagType = Field(..., description="标签类型")
    description: Optional[str] = Field(None, description="标签描述")
    options: Optional[List[str]] = Field(None, description="可选项列表（单选/多选）")
    required: bool = Field(False, description="是否必填")


class TagConfigCreate(TagConfigBase):
    """创建标签配置"""
    pass


class TagConfigUpdate(BaseModel):
    """更新标签配置"""
    name: Optional[str] = None
    type: Optional[TagType] = None
    description: Optional[str] = None
    options: Optional[List[str]] = None
    required: Optional[bool] = None


class TagConfigResponse(TagConfigBase):
    """标签配置响应"""
    id: str
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class DocumentBase(BaseModel):
    """文档基础模型"""
    filename: str
    file_type: str


class DocumentResponse(BaseModel):
    """文档响应"""
    id: str
    filename: str
    file_type: str
    status: str
    metadata: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class DocumentStatusResponse(BaseModel):
    """文档状态响应"""
    status: str
    progress: int = Field(0, ge=0, le=100)
    message: Optional[str] = None


class ExtractionRequest(BaseModel):
    """提取请求"""
    tag_config_id: str = Field(..., description="标签配置 ID")
    document_id: str = Field(..., description="文档 ID")
    retrieval_method: Optional[str] = Field("basic", description="检索方法")
    top_k: Optional[int] = Field(5, ge=1, le=20, description="Top-K 结果数")
    rerank: Optional[bool] = Field(False, description="是否启用重排序")
    rag_enhancement_enabled: Optional[bool] = Field(False, description="是否启用RAG标签增强")
    rag_tag_enhancements: Optional[Dict[str, Any]] = Field(None, description="标签增强问题数据")


class ExtractionResult(BaseModel):
    """提取结果"""
    result: Dict[str, Any] = Field(..., description="提取结果")
    sources: List[Dict[str, Any]] = Field(default_factory=list, description="来源信息")
    extraction_time: Optional[float] = None


class MultiTagExtractionRequest(BaseModel):
    """多标签提取请求"""
    tag_config_ids: List[str] = Field(..., description="标签配置 ID 列表")
    document_id: str = Field(..., description="文档 ID")
    retrieval_method: Optional[str] = Field("basic", description="检索方法")
    top_k: Optional[int] = Field(5, ge=1, le=20, description="Top-K 结果数")
    rerank: Optional[bool] = Field(False, description="是否启用重排序")
    rag_enhancement_enabled: Optional[bool] = Field(False, description="是否启用RAG标签增强")
    rag_tag_enhancements: Optional[Dict[str, Any]] = Field(None, description="标签增强问题数据")


class RAGTagEnhancementRequest(BaseModel):
    """标签RAG增强请求"""
    tag_config_ids: List[str] = Field(..., description="标签配置 ID 列表")
    question_count: Optional[int] = Field(3, ge=1, le=10, description="每个标签生成问题数")
    strategy: Optional[str] = Field("llm_question_v1", description="增强策略")


class BatchExtractionRequest(BaseModel):
    """批量提取请求"""
    tag_config_id: str
    document_ids: List[str]
    retrieval_method: Optional[str] = "basic"
    top_k: Optional[int] = 5


class BatchExtractionResult(BaseModel):
    """批量提取结果"""
    document_id: str
    result: Dict[str, Any]
    sources: List[Dict[str, Any]] = []


class BatchExtractionResponse(BaseModel):
    """批量提取响应"""
    results: List[BatchExtractionResult]


class SystemConfigResponse(BaseModel):
    """系统配置响应"""
    llm: Dict[str, Any]
    embedding: Dict[str, Any]
    vector_db: Dict[str, Any]
    retrieval: Dict[str, Any]


class SystemConfigUpdate(BaseModel):
    """系统配置更新"""
    llm: Optional[Dict[str, Any]] = None
    embedding: Optional[Dict[str, Any]] = None
    vector_db: Optional[Dict[str, Any]] = None


class ApiResponse(BaseModel):
    """通用 API 响应"""
    success: bool
    data: Optional[Any] = None
    message: Optional[str] = None
    error: Optional[Dict[str, Any]] = None

