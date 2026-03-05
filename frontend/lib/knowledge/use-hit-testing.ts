/**
 * 召回测试数据层：发起检索、获取历史查询列表。
 */
import { knowledgeBaseApi } from '@/lib/api'
import type { HitTestingQuery, HitTestingRecord } from './types'

/** 按 query 与可选 retrieval_model/document_ids 召回，返回 records 与 hits */
export async function runHitTesting(
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

/** 召回测试历史查询列表（分页） */
export async function fetchHitTestingQueries(
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
