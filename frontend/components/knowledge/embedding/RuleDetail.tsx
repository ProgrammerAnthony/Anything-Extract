'use client'

import type { FC } from 'react'
import React from 'react'

export type ProcessRuleSource = {
  mode?: string
  rules?: {
    pre_processing_rules?: Array<{ id: string; enabled: boolean }>
    segmentation?: { separator?: string; max_tokens?: number; chunk_overlap?: number }
    subchunk_segmentation?: { max_tokens?: number }
    parent_mode?: string
  }
}

export type RuleDetailProps = {
  sourceData?: ProcessRuleSource | null
  indexingType?: string
  retrievalMethod?: string
}

const RULE_NAMES: Record<string, string> = {
  remove_extra_spaces: '去除多余空白',
  remove_urls_emails: '去除 URL/邮箱',
  remove_stopwords: '去除停用词',
}

const RETRIEVAL_LABELS: Record<string, string> = {
  semantic_search: '向量检索',
  full_text_search: '全文检索',
  hybrid_search: '混合检索',
  keyword_search: '关键词检索',
}

const RuleDetail: FC<RuleDetailProps> = React.memo(({
  sourceData,
  indexingType,
  retrievalMethod,
}) => {
  const getValue = (field: string): string | number => {
    const defaultValue = '-'
    if (!sourceData?.mode)
      return defaultValue

    const maxTokens = typeof sourceData?.rules?.segmentation?.max_tokens === 'number'
      ? sourceData.rules.segmentation.max_tokens
      : defaultValue

    const childMaxTokens = typeof sourceData?.rules?.subchunk_segmentation?.max_tokens === 'number'
      ? sourceData.rules.subchunk_segmentation!.max_tokens
      : defaultValue

    const isGeneralMode = sourceData.mode === 'custom' || sourceData.mode === 'automatic'

    const fieldValueMap: Record<string, string | number> = {
      mode: isGeneralMode
        ? '自定义'
        : `层级 · ${sourceData?.rules?.parent_mode === 'paragraph' ? '段落' : '全文'}`,
      segmentLength: isGeneralMode
        ? maxTokens
        : `父 ${maxTokens}; 子 ${childMaxTokens}`,
      textCleaning: sourceData?.rules?.pre_processing_rules
        ?.filter(rule => rule.enabled)
        .map(rule => RULE_NAMES[rule.id] || rule.id)
        .join(', ') || defaultValue,
    }

    return fieldValueMap[field] ?? defaultValue
  }

  const isEconomical = indexingType === 'economy'
  const retrievalLabel = RETRIEVAL_LABELS[retrievalMethod || 'semantic_search'] || retrievalMethod || '-'

  return (
    <div className="py-3">
      <div className="flex flex-col gap-y-1">
        <div className="flex text-xs">
          <span className="w-24 shrink-0 text-gray-500">分段模式</span>
          <span className="text-gray-800">{String(getValue('mode'))}</span>
        </div>
        <div className="flex text-xs">
          <span className="w-24 shrink-0 text-gray-500">段落长度</span>
          <span className="text-gray-800">{String(getValue('segmentLength'))}</span>
        </div>
        <div className="flex text-xs">
          <span className="w-24 shrink-0 text-gray-500">文本清洗</span>
          <span className="text-gray-800">{String(getValue('textCleaning'))}</span>
        </div>
      </div>
      <div className="my-2 border-t border-gray-100" />
      <div className="flex text-xs">
        <span className="w-24 shrink-0 text-gray-500">索引方式</span>
        <span className="text-gray-800">{isEconomical ? '经济模式' : '高质量'}</span>
      </div>
      <div className="flex text-xs">
        <span className="w-24 shrink-0 text-gray-500">检索设置</span>
        <span className="text-gray-800">{retrievalLabel}</span>
      </div>
    </div>
  )
})

RuleDetail.displayName = 'RuleDetail'

export default RuleDetail
