import { knowledgeBaseApi } from '@/lib/api'
import type { HitTestingQuery, HitTestingRecord } from './types'

export async function useHitTesting(
  knowledgeBaseId: string,
  payload: {
    query: string
    retrieval_model?: Record<string, any>
    document_ids?: string[]
  },
) {
  const response = await knowledgeBaseApi.hitTesting(knowledgeBaseId, payload)
  return response.data.data as {
    query: string
    query_payload?: { content: string }
    retrieval_model: Record<string, any>
    records?: HitTestingRecord[]
    hits: Array<{
      chunk_id: string
      content: string
      similarity: number
      metadata: Record<string, any>
    }>
  }
}

export async function useHitTestingQueries(
  knowledgeBaseId: string,
  params?: { page?: number; limit?: number },
) {
  const response = await knowledgeBaseApi.getHitTestingQueries(knowledgeBaseId, params)
  return response.data.data as {
    queries: HitTestingQuery[]
    pagination: {
      page: number
      limit: number
      total: number
      has_more: boolean
    }
  }
}
