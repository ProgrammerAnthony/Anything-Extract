'use client'

/**
 * 文档处理 STEP2 表单：分段设置、索引方式、检索设置 + 右侧预览。
 * 主按钮「保存并处理」：先 updateDocumentSettings，再 reindexDocument，最后回调 onSaveAndProcess（切 STEP3）。
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ChevronDown,
  Database,
  FileText,
  HelpCircle,
  Layers3,
  Search,
  Settings2,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react'

import OptionCard from '@/components/knowledge/settings/OptionCard'
import { knowledgeBaseApi } from '@/lib/api'
import type { DocumentModel, KnowledgeBase, ProcessRuleModel, RetrievalConfig } from '@/lib/knowledge/types'
import LoadingState from '@/components/ui/LoadingState'
import { useToast } from '@/components/ui/Toast'

type RetrievalMethod = RetrievalConfig['search_method']
type ProcessMode = 'automatic' | 'custom' | 'hierarchical'

const RETRIEVAL_OPTIONS: Array<{ value: RetrievalMethod; title: string; desc: string; icon: ReactNode }> = [
  { value: 'semantic_search', title: '向量检索', desc: '通过语义向量计算匹配相关分段', icon: <Database className="size-4" /> },
  { value: 'full_text_search', title: '全文检索', desc: '按关键词在全文索引中匹配分段', icon: <FileText className="size-4" /> },
  { value: 'hybrid_search', title: '混合检索', desc: '组合语义检索与全文检索结果', icon: <Layers3 className="size-4" /> },
  { value: 'keyword_search', title: '关键词检索', desc: '优先使用倒排关键词进行召回', icon: <Search className="size-4" /> },
]

function defaultRule(): ProcessRuleModel {
  return {
    id: '',
    knowledge_base_id: '',
    mode: 'automatic',
    rules: {
      pre_processing_rules: [
        { id: 'remove_extra_spaces', enabled: true },
        { id: 'remove_urls_emails', enabled: false },
      ],
      segmentation: {
        separator: '\n',
        max_tokens: 500,
        chunk_overlap: 50,
      },
    },
  }
}

type ProcessStepTwoFormProps = {
  kbId: string
  docId: string
  onSaveAndProcess: () => void
}

export default function ProcessStepTwoForm({ kbId, docId, onSaveAndProcess }: ProcessStepTwoFormProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [documentInfo, setDocumentInfo] = useState<DocumentModel | null>(null)
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeBase | null>(null)

  const [docForm, setDocForm] = useState<'text_model' | 'qa_model' | 'hierarchical_model'>('text_model')
  const [docLanguage, setDocLanguage] = useState('Chinese Simplified')
  const [indexingTechnique, setIndexingTechnique] = useState<'high_quality' | 'economy'>('high_quality')
  const [retrievalMethod, setRetrievalMethod] = useState<RetrievalMethod>('semantic_search')
  const [topK, setTopK] = useState(3)
  const [scoreThresholdEnabled, setScoreThresholdEnabled] = useState(false)
  const [scoreThreshold, setScoreThreshold] = useState(0.5)

  const [processMode, setProcessMode] = useState<ProcessMode>('automatic')
  const [segmentIdentifier, setSegmentIdentifier] = useState('\n\n')
  const [maxTokens, setMaxTokens] = useState(1024)
  const [chunkOverlap, setChunkOverlap] = useState(50)
  const [removeExtraSpaces, setRemoveExtraSpaces] = useState(true)
  const [removeUrlsEmails, setRemoveUrlsEmails] = useState(false)
  const [useQaSegment, setUseQaSegment] = useState(false)

  const [previewData, setPreviewData] = useState<{ total_segments: number; preview: Array<{ content: string }> } | null>(null)
  const { showToast } = useToast()

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [docRes, kbRes] = await Promise.all([
        knowledgeBaseApi.getDocument(kbId, docId),
        knowledgeBaseApi.getById(kbId),
      ])
      if (kbRes.data.success)
        setKnowledgeBase(kbRes.data.data.knowledge_base as KnowledgeBase)
      if (!docRes.data.success) return
      const doc = docRes.data.data.document as DocumentModel
      setDocumentInfo(doc)

      setDocForm((doc.doc_form || 'text_model') as 'text_model' | 'qa_model' | 'hierarchical_model')
      setDocLanguage(doc.doc_language || 'Chinese Simplified')
      const technical = doc.technical_parameters
      setIndexingTechnique((technical?.indexing_technique || 'high_quality') as 'high_quality' | 'economy')
      setRetrievalMethod((technical?.retrieval_model?.search_method || 'semantic_search') as RetrievalMethod)
      setTopK(technical?.retrieval_model?.top_k || 3)
      setScoreThresholdEnabled(!!technical?.retrieval_model?.score_threshold_enabled)
      setScoreThreshold(technical?.retrieval_model?.score_threshold ?? 0.5)

      const rule = doc.document_process_rule || doc.dataset_process_rule || defaultRule()
      const segmentation = rule.rules?.segmentation || defaultRule().rules!.segmentation!
      setProcessMode((rule.mode || 'automatic') as ProcessMode)
      setSegmentIdentifier(segmentation.separator ?? '\n\n')
      setMaxTokens(segmentation.max_tokens ?? 1024)
      setChunkOverlap(segmentation.chunk_overlap ?? 50)
      const preRules = rule.rules?.pre_processing_rules || []
      const removeSpacesRule = preRules.find((item: { id: string }) => item.id === 'remove_extra_spaces')
      const removeUrlsRule = preRules.find((item: { id: string }) => item.id === 'remove_urls_emails')
      setRemoveExtraSpaces(removeSpacesRule ? removeSpacesRule.enabled : true)
      setRemoveUrlsEmails(removeUrlsRule ? removeUrlsRule.enabled : false)
    } finally {
      setLoading(false)
    }
  }, [docId, kbId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const processRulePayload = useMemo(
    () => ({
      mode: processMode,
      rules: {
        pre_processing_rules: [
          { id: 'remove_extra_spaces', enabled: removeExtraSpaces },
          { id: 'remove_urls_emails', enabled: removeUrlsEmails },
        ],
        segmentation: {
          separator: segmentIdentifier,
          max_tokens: maxTokens,
          chunk_overlap: chunkOverlap,
        },
      },
    }),
    [chunkOverlap, maxTokens, processMode, removeExtraSpaces, removeUrlsEmails, segmentIdentifier],
  )

  const availableRetrievalOptions = useMemo(() => {
    if (indexingTechnique === 'economy') return RETRIEVAL_OPTIONS.filter(item => item.value === 'keyword_search')
    return RETRIEVAL_OPTIONS.filter(item => item.value !== 'keyword_search')
  }, [indexingTechnique])

  useEffect(() => {
    if (!availableRetrievalOptions.some(item => item.value === retrievalMethod))
      setRetrievalMethod(availableRetrievalOptions[0].value)
  }, [availableRetrievalOptions, retrievalMethod])

  const handleReset = useCallback(() => {
    setSegmentIdentifier('\n\n')
    setMaxTokens(1024)
    setChunkOverlap(50)
    setRemoveExtraSpaces(true)
    setRemoveUrlsEmails(false)
    setUseQaSegment(false)
    setPreviewData(null)
  }, [])

  const handlePreviewChunks = useCallback(async () => {
    setPreviewLoading(true)
    setPreviewData(null)
    try {
      const res = await knowledgeBaseApi.previewDocumentChunks(kbId, docId, {
        process_rule: processRulePayload,
      })
      if (res.data.success && res.data.data)
        setPreviewData(res.data.data as { total_segments: number; preview: Array<{ content: string }> })
    } catch (e: any) {
      showToast({
        title: '预览失败',
        description: e?.response?.data?.detail,
        variant: 'error',
      })
    } finally {
      setPreviewLoading(false)
    }
  }, [kbId, docId, processRulePayload])

  const handleSaveAndProcess = async () => {
    setSaving(true)
    try {
      await knowledgeBaseApi.updateDocumentSettings(kbId, docId, {
        doc_form: docForm,
        doc_language: docLanguage,
        indexing_technique: indexingTechnique,
        process_rule: processRulePayload,
        retrieval_model: {
          ...(documentInfo?.technical_parameters?.retrieval_model || {}),
          search_method: retrievalMethod,
          top_k: topK,
          score_threshold_enabled: scoreThresholdEnabled,
          score_threshold: scoreThreshold,
        },
      })
      await knowledgeBaseApi.reindexDocument(kbId, docId)
      onSaveAndProcess()
    } catch (error: any) {
      showToast({
        title: '保存并处理失败',
        description: error?.response?.data?.detail,
        variant: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <LoadingState />
  }

  return (
    <div className="flex w-full max-w-[1400px] gap-6">
      <div className="min-w-0 flex-1 space-y-4">
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center justify-between gap-x-2 border-b border-gray-100 px-4 py-2">
            <span className="text-sm font-semibold uppercase tracking-wide text-gray-600">分段设置</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleReset}
                className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
              >
                重置
              </button>
              <button
                type="button"
                onClick={handlePreviewChunks}
                disabled={previewLoading}
                className="inline-flex items-center gap-1 rounded-lg bg-[#5147e5] px-3 py-1.5 text-sm text-white hover:bg-[#4338ca] disabled:opacity-60"
              >
                <Search className="size-4" />
                预览块
              </button>
            </div>
          </div>
          <div className="space-y-4 p-4">
            <div className="flex items-start gap-2">
              <Settings2 className="mt-0.5 size-4 shrink-0 text-gray-500" />
              <div>
                <div className="text-sm font-medium text-gray-800">通用</div>
                <div className="mt-0.5 text-xs text-gray-500">通用文本分块模式，检索和召回的块是相同的。</div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 flex items-center gap-1 text-xs text-gray-600">
                  分段标识符
                  <span className="text-gray-400" title="用于切分的分隔符">
                    <HelpCircle className="size-3" />
                  </span>
                </label>
                <input
                  value={segmentIdentifier.replace(/\n/g, '\\n')}
                  onChange={e => setSegmentIdentifier(e.target.value.replace(/\\n/g, '\n'))}
                  className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm"
                  placeholder="\\n\\n"
                />
              </div>
              <div>
                <label className="mb-1 text-xs text-gray-600">分段最大长度</label>
                <div className="flex gap-1">
                  <input
                    type="number"
                    min={50}
                    max={4000}
                    value={maxTokens}
                    onChange={e => setMaxTokens(Math.max(50, Math.min(4000, Number(e.target.value) || 500)))}
                    className="h-9 flex-1 rounded-lg border border-gray-200 px-3 text-sm"
                  />
                  <span className="flex h-9 items-center text-xs text-gray-500">characters</span>
                </div>
              </div>
              <div>
                <label className="mb-1 text-xs text-gray-600">分段重叠长度</label>
                <div className="flex gap-1">
                  <input
                    type="number"
                    min={0}
                    max={2000}
                    value={chunkOverlap}
                    onChange={e => setChunkOverlap(Math.max(0, Math.min(2000, Number(e.target.value) || 0)))}
                    className="h-9 flex-1 rounded-lg border border-gray-200 px-3 text-sm"
                  />
                  <span className="flex h-9 items-center text-xs text-gray-500">characters</span>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-xs font-medium text-gray-600">文本预处理规则</div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={removeExtraSpaces} onChange={e => setRemoveExtraSpaces(e.target.checked)} />
                替换掉连续的空格、换行符和制表符
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={removeUrlsEmails} onChange={e => setRemoveUrlsEmails(e.target.checked)} />
                删除所有 URL 和电子邮件地址
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={useQaSegment} onChange={e => setUseQaSegment(e.target.checked)} />
                使用 Q&A 分段
              </label>
              <select
                value={docLanguage}
                onChange={e => setDocLanguage(e.target.value)}
                className="h-8 rounded-md border border-gray-200 px-2 text-sm"
              >
                <option value="Chinese Simplified">语言 Chinese Simplified</option>
                <option value="English">English</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-gray-200 bg-white p-4">
          <Users className="mt-0.5 size-4 shrink-0 text-gray-500" />
          <div className="text-sm text-gray-600">使用父子模式时，子块用于检索，父块用作上下文。</div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-3 text-sm font-semibold text-gray-800">索引方式</div>
          <div className="flex flex-col gap-2">
            <OptionCard
              id="high_quality"
              isActive={indexingTechnique === 'high_quality'}
              icon={<Sparkles className="size-[18px]" />}
              iconActiveColor="text-orange-500"
              title="高质量"
              description="调用嵌入模型处理文档以实现更精确的检索，可以帮助LLM生成高质量的答案。"
              isRecommended
              onClick={() => setIndexingTechnique('high_quality')}
            />
            <OptionCard
              id="economy"
              isActive={indexingTechnique === 'economy'}
              icon={<Wallet className="size-[18px]" />}
              iconActiveColor="text-indigo-600"
              title="经济"
              description={`每个数据块使用 ${knowledgeBase?.keyword_number ?? 10} 个关键词进行检索，不会消耗任何 tokens，但会以降低检索准确性为代价。`}
              onClick={() => setIndexingTechnique('economy')}
            />
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-2 text-sm font-semibold text-gray-800">检索设置</div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-600">检索方式</span>
              <select
                value={retrievalMethod}
                onChange={e => setRetrievalMethod(e.target.value as RetrievalMethod)}
                className="h-8 rounded-lg border border-gray-200 px-2.5 text-sm"
              >
                {availableRetrievalOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.title}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              Top K
              <input
                type="number"
                min={1}
                max={20}
                value={topK}
                onChange={e => setTopK(Math.max(1, Math.min(20, Number(e.target.value) || 3)))}
                className="h-8 w-16 rounded-md border border-gray-200 px-2 text-sm"
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <input type="checkbox" checked={scoreThresholdEnabled} onChange={e => setScoreThresholdEnabled(e.target.checked)} />
              分数阈值
            </label>
            {scoreThresholdEnabled && (
              <input
                type="number"
                step={0.01}
                min={0}
                max={1}
                value={scoreThreshold}
                onChange={e => setScoreThreshold(Number(e.target.value) || 0)}
                className="h-8 w-20 rounded-md border border-gray-200 px-2 text-sm"
              />
            )}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleSaveAndProcess}
            disabled={saving}
            className="min-w-28 rounded-lg bg-[#5147e5] px-4 py-2 text-sm font-medium text-white hover:bg-[#4338ca] disabled:opacity-60"
          >
            {saving ? '处理中...' : '保存并处理'}
          </button>
        </div>
      </div>

      <div className="flex w-[420px] shrink-0 flex-col rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <span className="text-sm font-semibold text-gray-800">预览</span>
          <div className="flex items-center gap-1">
            <span className="truncate text-xs text-gray-500" title={documentInfo?.filename}>
              {documentInfo?.filename || '-'}
            </span>
            <ChevronDown className="size-4 text-gray-400" />
          </div>
        </div>
        <div className="px-4 py-2 text-xs text-gray-500">
          {previewData !== null ? `${previewData.total_segments} 预估块` : '0 预估块'}
        </div>
        <div className="min-h-[320px] flex-1 overflow-y-auto p-4">
          {previewLoading && (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <div className="size-8 animate-spin rounded-full border-2 border-[#5147e5] border-t-transparent" />
              <p className="text-sm text-gray-500">加载预览中...</p>
            </div>
          )}
          {!previewLoading && previewData === null && (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <Search className="size-10 text-gray-300" />
              <p className="text-center text-sm text-gray-500">点击左侧的「预览块」按钮来加载预览</p>
            </div>
          )}
          {!previewLoading && previewData && previewData.preview.length === 0 && (
            <div className="py-12 text-center text-sm text-gray-500">暂无分段预览</div>
          )}
          {!previewLoading && previewData && previewData.preview.length > 0 && (
            <div className="space-y-3">
              {previewData.preview.map((item, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-gray-100 bg-gray-50/50 p-3 text-sm text-gray-800"
                >
                  <div className="mb-1 text-xs font-medium text-gray-500">Chunk-{idx + 1}</div>
                  <div className="line-clamp-4 whitespace-pre-wrap">{item.content}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
