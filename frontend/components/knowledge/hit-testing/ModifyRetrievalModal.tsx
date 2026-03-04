'use client'

import {
  Database,
  Files,
  Sparkles,
  Search,
  X,
} from 'lucide-react'
import type { FC } from 'react'
import React, { useEffect, useState } from 'react'
import type { RetrievalConfig } from '@/lib/knowledge/types'

const DEFAULT_CONFIG: RetrievalConfig = {
  search_method: 'semantic_search',
  reranking_enable: false,
  top_k: 3,
  score_threshold_enabled: false,
  score_threshold: 0.5,
}

function mergeConfig(prev: RetrievalConfig, partial: Partial<RetrievalConfig>): RetrievalConfig {
  return { ...DEFAULT_CONFIG, ...prev, ...partial }
}

const METHOD_LABELS: Record<string, string> = {
  semantic_search: '向量检索',
  full_text_search: '全文检索',
  hybrid_search: '混合检索',
  keyword_search: '关键词检索',
}

const METHOD_DESC: Record<string, string> = {
  semantic_search: '通过生成查询嵌入并查询与其向量表示最相似的文本分段',
  full_text_search: '索引文档中的所有词汇，从而允许用户查询任意词汇，并返回包含这些词汇的文本片段',
  hybrid_search: '同时执行全文检索和向量检索，并应用重排序步骤，从两类查询结果中选择匹配用户问题的最佳结果',
  keyword_search: '基于关键词倒排索引进行检索，适合经济模式',
}

type ModifyRetrievalModalProps = {
  indexMethod: 'high_quality' | 'economy'
  value: RetrievalConfig
  isShow: boolean
  onHide: () => void
  onSave: (value: RetrievalConfig) => void
}

const ModifyRetrievalModal: FC<ModifyRetrievalModalProps> = ({
  indexMethod,
  value,
  isShow,
  onHide,
  onSave,
}) => {
  const [config, setConfig] = useState<RetrievalConfig>(value)

  useEffect(() => {
    if (isShow)
      setConfig(mergeConfig(DEFAULT_CONFIG, value))
  }, [isShow, value])

  const handleSave = () => {
    onSave(mergeConfig(value, config))
    onHide()
  }

  const methods = indexMethod === 'economy'
    ? [{ value: 'keyword_search' as const, title: METHOD_LABELS.keyword_search, desc: METHOD_DESC.keyword_search, icon: Search }]
    : [
        { value: 'semantic_search' as const, title: METHOD_LABELS.semantic_search, desc: METHOD_DESC.semantic_search, icon: Database },
        { value: 'full_text_search' as const, title: METHOD_LABELS.full_text_search, desc: METHOD_DESC.full_text_search, icon: Files },
        { value: 'hybrid_search' as const, title: METHOD_LABELS.hybrid_search, desc: METHOD_DESC.hybrid_search, icon: Sparkles },
      ]

  if (!isShow)
    return null

  return (
    <div
      className="flex w-full flex-col rounded-2xl border border-gray-200 bg-white shadow-xl"
      style={{ height: 'calc(100vh - 72px)' }}
    >
      <div className="flex shrink-0 justify-between border-b border-gray-100 px-4 pb-2 pt-4">
        <div>
          <div className="text-base font-semibold text-gray-900">检索设置</div>
          <div className="mt-0.5 text-xs font-normal leading-[18px] text-gray-500">
            <a
              target="_blank"
              rel="noopener noreferrer"
              href="https://docs.dify.ai/use-dify/knowledge/create-knowledge/setting-indexing-methods"
              className="text-[#5147e5] hover:underline"
            >
              了解更多关于检索方法。
            </a>
          </div>
        </div>
        <button
          type="button"
          onClick={onHide}
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="mb-2 text-[13px] font-semibold leading-6 text-gray-600">检索方法</div>
        <div className="flex flex-col gap-2">
          {methods.map(({ value: methodValue, title, desc, icon: Icon }) => {
            const isActive = config.search_method === methodValue
            return (
              <div
                key={methodValue}
                className={`rounded-xl border transition ${
                  isActive
                    ? 'border-[#5147e5] bg-white shadow-sm'
                    : 'border-gray-200 bg-gray-50/50 hover:border-gray-300'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setConfig(prev => ({ ...prev, search_method: methodValue }))}
                  className="flex w-full items-start gap-3 p-3 text-left"
                >
                  <Icon className={`mt-0.5 size-4 shrink-0 ${isActive ? 'text-[#5147e5]' : 'text-gray-400'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-gray-900">{title}</div>
                    <div className="mt-0.5 text-xs text-gray-500">{desc}</div>
                  </div>
                </button>
                {isActive && (
                  <div className="border-t border-gray-100 px-3 pb-3 pt-2">
                    <div className="space-y-3">
                      <label className="flex items-center justify-between text-xs text-gray-600">
                        <span>Top K</span>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={config.top_k ?? 3}
                          onChange={e => setConfig(prev => ({ ...prev, top_k: Math.max(1, Math.min(20, Number(e.target.value) || 3)) }))}
                          className="h-8 w-16 rounded-md border border-gray-200 px-2 text-sm"
                        />
                      </label>
                      <label className="flex items-center gap-2 text-xs text-gray-600">
                        <input
                          type="checkbox"
                          checked={config.score_threshold_enabled ?? false}
                          onChange={e => setConfig(prev => ({ ...prev, score_threshold_enabled: e.target.checked }))}
                        />
                        Score 阈值
                      </label>
                      {config.score_threshold_enabled && (
                        <input
                          type="number"
                          min={0}
                          max={1}
                          step={0.01}
                          value={config.score_threshold ?? 0.5}
                          onChange={e => setConfig(prev => ({ ...prev, score_threshold: Number(e.target.value) || 0 }))}
                          className="h-8 w-20 rounded-md border border-gray-200 px-2 text-sm"
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex shrink-0 justify-end gap-2 border-t border-gray-100 p-4">
        <button
          type="button"
          onClick={onHide}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          取消
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="rounded-lg bg-[#5147e5] px-4 py-2 text-sm font-medium text-white hover:bg-[#453ac8]"
        >
          保存
        </button>
      </div>
    </div>
  )
}

export default React.memo(ModifyRetrievalModal)
