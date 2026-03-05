'use client'

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

type ToastVariant = 'success' | 'error' | 'info'

export type ToastInput = {
  title: string
  description?: string
  variant?: ToastVariant
  durationMs?: number
}

type ToastItem = {
  id: string
  title: string
  description?: string
  variant: ToastVariant
}

type ToastContextValue = {
  showToast: (toast: ToastInput) => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

function variantClasses(variant: ToastVariant) {
  switch (variant) {
    case 'success':
      return 'border-emerald-200 bg-emerald-50 text-emerald-900'
    case 'error':
      return 'border-red-200 bg-red-50 text-red-900'
    default:
      return 'border-gray-200 bg-white text-gray-900'
  }
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timersRef = useRef<Record<string, number>>({})

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current[id]
    if (timer)
      window.clearTimeout(timer)
    delete timersRef.current[id]
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const showToast = useCallback(
    ({ title, description, variant = 'info', durationMs = 2600 }: ToastInput) => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
      setToasts(prev => [...prev, { id, title, description, variant }])
      timersRef.current[id] = window.setTimeout(() => dismiss(id), durationMs)
    },
    [dismiss],
  )

  const value = useMemo<ToastContextValue>(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx)
    throw new Error('useToast must be used within a ToastProvider')
  return ctx
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[]
  onDismiss: (id: string) => void
}) {
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[99999] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`pointer-events-auto rounded-lg border px-4 py-3 shadow-lg ${variantClasses(t.variant)}`}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{t.title}</div>
              {t.description && (
                <div className="mt-0.5 line-clamp-2 text-sm text-gray-700">{t.description}</div>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              className="rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-black/5"
            >
              关闭
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

