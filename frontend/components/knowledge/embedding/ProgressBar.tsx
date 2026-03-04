'use client'

import { cn } from '@/lib/utils'
import type { FC } from 'react'
import React from 'react'

export type ProgressBarProps = {
  percent: number
  isEmbedding: boolean
  isCompleted: boolean
  isPaused: boolean
  isError: boolean
}

const ProgressBar: FC<ProgressBarProps> = React.memo(({
  percent,
  isEmbedding,
  isCompleted,
  isPaused,
  isError,
}) => {
  const isActive = isEmbedding || isCompleted
  const isHighlighted = isPaused || isError

  return (
    <div
      className={cn(
        'flex h-2 w-full items-center overflow-hidden rounded-md border border-gray-200',
        isEmbedding ? 'bg-gray-100' : 'bg-gray-100',
      )}
    >
      <div
        className={cn(
          'h-full transition-all duration-300',
          isActive && !isHighlighted && 'bg-blue-500',
          isHighlighted && isPaused && 'bg-amber-400',
          isHighlighted && isError && 'bg-red-500',
        )}
        style={{ width: `${percent}%` }}
      />
    </div>
  )
})

ProgressBar.displayName = 'ProgressBar'

export default ProgressBar
