'use client'

/** 文档处理 STEP3 视图：嵌入完成、文档行、配置摘要、Access the API、前往文档、右侧「接下来做什么」。 */
import Link from 'next/link'
import { BookOpen, CheckCircle2, ExternalLink, FileText, ArrowRight } from 'lucide-react'
import type { DocumentModel, KnowledgeBase } from '@/lib/knowledge/types'

const CHUNK_MODE_LABEL: Record<string, string> = {
  text_model: '自定义',
  qa_model: 'Q&A',
  hierarchical_model: '父子分段',
}

const RETRIEVAL_LABEL: Record<string, string> = {
  semantic_search: '向量检索',
  full_text_search: '全文检索',
  hybrid_search: '混合检索',
  keyword_search: '倒排索引',
}

type ProcessStepThreeViewProps = {
  kbId: string
  docId: string
  documentInfo: DocumentModel | null
  knowledgeBase: KnowledgeBase | null
}

export default function ProcessStepThreeView({
  kbId,
  docId,
  documentInfo,
  knowledgeBase,
}: ProcessStepThreeViewProps) {
  const technical = documentInfo?.technical_parameters
  const rule = documentInfo?.document_process_rule || documentInfo?.dataset_process_rule
  const segmentation = rule?.rules?.segmentation
  const preRules = rule?.rules?.pre_processing_rules || []
  const removeSpaces = preRules.find((r: { id: string }) => r.id === 'remove_extra_spaces')?.enabled
  const modeLabel = segmentation ? CHUNK_MODE_LABEL[documentInfo?.doc_form || ''] || '自定义' : '-'
  const maxLen = segmentation?.max_tokens ?? '-'
  const preProcessText = removeSpaces ? '替换掉连续的空格、换行符和制表符' : '-'
  const indexMethod = technical?.indexing_technique === 'economy' ? '经济' : '高质量'
  const retrievalMethod = RETRIEVAL_LABEL[technical?.retrieval_model?.search_method || ''] || '向量检索'

  return (
    <div className="flex w-full gap-6">
      <div className="min-w-0 flex-1 max-w-[640px]">
        <div className="flex flex-col gap-y-3">
          <div className="flex items-center gap-x-1 text-sm font-semibold uppercase text-gray-600">
            嵌入已完成
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2">
              <FileText className="size-4 shrink-0 text-gray-500" />
              <span className="min-w-0 flex-1 truncate text-sm text-gray-800" title={documentInfo?.filename}>
                {documentInfo?.filename || '-'}
              </span>
              <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
            </div>
          </div>
          <div className="my-1 h-px bg-gray-200" />
          <div className="flex flex-col gap-1 text-sm">
            <div className="flex justify-between gap-2 py-1">
              <span className="text-gray-500">分段模式</span>
              <span className="text-gray-800">{modeLabel}</span>
            </div>
            <div className="flex justify-between gap-2 py-1">
              <span className="text-gray-500">最大分段长度</span>
              <span className="text-gray-800">{String(maxLen)}</span>
            </div>
            <div className="flex justify-between gap-2 py-1">
              <span className="text-gray-500">文本预处理规则</span>
              <span className="text-gray-800">{preProcessText}</span>
            </div>
            <div className="flex justify-between gap-2 py-1">
              <span className="text-gray-500">索引方式</span>
              <span className="text-gray-800">{indexMethod}</span>
            </div>
            <div className="flex justify-between gap-2 py-1">
              <span className="text-gray-500">检索设置</span>
              <span className="text-gray-800">{retrievalMethod}</span>
            </div>
          </div>
        </div>
        <div className="mt-6 flex items-center gap-x-2 py-2">
          <a
            href="/api-docs"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-[#5147e5] bg-white px-3 py-2 text-sm text-[#5147e5] hover:bg-[#f5f4ff]"
          >
            <ExternalLink className="size-4" />
            Access the API
          </a>
          <Link
            href={`/knowledge-bases/${kbId}/documents/${docId}`}
            className="inline-flex items-center gap-1 rounded-lg bg-[#5147e5] px-3 py-2 text-sm font-medium text-white hover:bg-[#4338ca]"
          >
            前往文档
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
      <div className="w-[328px] shrink-0 pr-2">
        <div className="flex flex-col gap-3 rounded-xl bg-gray-50 p-6">
          <div className="flex size-10 items-center justify-center rounded-[10px] bg-white shadow-md">
            <BookOpen className="size-5 text-[#5147e5]" />
          </div>
          <div className="text-base font-semibold text-gray-800">接下来做什么</div>
          <p className="text-sm text-gray-500">
            当文档完成索引处理后，知识库即可集成至应用内作为上下文使用。你可以在提示词编排页找到上下文设置。你也可以创建成可独立使用的 ChatGPT 索引插件发布。
          </p>
        </div>
      </div>
    </div>
  )
}
