/**
 * 分段数据层：列表、更新、创建、批量删除。
 * 更新 content/keywords 会触发后端单分段重新建索引。
 */
import { knowledgeBaseApi } from '@/lib/api'
import type { SegmentDetailModel } from './types'

/** 文档分段列表，可选 enabled、keyword 筛选 */
export async function fetchDocumentSegments(
  knowledgeBaseId: string,
  documentId: string,
  params?: { enabled?: boolean; keyword?: string },
) {
  const response = await knowledgeBaseApi.getSegments(knowledgeBaseId, documentId, params)
  return response.data.data.segments as SegmentDetailModel[]
}

/** 更新分段（content/answer/keywords/enabled），后端会触发该分段重新建索引 */
export async function updateSegment(
  knowledgeBaseId: string,
  documentId: string,
  segmentId: string,
  payload: {
    content?: string
    answer?: string
    keywords?: string[]
    enabled?: boolean
  },
) {
  const response = await knowledgeBaseApi.updateSegment(knowledgeBaseId, documentId, segmentId, payload)
  return response.data.data.segment as SegmentDetailModel
}

/** 新建分段 */
export async function createSegment(
  knowledgeBaseId: string,
  documentId: string,
  payload: {
    content: string
    answer?: string
    keywords?: string[]
    enabled?: boolean
    summary?: string
  },
) {
  const response = await knowledgeBaseApi.createSegment(knowledgeBaseId, documentId, payload)
  return response.data.data.segment as SegmentDetailModel
}

/** 批量删除分段（同时删向量/关键词索引） */
export async function deleteSegments(
  knowledgeBaseId: string,
  documentId: string,
  segmentIds: string[],
) {
  const response = await knowledgeBaseApi.deleteSegments(knowledgeBaseId, documentId, segmentIds)
  return response.data.data as {
    deleted: number
    segment_ids: string[]
  }
}
