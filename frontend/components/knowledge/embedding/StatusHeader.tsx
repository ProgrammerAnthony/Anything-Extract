'use client'

import { Loader2, PauseCircle, PlayCircle } from 'lucide-react'
import type { FC } from 'react'
import React from 'react'

export type StatusHeaderProps = {
  isEmbedding: boolean
  isCompleted: boolean
  isPaused: boolean
  isError: boolean
  onPause?: () => void
  onResume?: () => void
  isPauseLoading?: boolean
  isResumeLoading?: boolean
}

const STATUS_TEXT: Record<string, string> = {
  embedding: '索引中',
  completed: '已完成',
  paused: '已暂停',
  error: '索引失败',
}

const StatusHeader: FC<StatusHeaderProps> = React.memo(({
  isEmbedding,
  isCompleted,
  isPaused,
  isError,
  onPause,
  onResume,
  isPauseLoading,
  isResumeLoading,
}) => {
  const getStatusText = () => {
    if (isEmbedding)
      return STATUS_TEXT.embedding
    if (isCompleted)
      return STATUS_TEXT.completed
    if (isPaused)
      return STATUS_TEXT.paused
    if (isError)
      return STATUS_TEXT.error
    return ''
  }

  const buttonBaseClass = 'flex items-center gap-x-1 rounded-md border border-gray-200 bg-white px-1.5 py-1 shadow-sm disabled:cursor-not-allowed disabled:opacity-50 hover:bg-gray-50'

  return (
    <div className="flex h-6 items-center gap-x-1">
      {isEmbedding && <Loader2 className="h-4 w-4 animate-spin text-gray-500" />}
      <span className="grow text-xs font-semibold uppercase tracking-wide text-gray-600">
        {getStatusText()}
      </span>
      {isEmbedding && onPause && (
        <button
          type="button"
          className={buttonBaseClass}
          onClick={onPause}
          disabled={isPauseLoading}
        >
          <PauseCircle className="h-3.5 w-3.5 text-gray-600" />
          <span className="pr-[3px] text-xs font-medium text-gray-600">暂停</span>
        </button>
      )}
      {isPaused && onResume && (
        <button
          type="button"
          className={buttonBaseClass}
          onClick={onResume}
          disabled={isResumeLoading}
        >
          <PlayCircle className="h-3.5 w-3.5 text-gray-600" />
          <span className="pr-[3px] text-xs font-medium text-gray-600">恢复</span>
        </button>
      )}
    </div>
  )
})

StatusHeader.displayName = 'StatusHeader'

export default StatusHeader
