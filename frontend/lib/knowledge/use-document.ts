import { knowledgeBaseApi } from '@/lib/api'
import type { DocumentModel, SegmentDetailModel } from './types'

export async function useDocumentList(
  knowledgeBaseId: string,
  params?: {
    page?: number
    page_size?: number
    status?: string
    sort_by?: 'created_at' | 'updated_at'
    sort_order?: 'asc' | 'desc'
  },
) {
  const response = await knowledgeBaseApi.getDocuments(knowledgeBaseId, params)
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

export async function useDocumentDetail(knowledgeBaseId: string, documentId: string) {
  const response = await knowledgeBaseApi.getDocument(knowledgeBaseId, documentId)
  return response.data.data.document as DocumentModel
}

export async function useDocumentSegments(
  knowledgeBaseId: string,
  documentId: string,
  params?: { enabled?: boolean; keyword?: string },
) {
  const response = await knowledgeBaseApi.getSegments(knowledgeBaseId, documentId, params)
  return response.data.data.segments as SegmentDetailModel[]
}
