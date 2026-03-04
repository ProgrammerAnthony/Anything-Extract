export type IndexingTechnique = 'high_quality' | 'economy'
export type ChunkingMode = 'text_model' | 'qa_model' | 'hierarchical_model'

export interface RetrievalConfig {
  search_method: 'semantic_search' | 'full_text_search' | 'hybrid_search' | 'keyword_search'
  reranking_enable: boolean
  reranking_model?: {
    reranking_provider_name?: string
    reranking_model_name?: string
  }
  reranking_mode?: string
  top_k: number
  score_threshold_enabled: boolean
  score_threshold?: number
  weights?: {
    weight_type?: 'semantic_first' | 'keyword_first' | 'customized'
    vector_setting?: {
      vector_weight: number
      embedding_provider_name?: string
      embedding_model_name?: string
    }
    keyword_setting?: {
      keyword_weight: number
    }
  } | null
}

export interface KnowledgeBase {
  id: string
  name: string
  is_default: boolean
  indexing_technique: IndexingTechnique
  doc_form: ChunkingMode
  embedding_model?: string
  embedding_model_provider?: string
  keyword_number: number
  retrieval_model: RetrievalConfig
  created_at: string
  updated_at: string
}

export interface DocumentModel {
  id: string
  knowledge_base_id: string
  filename: string
  file_type: string
  status: string
  display_status?: string
  indexing_status?: string
  enabled: boolean
  archived: boolean
  word_count?: number
  tokens?: number
  hit_count?: number
  segment_count?: number
  doc_form?: ChunkingMode
  doc_language?: string
  data_source_type?: string
  data_source_info?: Record<string, any>
  batch?: string
  position?: number
  error?: string
  archived_at?: string | null
  disabled_at?: string | null
  document_process_rule?: ProcessRuleModel | null
  dataset_process_rule?: ProcessRuleModel | null
  technical_parameters?: {
    indexing_technique?: IndexingTechnique
    embedding_model?: string
    embedding_model_provider?: string
    retrieval_model?: RetrievalConfig
    keyword_number?: number
  }
  knowledge_base?: KnowledgeBase
  created_at: string
  updated_at: string
  ingest_job?: {
    id: string
    status: string
    attempts: number
    max_attempts: number
    error_msg?: string
    processing_mode: 'queue' | 'immediate'
  } | null
}

export interface SegmentDetailModel {
  id: string
  document_id: string
  knowledge_base_id: string
  position: number
  content: string
  answer?: string
  word_count?: number
  tokens?: number
  keywords: string[]
  hit_count: number
  enabled: boolean
  status: string
  error?: string | null
  created_at?: string
  updated_at?: string
}

export interface SegmentationRuleModel {
  separator: string
  max_tokens: number
  chunk_overlap: number
}

export interface ProcessRuleModel {
  id: string
  knowledge_base_id: string
  mode: 'automatic' | 'custom' | 'hierarchical'
  rules: {
    pre_processing_rules?: Array<{ id: string; enabled: boolean }>
    segmentation?: SegmentationRuleModel
    parent_mode?: 'full-doc' | 'paragraph'
    subchunk_segmentation?: SegmentationRuleModel
  }
  created_at?: string
}

export interface HitTestingQuery {
  id: string
  knowledge_base_id: string
  query: string
  content: Array<{
    content_type: string
    content: string
  }>
  source: string
  created_by: string
  created_at: string
}

export interface HitTestingRecord {
  score: number
  segment: {
    id: string
    document_id?: string
    knowledge_base_id?: string
    position?: number | null
    content: string
    answer?: string | null
    word_count?: number
    tokens?: number
    keywords?: string[]
    hit_count?: number
    enabled?: boolean
  }
  document: {
    id?: string
    name?: string
    doc_form?: string
  }
  metadata: Record<string, any>
}
