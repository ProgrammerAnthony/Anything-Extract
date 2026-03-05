'use client'

export default function LoadingState({
  message = '加载中...',
  fullHeight = true,
}: {
  message?: string
  fullHeight?: boolean
}) {
  const container = fullHeight
    ? 'flex h-full items-center justify-center p-8'
    : 'flex items-center justify-center py-6'

  return (
    <div className={container}>
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-transparent" />
        <span>{message}</span>
      </div>
    </div>
  )
}

