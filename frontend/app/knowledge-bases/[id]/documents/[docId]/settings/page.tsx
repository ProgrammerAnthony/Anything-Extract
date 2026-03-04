'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Database, FileText, Layers3, Search, Settings2 } from 'lucide-react'

import PageHeader from '@/components/layout/PageHeader'
import { usePageContext } from '@/components/layout/PageContext'
import KnowledgeDetailTabs from '@/components/knowledge/KnowledgeDetailTabs'
import { knowledgeBaseApi } from '@/lib/api'
import type { DocumentModel, ProcessRuleModel, RetrievalConfig } from '@/lib/knowledge/types'

type RetrievalMethod = RetrievalConfig['search_method']
type ProcessMode = 'automatic' | 'custom' | 'hierarchical'

const RETRIEVAL_OPTIONS: Array<{
  value: RetrievalMethod
  title: string
  desc: string
  icon: ReactNode
}> = [
  {
    value: 'semantic_search',
    title: '向量检索',
    desc: '通过语义向量计算匹配相关分段',
    icon: <Database className="size-4" />,
  },
  {
    value: 'full_text_search',
    title: '全文检索',
    desc: '按关键词在全文索引中匹配分段',
    icon: <FileText className="size-4" />,
  },
  {
    value: 'hybrid_search',
    title: '混合检索',
    desc: '组合语义检索与全文检索结果',
    icon: <Layers3 className="size-4" />,
  },
  {
    value: 'keyword_search',
    title: '关键词检索',
    desc: '优先使用倒排关键词进行召回',
    icon: <Search className="size-4" />,
  },
]

const DOC_FORM_OPTIONS: Array<{
  value: 'text_model' | 'qa_model' | 'hierarchical_model'
  title: string
  desc: string
}> = [
  { value: 'text_model', title: '通用文本', desc: '适用于大多数文档内容切分场景' },
  { value: 'qa_model', title: '问答模式', desc: '问答对结构文档，保留问题与答案' },
  { value: 'hierarchical_model', title: '父子分段', desc: '适合长文档构建父子分段层级' },
]

function defaultRule(): ProcessRuleModel {
  // 文档未配置规则时使用默认兜底，避免界面字段出现空值。
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

export default function DocumentSettingsPage() {
  const params = useParams()
  const router = useRouter()
  const kbId = params.id as string
  const docId = params.docId as string
  const { secondaryCollapsed, onOpenSidebar } = usePageContext()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [documentInfo, setDocumentInfo] = useState<DocumentModel | null>(null)

  const [docForm, setDocForm] = useState<'text_model' | 'qa_model' | 'hierarchical_model'>('text_model')
  const [docLanguage, setDocLanguage] = useState('Chinese Simplified')
  const [indexingTechnique, setIndexingTechnique] = useState<'high_quality' | 'economy'>('high_quality')
  const [retrievalMethod, setRetrievalMethod] = useState<RetrievalMethod>('semantic_search')
  const [topK, setTopK] = useState(3)
  const [scoreThresholdEnabled, setScoreThresholdEnabled] = useState(false)
  const [scoreThreshold, setScoreThreshold] = useState(0.5)

  const [processMode, setProcessMode] = useState<ProcessMode>('automatic')
  const [segmentIdentifier, setSegmentIdentifier] = useState('\n')
  const [maxTokens, setMaxTokens] = useState(500)
  const [chunkOverlap, setChunkOverlap] = useState(50)
  const [removeExtraSpaces, setRemoveExtraSpaces] = useState(true)
  const [removeUrlsEmails, setRemoveUrlsEmails] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      // 读取文档详情后，将后端规则和检索参数完整回填到设置表单。
      const response = await knowledgeBaseApi.getDocument(kbId, docId)
      if (!response.data.success)
        return

      const doc = response.data.data.document as DocumentModel
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
      const segmentation = rule.rules?.segmentation || defaultRule().rules.segmentation!
      setProcessMode(rule.mode || 'automatic')
      setSegmentIdentifier(segmentation.separator || '\n')
      setMaxTokens(segmentation.max_tokens || 500)
      setChunkOverlap(segmentation.chunk_overlap || 50)

      const preRules = rule.rules?.pre_processing_rules || []
      const removeSpacesRule = preRules.find(item => item.id === 'remove_extra_spaces')
      const removeUrlsRule = preRules.find(item => item.id === 'remove_urls_emails')
      setRemoveExtraSpaces(removeSpacesRule ? removeSpacesRule.enabled : true)
      setRemoveUrlsEmails(removeUrlsRule ? removeUrlsRule.enabled : false)
    }
    finally {
      setLoading(false)
    }
  }, [docId, kbId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const processRulePayload = useMemo(() => {
    // 提交时统一组装处理规则结构，保持接口字段稳定。
    return {
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
    }
  }, [chunkOverlap, maxTokens, processMode, removeExtraSpaces, removeUrlsEmails, segmentIdentifier])

  const availableRetrievalOptions = useMemo(() => {
    // 经济模式仅展示关键词检索；高质量模式展示向量/全文/混合。
    if (indexingTechnique === 'economy')
      return RETRIEVAL_OPTIONS.filter(item => item.value === 'keyword_search')
    return RETRIEVAL_OPTIONS.filter(item => item.value !== 'keyword_search')
  }, [indexingTechnique])

  useEffect(() => {
    if (!availableRetrievalOptions.some(item => item.value === retrievalMethod))
      setRetrievalMethod(availableRetrievalOptions[0].value)
  }, [availableRetrievalOptions, retrievalMethod])

  const saveSettings = async () => {
    setSaving(true)
    try {
      // 将页面配置一次性保存到文档设置接口，便于后续分段与召回直接生效。
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
      alert('文档设置保存成功')
      await loadData()
    }
    catch (error: any) {
      alert(error?.response?.data?.detail || '保存失败')
    }
    finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-gray-500">加载中...</div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-[#f3f6fd]">
      <PageHeader
        title={`${documentInfo?.filename || '文档'} · 分段设置`}
        secondaryCollapsed={secondaryCollapsed}
        onOpenSidebar={onOpenSidebar}
      />

      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="mx-auto max-w-6xl">
          <KnowledgeDetailTabs knowledgeBaseId={kbId} />

          <div className="space-y-4">
            <section className="rounded-2xl border border-gray-200 bg-white p-5">
              <div className="mb-3 flex items-center gap-2">
                <Settings2 className="size-4 text-gray-500" />
                <h2 className="text-sm font-semibold text-gray-800">分段结构</h2>
              </div>

              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                {DOC_FORM_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setDocForm(option.value)}
                    className={`rounded-xl border p-3 text-left transition ${
                      docForm === option.value
                        ? 'border-[#528bff] bg-[#f5f8ff] shadow-sm'
                        : 'border-gray-200 bg-white hover:border-[#b2ccff] hover:bg-gray-50'
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between text-sm font-medium text-gray-800">
                      <span>{option.title}</span>
                      <span className={`h-4 w-4 rounded-full border-2 ${
                        docForm === option.value ? 'border-[#155eef] bg-[#155eef]' : 'border-gray-300'
                      }`}
                      />
                    </div>
                    <div className="text-xs text-gray-500">{option.desc}</div>
                  </button>
                ))}
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <div className="mb-1 text-xs text-gray-500">文档语言</div>
                  <input
                    value={docLanguage}
                    onChange={e => setDocLanguage(e.target.value)}
                    className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm"
                  />
                </div>
                <div>
                  <div className="mb-1 text-xs text-gray-500">处理模式</div>
                  <select
                    value={processMode}
                    onChange={e => setProcessMode(e.target.value as ProcessMode)}
                    className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm"
                  >
                    <option value="automatic">automatic</option>
                    <option value="custom">custom</option>
                    <option value="hierarchical">hierarchical</option>
                  </select>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <div className="mb-1 text-xs text-gray-500">分段标识符</div>
                  <input
                    value={segmentIdentifier}
                    onChange={e => setSegmentIdentifier(e.target.value)}
                    className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm"
                    placeholder="例如 \\n"
                  />
                </div>
                <div>
                  <div className="mb-1 text-xs text-gray-500">最大分段长度（tokens）</div>
                  <input
                    type="number"
                    min={50}
                    max={4000}
                    value={maxTokens}
                    onChange={e => setMaxTokens(Math.max(50, Math.min(4000, Number(e.target.value) || 500)))}
                    className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm"
                  />
                </div>
                <div>
                  <div className="mb-1 text-xs text-gray-500">分段重叠长度</div>
                  <input
                    type="number"
                    min={0}
                    max={2000}
                    value={chunkOverlap}
                    onChange={e => setChunkOverlap(Math.max(0, Math.min(2000, Number(e.target.value) || 0)))}
                    className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm"
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-6">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={removeExtraSpaces} onChange={e => setRemoveExtraSpaces(e.target.checked)} />
                  清理多余空格
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={removeUrlsEmails} onChange={e => setRemoveUrlsEmails(e.target.checked)} />
                  清理 URL / 邮箱
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-5">
              <div className="mb-3 text-sm font-semibold text-gray-800">索引方式与检索策略</div>

              <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setIndexingTechnique('high_quality')}
                  className={`rounded-xl border p-3 text-left transition ${
                    indexingTechnique === 'high_quality'
                      ? 'border-[#528bff] bg-[#f5f8ff] shadow-sm'
                      : 'border-gray-200 bg-white hover:border-[#b2ccff] hover:bg-gray-50'
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between text-sm font-medium text-gray-800">
                    <span>高质量索引</span>
                    <span className={`h-4 w-4 rounded-full border-2 ${
                      indexingTechnique === 'high_quality' ? 'border-[#155eef] bg-[#155eef]' : 'border-gray-300'
                    }`}
                    />
                  </div>
                  <div className="text-xs text-gray-500">启用向量化与高级检索能力，支持向量/全文/混合检索。</div>
                </button>
                <button
                  type="button"
                  onClick={() => setIndexingTechnique('economy')}
                  className={`rounded-xl border p-3 text-left transition ${
                    indexingTechnique === 'economy'
                      ? 'border-[#528bff] bg-[#f5f8ff] shadow-sm'
                      : 'border-gray-200 bg-white hover:border-[#b2ccff] hover:bg-gray-50'
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between text-sm font-medium text-gray-800">
                    <span>经济模式</span>
                    <span className={`h-4 w-4 rounded-full border-2 ${
                      indexingTechnique === 'economy' ? 'border-[#155eef] bg-[#155eef]' : 'border-gray-300'
                    }`}
                    />
                  </div>
                  <div className="text-xs text-gray-500">优先关键词检索，资源占用更低，适合轻量场景。</div>
                </button>
              </div>

              <div className="mb-4">
                <div className="mb-1 text-xs text-gray-500">Top K</div>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={topK}
                  onChange={e => setTopK(Math.max(1, Math.min(20, Number(e.target.value) || 3)))}
                  className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm md:w-56"
                />
              </div>

              {indexingTechnique === 'economy' && (
                <div className="mb-3 rounded-xl border border-[#fcd9bd] bg-[#fffbf6] px-3 py-2 text-xs text-[#b45309]">
                  经济模式下检索方式固定为关键词检索。
                </div>
              )}

              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {availableRetrievalOptions.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setRetrievalMethod(option.value)}
                    className={`rounded-xl border p-3 text-left transition ${
                      retrievalMethod === option.value
                        ? 'border-[#5147e5] bg-[#f5f4ff]'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className="mb-1 flex items-center gap-2 text-sm font-medium text-gray-800">
                      <span className={retrievalMethod === option.value ? 'text-[#5147e5]' : 'text-gray-500'}>
                        {option.icon}
                      </span>
                      {option.title}
                    </div>
                    <div className="text-xs text-gray-500">{option.desc}</div>
                  </button>
                ))}
              </div>

              <div className="mt-4 flex items-center gap-3">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={scoreThresholdEnabled}
                    onChange={e => setScoreThresholdEnabled(e.target.checked)}
                  />
                  启用分数阈值
                </label>
                <input
                  type="number"
                  step={0.01}
                  min={0}
                  max={1}
                  disabled={!scoreThresholdEnabled}
                  value={scoreThreshold}
                  onChange={e => setScoreThreshold(Number(e.target.value) || 0)}
                  className="h-8 w-28 rounded-lg border border-gray-300 px-2 text-sm disabled:bg-gray-100"
                />
              </div>
            </section>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => router.back()}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={saveSettings}
                disabled={saving}
                className="rounded-lg bg-[#5147e5] px-4 py-2 text-sm text-white hover:bg-[#4338ca] disabled:bg-gray-300"
              >
                {saving ? '保存中...' : '保存设置'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
