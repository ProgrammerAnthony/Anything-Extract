'use client'

import type { ReactNode } from 'react'

export default function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 text-center">
      <div className="text-sm font-semibold text-gray-800">{title}</div>
      {description && <div className="mt-1 text-sm text-gray-500">{description}</div>}
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  )
}

