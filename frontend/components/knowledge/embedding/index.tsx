'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { knowledgeBaseApi } from '@/lib/api'
import ProgressBar from './ProgressBar'
import RuleDetail from './RuleDetail'
import SegmentProgress from './SegmentProgress'
import StatusHeader from './StatusHeader'

const EMBEDDING_STATUSES = ['indexing', 'splitting', 'parsing', 'cleaning'] as const
const TERMINAL_STATUSES = ['completed', 'error', 'paused'] as const

function isEmbeddingStatus(status?: string): boolean {
  return EMBEDDING_STATUSES.includes(status as typeof EMBEDDING_STATUSES[number])
}

function isTerminalStatus(status?: string): boolean {
  return TERMINAL_STATUSES.includes(status as typeof TERMINAL_STATUSES[number])
}

function calculatePercent(completed?: number, total?: number): number {
  if (!total || total === 0)
    return 0
  const percent = Math.round(((completed || 0) * 100) / total)
  return Math.min(percent, 100)
}

export type IndexingStatusData = {
  indexing_status?: string
  completed_segments?: number
  total_segments?: number
  parsing_completed_at?: string | null
  cleaning_completed_at?: string | null
  splitting_completed_at?: string | null
  completed_at?: string | null
  error?: string | null
}

import type { ProcessRuleSource } from './RuleDetail'

export type EmbeddingProgressProps = {
  knowledgeBaseId: string
  documentId: string
  indexingType?: string
  retrievalMethod?: string
  processRule?: ProcessRuleSource | null
  onComplete?: () => void
}

export default function EmbeddingProgress({
  knowledgeBaseId,
  documentId,
  indexingType,
  retrievalMethod,
  processRule,
  onComplete,
}: EmbeddingProgressProps) {
  const [data, setData] = useState<IndexingStatusData | null>(null)
  const [loading, setLoading] = useState(true)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  const fetchStatus = useCallback(async () => {
    try {
      const res = await knowledgeBaseApi.getDocumentIndexingStatus(knowledgeBaseId, documentId)
      if (res.data.success && res.data.data) {
        const next = res.data.data as IndexingStatusData
        setData(next)
        return next
      }
    }
    catch {
      // ignore
    }
    return null
  }, [knowledgeBaseId, documentId])

  useEffect(() => {
    let mounted = true

    const run = async () => {
      const next = await fetchStatus()
      if (!mounted)
        return
      setLoading(false)
      if (next?.indexing_status && isTerminalStatus(next.indexing_status)) {
        onCompleteRef.current?.()
      }
    }

    run()
    return () => {
      mounted = false
    }
  }, [fetchStatus])

  useEffect(() => {
    if (loading)
      return
    const status = data?.indexing_status
    if (isTerminalStatus(status)) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
      return
    }
    pollingRef.current = setInterval(async () => {
      const next = await fetchStatus()
      if (next?.indexing_status && isTerminalStatus(next.indexing_status)) {
        if (pollingRef.current) {
          clearInterval(pollingRef.current)
          pollingRef.current = null
        }
        onCompleteRef.current?.()
      }
    }, 2500)
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [loading, data?.indexing_status, fetchStatus])

  const status = data?.indexing_status || ''
  const isEmbedding = isEmbeddingStatus(status)
  const isCompleted = status === 'completed'
  const isPaused = status === 'paused'
  const isError = status === 'error'
  const percent = calculatePercent(data?.completed_segments, data?.total_segments)

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-y-2 px-16 py-12">
        <div className="h-6 w-48 animate-pulse rounded bg-gray-200" />
        <div className="h-2 w-full animate-pulse rounded bg-gray-100" />
        <div className="h-4 w-32 animate-pulse rounded bg-gray-100" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-y-2 px-16 py-12">
      <StatusHeader
        isEmbedding={isEmbedding}
        isCompleted={isCompleted}
        isPaused={isPaused}
        isError={isError}
      />
      <ProgressBar
        percent={percent}
        isEmbedding={isEmbedding}
        isCompleted={isCompleted}
        isPaused={isPaused}
        isError={isError}
      />
      <SegmentProgress
        completedSegments={data?.completed_segments}
        totalSegments={data?.total_segments}
        percent={percent}
      />
      {isError && data?.error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {data.error}
        </div>
      )}
      <RuleDetail
        sourceData={processRule}
        indexingType={indexingType}
        retrievalMethod={retrievalMethod}
      />
    </div>
  )
}
