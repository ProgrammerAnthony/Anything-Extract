import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

export type UploadProcessingMode = 'queue' | 'immediate'
export type ParserMode = 'local' | 'server' | 'hybrid'
export type ParserModelSource = 'docker-model' | 'local-model'

export const tagApi = {
  getAll: () => api.get('/tags'),
  getById: (id: string) => api.get(`/tags/${id}`),
  create: (data: any) => api.post('/tags', data),
  update: (id: string, data: any) => api.put(`/tags/${id}`, data),
  delete: (id: string) => api.delete(`/tags/${id}`),
}

/** 知识库相关 API：知识库 CRUD、文档列表/详情/设置/预览/重新入队、分段 CRUD、召回测试。 */
export const knowledgeBaseApi = {
  getAll: (params?: { keyword?: string; search?: string; page?: number; limit?: number }) =>
    api.get('/knowledge-bases', { params }),
  getById: (id: string) => api.get(`/knowledge-bases/${id}`),
  create: (data: {
    name: string
    indexing_technique?: 'high_quality' | 'economy'
    doc_form?: string
    retrieval_model?: Record<string, any>
    embedding_model?: string
    embedding_model_provider?: string
    keyword_number?: number
  }) => api.post('/knowledge-bases', data),
  init: (data: {
    knowledge_base: {
      name: string
      indexing_technique?: 'high_quality' | 'economy'
      doc_form?: string
      retrieval_model?: Record<string, any>
      embedding_model?: string
      embedding_model_provider?: string
      keyword_number?: number
    }
    file_paths?: string[]
    process_rule?: Record<string, any>
  }) => api.post('/knowledge-bases/init', data),
  update: (id: string, data: Record<string, any>) => api.patch(`/knowledge-bases/${id}`, data),
  delete: (id: string) => api.delete(`/knowledge-bases/${id}`),

  /** 文档列表，支持 status 筛选与分页，返回 ingest_job 与 hit_count */
  getDocuments: (
    id: string,
    params?: {
      page?: number
      page_size?: number
      status?: 'available' | 'disabled' | 'archived' | 'error' | string
      sort_by?: 'created_at' | 'updated_at'
      sort_order?: 'asc' | 'desc'
    },
  ) => api.get(`/knowledge-bases/${id}/documents`, { params }),
  createDocument: (
    id: string,
    data: {
      name?: string
      file_path: string
      file_type: string
      process_rule?: Record<string, any>
      retrieval_model?: Record<string, any>
      doc_form?: string
      doc_language?: string
      batch?: string
    },
  ) => api.post(`/knowledge-bases/${id}/documents`, data),
  getDocument: (id: string, docId: string) => api.get(`/knowledge-bases/${id}/documents/${docId}`),
  renameDocument: (id: string, docId: string, name: string) =>
    api.patch(`/knowledge-bases/${id}/documents/${docId}/name`, { name }),
  updateDocumentSettings: (id: string, docId: string, data: Record<string, any>) =>
    api.patch(`/knowledge-bases/${id}/documents/${docId}/settings`, data),
  previewDocumentChunks: (
    id: string,
    docId: string,
    data?: { process_rule?: Record<string, any> },
  ) => api.post(`/knowledge-bases/${id}/documents/${docId}/preview-chunks`, data ?? {}),
  /** 保存设置后触发重新入队（process 页「保存并处理」后调用） */
  reindexDocument: (id: string, docId: string) => api.post(`/knowledge-bases/${id}/documents/${docId}/reindex`),
  getDocumentIndexingStatus: (id: string, docId: string) => api.get(`/knowledge-bases/${id}/documents/${docId}/indexing-status`),
  getBatchIndexingStatus: (id: string, batchId: string) => api.get(`/knowledge-bases/${id}/batch/${batchId}/indexing-status`),
  patchDocumentsStatusBatch: (
    id: string,
    action: 'enable' | 'disable' | 'archive' | 'un_archive',
    documentIds: string[],
  ) => {
    const query = new URLSearchParams()
    documentIds.forEach((docId) => query.append('document_id', docId))
    return api.patch(`/knowledge-bases/${id}/documents/status/${action}/batch?${query.toString()}`)
  },

  getSegments: (id: string, docId: string, params?: { enabled?: boolean; keyword?: string }) =>
    api.get(`/knowledge-bases/${id}/documents/${docId}/segments`, { params }),
  createSegment: (
    id: string,
    docId: string,
    data: { content: string; answer?: string; keywords?: string[]; enabled?: boolean; summary?: string },
  ) => api.post(`/knowledge-bases/${id}/documents/${docId}/segment`, data),
  deleteSegments: (id: string, docId: string, segmentIds: string[]) => {
    const query = new URLSearchParams()
    segmentIds.forEach((segId) => query.append('segment_id', segId))
    return api.delete(`/knowledge-bases/${id}/documents/${docId}/segments?${query.toString()}`)
  },
  updateSegment: (id: string, docId: string, segId: string, data: Record<string, any>) =>
    api.patch(`/knowledge-bases/${id}/documents/${docId}/segments/${segId}`, data),
  patchSegmentsStatus: (
    id: string,
    docId: string,
    action: 'enable' | 'disable',
    segmentIds: string[],
  ) => {
    const query = new URLSearchParams()
    segmentIds.forEach((segId) => query.append('segment_id', segId))
    return api.patch(`/knowledge-bases/${id}/documents/${docId}/segment/${action}?${query.toString()}`)
  },

  hitTesting: (
    id: string,
    data: {
      query: string
      retrieval_model?: Record<string, any>
      document_ids?: string[]
    },
  ) => api.post(`/knowledge-bases/${id}/hit-testing`, data),
  getHitTestingQueries: (id: string, params?: { page?: number; limit?: number }) =>
    api.get(`/knowledge-bases/${id}/queries`, { params }),
}

export const documentApi = {
  upload: (file: File, knowledgeBaseId: string, processingMode: UploadProcessingMode = 'queue', batch?: string) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('knowledge_base_id', knowledgeBaseId)
    formData.append('processing_mode', processingMode)
    if (batch)
      formData.append('batch', batch)

    return api.post('/documents/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
  },
  getAll: (params?: { page?: number; page_size?: number; status?: string; knowledge_base_id?: string }) =>
    api.get('/documents', { params }),
  getById: (id: string) => api.get(`/documents/${id}`),
  getStatus: (id: string) => api.get(`/documents/${id}/status`),
  retry: (id: string) => api.post(`/documents/${id}/retry`),
  delete: (id: string) => api.delete(`/documents/${id}`),
}

export const extractApi = {
  extract: (data: {
    tag_config_id: string
    document_id: string
    retrieval_method?: string
    top_k?: number
    rerank?: boolean
    rag_enhancement_enabled?: boolean
    rag_tag_enhancements?: Record<string, any>
  }) => api.post('/extract', data),
  extractStream: (data: {
    tag_config_id: string
    document_id: string
    retrieval_method?: string
    top_k?: number
    rerank?: boolean
    rag_enhancement_enabled?: boolean
    rag_tag_enhancements?: Record<string, any>
  }) => {
    return fetch('/api/extract/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })
  },
  multiTagExtract: (data: {
    tag_config_ids: string[]
    document_id: string
    retrieval_method?: string
    top_k?: number
    rerank?: boolean
    rag_enhancement_enabled?: boolean
    rag_tag_enhancements?: Record<string, any>
  }) => api.post('/extract/multi-tags', data),
  enhanceTagQueries: (data: {
    tag_config_ids: string[]
    question_count?: number
    strategy?: string
  }) => api.post('/extract/rag/enhance-tags', data),
  batchExtract: (data: {
    tag_config_id: string
    document_ids: string[]
    retrieval_method?: string
    top_k?: number
  }) => api.post('/extract/batch', data),
}

export const systemApi = {
  getConfig: () => api.get('/system/config'),
  updateConfig: (data: any) => api.put('/system/config', data),
}

export default api
