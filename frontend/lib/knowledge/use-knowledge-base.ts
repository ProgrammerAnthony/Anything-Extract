import { knowledgeBaseApi } from '@/lib/api'
import type { KnowledgeBase, DocumentModel } from './types'

export async function useKnowledgeBaseList(params?: { keyword?: string; page?: number; limit?: number }) {
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

export async function useKnowledgeBaseDetail(id: string) {
  const response = await knowledgeBaseApi.getById(id)
  return response.data.data.knowledge_base as KnowledgeBase
}

export async function useKnowledgeBaseDocuments(
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
