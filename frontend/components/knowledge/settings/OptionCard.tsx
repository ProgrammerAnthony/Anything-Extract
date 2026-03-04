'use client'

import type { ReactNode } from 'react'
import React from 'react'
import { cn } from '@/lib/utils'

type OptionCardProps<T> = {
  id: T
  className?: string
  isActive?: boolean
  icon?: ReactNode
  iconActiveColor?: string
  title: string
  description?: string
  isRecommended?: boolean
  disabled?: boolean
  onClick?: (id: T) => void
  children?: ReactNode
  showChildren?: boolean
}

const OptionCard = <T,>({
  id,
  className,
  isActive,
  icon,
  iconActiveColor,
  title,
  description,
  isRecommended,
  disabled,
  onClick,
  children,
  showChildren,
}: OptionCardProps<T>) => (
  <div
    className={cn(
      'overflow-hidden rounded-xl border bg-white',
      isActive
        ? 'border-[#5147e5] ring-1 ring-[#5147e5]'
        : 'border-gray-200 hover:border-gray-300',
      (disabled || (!onClick && !isActive)) ? 'cursor-default opacity-90' : 'cursor-pointer',
      disabled && 'cursor-not-allowed opacity-50',
    )}
    onClick={() => {
      if (isActive || disabled || !onClick)
        return
      onClick(id)
    }}
    role={onClick ? 'button' : undefined}
  >
    <div className={cn('relative flex rounded-t-xl p-2', className)}>
      {!!icon && (
        <div
          className={cn(
            'flex size-6 shrink-0 items-center justify-center text-gray-400',
            isActive && iconActiveColor,
          )}
        >
          {icon}
        </div>
      )}
      <div className="flex grow flex-col gap-y-0.5 py-px">
        <div className="flex items-center gap-x-1">
          <span className="text-sm font-medium text-gray-700">{title}</span>
          {isRecommended && (
            <span className="rounded border border-[#5147e5] px-1.5 py-0.5 text-xs text-[#5147e5]">推荐</span>
          )}
        </div>
        {description && (
          <div className="text-xs text-gray-500">{description}</div>
        )}
      </div>
    </div>
    {!!(children && showChildren) && (
      <div className="relative rounded-b-xl border-t border-gray-100 bg-gray-50/80 p-4">
        <div className="absolute left-[14px] top-[-8px] size-4 rotate-45 border-l border-t border-gray-50 bg-gray-50" />
        {children}
      </div>
    )}
  </div>
)

export default React.memo(OptionCard) as typeof OptionCard
