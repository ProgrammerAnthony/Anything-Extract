/**
 * 知识库数据层：列表、详情、文档列表。
 * 均为异步请求封装，返回解包后的 data，供页面直接使用。
 */
import { knowledgeBaseApi } from '@/lib/api'
import type { KnowledgeBase, DocumentModel } from './types'

/** 知识库列表，支持关键词与分页 */
export async function fetchKnowledgeBaseList(params?: { keyword?: string; page?: number; limit?: number }) {
  const response = await knowledgeBaseApi.getAll(params)
  return response.data.data as {
    knowledge_bases: KnowledgeBase[]
    pagination: {
      page: number
      limit: number
      total: number
      has_more: boolean
    }
  }
}

/** 单个知识库详情（含 retrieval_model 等配置） */
export async function fetchKnowledgeBaseDetail(id: string) {
  const response = await knowledgeBaseApi.getById(id)
  return response.data.data.knowledge_base as KnowledgeBase
}

/** 知识库下文档列表，支持 status 筛选与排序 */
export async function fetchKnowledgeBaseDocuments(
  id: string,
  params?: {
    page?: number
    page_size?: number
    status?: string
    sort_by?: 'created_at' | 'updated_at'
    sort_order?: 'asc' | 'desc'
  },
) {
  const response = await knowledgeBaseApi.getDocuments(id, params)
  return response.data.data as {
    documents: DocumentModel[]
    pagination: {
      page: number
      page_size: number
      total: number
      total_pages: number
    }
  }
}
