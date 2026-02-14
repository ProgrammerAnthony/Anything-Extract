import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

export type UploadProcessingMode = 'queue' | 'immediate';

export const tagApi = {
  getAll: () => api.get('/tags'),
  getById: (id: string) => api.get(`/tags/${id}`),
  create: (data: any) => api.post('/tags', data),
  update: (id: string, data: any) => api.put(`/tags/${id}`, data),
  delete: (id: string) => api.delete(`/tags/${id}`),
};

export const knowledgeBaseApi = {
  getAll: (params?: { search?: string }) => api.get('/knowledge-bases', { params }),
  getById: (id: string) => api.get(`/knowledge-bases/${id}`),
  create: (data: { name: string }) => api.post('/knowledge-bases', data),
  update: (id: string, data: { name: string }) => api.put(`/knowledge-bases/${id}`, data),
  delete: (id: string) => api.delete(`/knowledge-bases/${id}`),
  getDocuments: (id: string, params?: { page?: number; page_size?: number; status?: string }) =>
    api.get(`/knowledge-bases/${id}/documents`, { params }),
};

export const documentApi = {
  upload: (file: File, knowledgeBaseId: string, processingMode: UploadProcessingMode = 'queue') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('knowledge_base_id', knowledgeBaseId);
    formData.append('processing_mode', processingMode);
    return api.post('/documents/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  getAll: (params?: { page?: number; page_size?: number; status?: string; knowledge_base_id?: string }) =>
    api.get('/documents', { params }),
  getById: (id: string) => api.get(`/documents/${id}`),
  getStatus: (id: string) => api.get(`/documents/${id}/status`),
  retry: (id: string) => api.post(`/documents/${id}/retry`),
  delete: (id: string) => api.delete(`/documents/${id}`),
};

export const extractApi = {
  extract: (data: {
    tag_config_id: string;
    document_id: string;
    retrieval_method?: string;
    top_k?: number;
    rerank?: boolean;
    rag_enhancement_enabled?: boolean;
    rag_tag_enhancements?: Record<string, any>;
  }) => api.post('/extract', data),
  extractStream: (data: {
    tag_config_id: string;
    document_id: string;
    retrieval_method?: string;
    top_k?: number;
    rerank?: boolean;
    rag_enhancement_enabled?: boolean;
    rag_tag_enhancements?: Record<string, any>;
  }) => {
    return fetch('/api/extract/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
  },
  multiTagExtract: (data: {
    tag_config_ids: string[];
    document_id: string;
    retrieval_method?: string;
    top_k?: number;
    rerank?: boolean;
    rag_enhancement_enabled?: boolean;
    rag_tag_enhancements?: Record<string, any>;
  }) => api.post('/extract/multi-tags', data),
  enhanceTagQueries: (data: {
    tag_config_ids: string[];
    question_count?: number;
    strategy?: string;
  }) => api.post('/extract/rag/enhance-tags', data),
  batchExtract: (data: {
    tag_config_id: string;
    document_ids: string[];
    retrieval_method?: string;
    top_k?: number;
  }) => api.post('/extract/batch', data),
};

export const systemApi = {
  getConfig: () => api.get('/system/config'),
  updateConfig: (data: any) => api.put('/system/config', data),
};

export default api;
