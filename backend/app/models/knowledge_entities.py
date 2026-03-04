"""知识库领域模型定义。"""
from __future__ import annotations

from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field


class RetrievalMethod(StrEnum):
    SEMANTIC_SEARCH = "semantic_search"
    FULL_TEXT_SEARCH = "full_text_search"
    HYBRID_SEARCH = "hybrid_search"
    KEYWORD_SEARCH = "keyword_search"

    @staticmethod
    def supports_semantic(method: str) -> bool:
        return method in {RetrievalMethod.SEMANTIC_SEARCH, RetrievalMethod.HYBRID_SEARCH}

    @staticmethod
    def supports_full_text(method: str) -> bool:
        return method in {RetrievalMethod.FULL_TEXT_SEARCH, RetrievalMethod.HYBRID_SEARCH}


class PreProcessingRule(BaseModel):
    id: str
    enabled: bool = True


class Segmentation(BaseModel):
    separator: str = "\n"
    max_tokens: int = 500
    chunk_overlap: int = 50


class Rule(BaseModel):
    pre_processing_rules: list[PreProcessingRule] | None = None
    segmentation: Segmentation | None = None
    parent_mode: Literal["full-doc", "paragraph"] | None = None
    subchunk_segmentation: Segmentation | None = None


class ProcessRule(BaseModel):
    mode: Literal["automatic", "custom", "hierarchical"] = "automatic"
    rules: Rule | None = None


class RerankingModel(BaseModel):
    reranking_provider_name: str | None = None
    reranking_model_name: str | None = None


class WeightVectorSetting(BaseModel):
    vector_weight: float
    embedding_provider_name: str | None = None
    embedding_model_name: str | None = None


class WeightKeywordSetting(BaseModel):
    keyword_weight: float


class WeightModel(BaseModel):
    weight_type: Literal["semantic_first", "keyword_first", "customized"] | None = None
    vector_setting: WeightVectorSetting | None = None
    keyword_setting: WeightKeywordSetting | None = None


class RetrievalConfig(BaseModel):
    # 检索方式由前端配置传入，服务端在检索时按该字段分发。
    search_method: RetrievalMethod = RetrievalMethod.SEMANTIC_SEARCH
    reranking_enable: bool = False
    reranking_model: RerankingModel | None = None
    reranking_mode: str | None = "reranking_model"
    top_k: int = 3
    score_threshold_enabled: bool = False
    score_threshold: float = 0.5
    # 混合检索下可选权重配置（weighted_score 模式）。
    weights: WeightModel | None = None


class FileInfo(BaseModel):
    file_paths: list[str] = Field(default_factory=list)


class DataSourceInfoList(BaseModel):
    data_source_type: Literal["upload_file"] = "upload_file"
    file_info_list: FileInfo


class DataSource(BaseModel):
    info_list: DataSourceInfoList


class KnowledgeConfig(BaseModel):
    # 索引模式只控制“检索走哪条路”，不会删除另一条索引数据。
    indexing_technique: Literal["high_quality", "economy"] = "high_quality"
    data_source: DataSource | None = None
    process_rule: ProcessRule | None = None
    retrieval_model: RetrievalConfig | None = None
    doc_form: str = "text_model"
    doc_language: str = "English"
    embedding_model: str | None = None
    embedding_model_provider: str | None = None
    name: str | None = None


class SegmentUpdateArgs(BaseModel):
    content: str | None = None
    answer: str | None = None
    keywords: list[str] | None = None
    enabled: bool | None = None
