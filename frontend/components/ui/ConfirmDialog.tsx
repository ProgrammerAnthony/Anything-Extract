'use client'

import type { ReactNode } from 'react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  type?: 'danger' | 'default'
  onConfirm: () => void
  onClose: () => void
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmText = '确定',
  cancelText = '取消',
  type = 'default',
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  if (!open)
    return null

  const accentBg = type === 'danger' ? 'bg-red-100 text-red-500' : 'bg-blue-100 text-blue-500'
  const confirmBtn = type === 'danger'
    ? 'bg-red-600 hover:bg-red-700'
    : 'bg-[#5147e5] hover:bg-[#4338ca]'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-full ${accentBg}`}>
            <span className="text-lg font-semibold">!</span>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
            {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded px-4 py-2 text-sm text-white ${confirmBtn}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

