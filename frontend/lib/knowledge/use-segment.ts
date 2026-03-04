import { knowledgeBaseApi } from '@/lib/api'
import type { SegmentDetailModel } from './types'

export async function useSegmentList(
  knowledgeBaseId: string,
  documentId: string,
  params?: { enabled?: boolean; keyword?: string },
) {
  const response = await knowledgeBaseApi.getSegments(knowledgeBaseId, documentId, params)
  return response.data.data.segments as SegmentDetailModel[]
}

export async function useUpdateSegment(
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

export async function useCreateSegment(
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

export async function useDeleteSegments(
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
