'use client'

import type { FC } from 'react'
import React from 'react'

export type SegmentProgressProps = {
  completedSegments?: number
  totalSegments?: number
  percent: number
}

const SegmentProgress: FC<SegmentProgressProps> = React.memo(({
  completedSegments,
  totalSegments,
  percent,
}) => {
  const completed = completedSegments ?? '--'
  const total = totalSegments ?? '--'

  return (
    <div className="flex w-full items-center">
      <span className="text-xs font-medium text-gray-600">
        分段 {completed}/{total} · {percent}%
      </span>
    </div>
  )
})

SegmentProgress.displayName = 'SegmentProgress'

export default SegmentProgress
