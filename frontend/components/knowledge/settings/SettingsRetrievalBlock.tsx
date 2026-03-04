'use client'

import { Database, Files, Search, Sparkles } from 'lucide-react'
import type { FC } from 'react'
import React from 'react'
import type { RetrievalConfig } from '@/lib/knowledge/types'
import OptionCard from './OptionCard'

const METHOD_OPTIONS = [
  { value: 'semantic_search' as const, title: '向量检索', desc: '通过生成查询嵌入并查询与其向量表示最相似的文本分段', icon: Database },
  { value: 'full_text_search' as const, title: '全文检索', desc: '索引文档中的所有词汇，从而允许用户查询任意词汇，并返回包含这些词汇的文本片段', icon: Files },
  { value: 'hybrid_search' as const, title: '混合检索', desc: '同时执行全文检索和向量检索，并应用重排序步骤', icon: Sparkles, isRecommended: true },
]
const KEYWORD_OPTION = { value: 'keyword_search' as const, title: '关键词检索', desc: '基于关键词倒排索引进行检索，适合经济模式', icon: Search }

type SettingsRetrievalBlockProps = {
  indexMethod: 'high_quality' | 'economy'
  value: RetrievalConfig
  onChange: (value: RetrievalConfig) => void
  disabled?: boolean
}

const SettingsRetrievalBlock: FC<SettingsRetrievalBlockProps> = ({
  indexMethod,
  value,
  onChange,
  disabled = false,
}) => {
  const options = indexMethod === 'economy' ? [KEYWORD_OPTION] : METHOD_OPTIONS

  return (
    <div className="flex flex-col gap-y-2">
      {options.map(({ value: methodValue, title, desc, icon: Icon, isRecommended }) => {
        const isActive = value.search_method === methodValue
        return (
          <OptionCard
            key={methodValue}
            id={methodValue}
            isActive={isActive}
            icon={<Icon className="size-[18px]" />}
            iconActiveColor="text-[#5147e5]"
            title={title}
            description={desc}
            isRecommended={isRecommended}
            disabled={disabled}
            onClick={id => onChange({ ...value, search_method: id })}
            showChildren={isActive}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <label className="flex items-center gap-2 text-xs text-gray-600">
                  Top K
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={value.top_k ?? 3}
                    onChange={e =>
                      onChange({
                        ...value,
                        top_k: Math.max(1, Math.min(20, Number(e.target.value) || 3)),
                      })
                    }
                    className="h-8 w-16 rounded-md border border-gray-200 px-2 text-sm"
                  />
                </label>
                <label className="flex items-center gap-2 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={value.score_threshold_enabled ?? false}
                    onChange={e =>
                      onChange({ ...value, score_threshold_enabled: e.target.checked })
                    }
                  />
                  Score 阈值
                </label>
              </div>
              {value.score_threshold_enabled && (
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={value.score_threshold ?? 0.5}
                  onChange={e =>
                    onChange({ ...value, score_threshold: Number(e.target.value) || 0 })
                  }
                  className="h-8 w-20 rounded-md border border-gray-200 px-2 text-sm"
                />
              )}
            </div>
          </OptionCard>
        )
      })}
    </div>
  )
}

export default React.memo(SettingsRetrievalBlock)
