/**
 * 文档与分段数据层：文档列表、详情、分段列表。
 * 均基于 knowledgeBaseApi，按 knowledgeBaseId + documentId 请求。
 */
import { knowledgeBaseApi } from '@/lib/api'
import type { DocumentModel, SegmentDetailModel } from './types'

/** 指定知识库下的文档列表（分页、状态、排序） */
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

/** 单文档详情（含 process_rule、technical_parameters、segment_count 等） */
export async function useDocumentDetail(knowledgeBaseId: string, documentId: string) {
  const response = await knowledgeBaseApi.getDocument(knowledgeBaseId, documentId)
  return response.data.data.document as DocumentModel
}

/** 文档分段列表，可选按 enabled、keyword 筛选 */
export async function useDocumentSegments(
  knowledgeBaseId: string,
  documentId: string,
  params?: { enabled?: boolean; keyword?: string },
) {
  const response = await knowledgeBaseApi.getSegments(knowledgeBaseId, documentId, params)
  return response.data.data.segments as SegmentDetailModel[]
}
