'use client'

export default function ErrorState({
  title = '加载失败',
  description,
  onRetry,
}: {
  title?: string
  description?: string
  onRetry?: () => void
}) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-center">
        <div className="text-sm font-semibold text-red-700">{title}</div>
        {description && <div className="mt-1 text-xs text-red-600">{description}</div>}
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
          >
            重试
          </button>
        )}
      </div>
    </div>
  )
}

