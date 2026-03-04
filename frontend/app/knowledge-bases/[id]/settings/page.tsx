'use client'

/** 知识库设置页：名称、分段结构、索引方式、Embedding、检索设置（与 Dify 对齐）。 */
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { FileText, GitBranch, MessageCircle, Sparkles, Wallet } from 'lucide-react'

import PageHeader from '@/components/layout/PageHeader'
import { usePageContext } from '@/components/layout/PageContext'
import KnowledgeDetailTabs from '@/components/knowledge/KnowledgeDetailTabs'
import OptionCard from '@/components/knowledge/settings/OptionCard'
import SettingsRetrievalBlock from '@/components/knowledge/settings/SettingsRetrievalBlock'
import { knowledgeBaseApi } from '@/lib/api'
import type { KnowledgeBase, RetrievalConfig } from '@/lib/knowledge/types'

const rowClass = 'flex gap-x-1'
const labelClass = 'flex items-center shrink-0 w-[180px] h-7 pt-1'

const CHUNK_OPTIONS: Array<{
  id: 'text_model' | 'qa_model' | 'hierarchical_model'
  title: string
  description: string
  icon: React.ReactNode
}> = [
  { id: 'text_model', title: '通用文本', description: '按段落或自定义分隔符切分', icon: <FileText className="size-[18px]" /> },
  { id: 'qa_model', title: 'Q&A', description: '一问一答格式', icon: <MessageCircle className="size-[18px]" /> },
  { id: 'hierarchical_model', title: '父子分段', description: '父分段与子分段层级', icon: <GitBranch className="size-[18px]" /> },
]

function defaultRetrievalConfig(kb: KnowledgeBase | null): RetrievalConfig {
  const base = kb?.retrieval_model
  const indexingTechnique = kb?.indexing_technique ?? 'high_quality'
  return {
    search_method:
      indexingTechnique === 'economy' ? 'keyword_search' : (base?.search_method || 'semantic_search'),
    reranking_enable: base?.reranking_enable ?? false,
    reranking_model: base?.reranking_model,
    reranking_mode: base?.reranking_mode,
    top_k: base?.top_k ?? 3,
    score_threshold_enabled: base?.score_threshold_enabled ?? false,
    score_threshold: base?.score_threshold ?? 0.5,
    weights: base?.weights ?? null,
  }
}

export default function KnowledgeBaseSettingsPage() {
  const params = useParams()
  const kbId = params.id as string
  const { secondaryCollapsed, onOpenSidebar } = usePageContext()

  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeBase | null>(null)
  const [loading, setLoading] = useState(false)

  const [name, setName] = useState('')
  const [indexingTechnique, setIndexingTechnique] = useState<'high_quality' | 'economy'>('high_quality')
  const [docForm, setDocForm] = useState<'text_model' | 'qa_model' | 'hierarchical_model'>('text_model')
  const [keywordNumber, setKeywordNumber] = useState(10)
  const [embeddingModel, setEmbeddingModel] = useState('nomic-embed-text')
  const [embeddingProvider, setEmbeddingProvider] = useState('ollama')
  const [retrievalConfig, setRetrievalConfig] = useState<RetrievalConfig>(() => defaultRetrievalConfig(null))

  useEffect(() => {
    const load = async () => {
      const response = await knowledgeBaseApi.getById(kbId)
      if (!response.data.success) return

      const kb = response.data.data.knowledge_base as KnowledgeBase
      setKnowledgeBase(kb)
      setName(kb.name)
      setIndexingTechnique(kb.indexing_technique)
      setDocForm(kb.doc_form)
      setKeywordNumber(kb.keyword_number ?? 10)
      setEmbeddingModel(kb.embedding_model || 'nomic-embed-text')
      setEmbeddingProvider(kb.embedding_model_provider || 'ollama')
      setRetrievalConfig(defaultRetrievalConfig(kb))
    }
    load()
  }, [kbId])

  useEffect(() => {
    if (indexingTechnique === 'economy')
      setRetrievalConfig(prev => ({ ...prev, search_method: 'keyword_search' }))
  }, [indexingTechnique])

  const saveSettings = async () => {
    setLoading(true)
    try {
      await knowledgeBaseApi.update(kbId, {
        name,
        indexing_technique: indexingTechnique,
        doc_form: docForm,
        keyword_number: keywordNumber,
        embedding_model: embeddingModel,
        embedding_model_provider: embeddingProvider,
        retrieval_model: {
          ...(knowledgeBase?.retrieval_model || {}),
          search_method: retrievalConfig.search_method,
          top_k: retrievalConfig.top_k,
          score_threshold_enabled: retrievalConfig.score_threshold_enabled,
          score_threshold: retrievalConfig.score_threshold,
          reranking_enable: retrievalConfig.reranking_enable,
          reranking_model: retrievalConfig.reranking_model,
          reranking_mode: retrievalConfig.reranking_mode,
          weights: retrievalConfig.weights,
        },
      })
      alert('设置保存成功')
    } catch (error) {
      console.error(error)
      alert('保存失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-full flex-col bg-[#f3f6fd]">
      <PageHeader
        title={`${knowledgeBase?.name || '知识库'} · 设置`}
        secondaryCollapsed={secondaryCollapsed}
        onOpenSidebar={onOpenSidebar}
      />

      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="mx-auto flex w-full max-w-[960px] flex-col gap-y-4 px-4 py-8 sm:px-20">
          <KnowledgeDetailTabs knowledgeBaseId={kbId} />

          {/* 名称与图标 - Dify BasicInfoSection */}
          <div className={rowClass}>
            <div className={labelClass}>
              <div className="text-sm font-semibold text-gray-600">名称与图标</div>
            </div>
            <div className="grow">
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="h-9 w-full max-w-[480px] rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 shadow-sm"
              />
            </div>
          </div>

          <div className="my-1 h-px bg-gray-200" />

          {/* 分段结构 - Dify ChunkStructure：标题 + 了解更多链接，右侧只读 OptionCard 列表 */}
          {docForm && (
            <>
              <div className={rowClass}>
                <div className="flex w-[180px] shrink-0 flex-col">
                  <div className="flex h-8 items-center text-sm font-semibold text-gray-600">
                    分段结构
                  </div>
                  <div className="text-xs text-gray-500">

                    {' '}
                    当前知识库使用的分段模式
                  </div>
                </div>
                <div className="grow">
                  <div className="flex flex-col gap-y-1">
                    {CHUNK_OPTIONS.map(opt => (
                      <OptionCard
                        key={opt.id}
                        id={opt.id}
                        icon={opt.icon}
                        iconActiveColor="text-[#5147e5]"
                        title={opt.title}
                        description={opt.description}
                        isActive={docForm === opt.id}
                        disabled
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="my-1 h-px bg-gray-200" />
            </>
          )}

          {/* 索引方式 - Dify IndexMethod：高质量 / 经济模式两张 OptionCard，经济模式展开关键词数量 */}
          <div className={rowClass}>
            <div className={labelClass}>
              <div className="text-sm font-semibold text-gray-600">索引方式</div>
            </div>
            <div className="grow">
              <div className="flex flex-col gap-y-2">
                <OptionCard
                  id="high_quality"
                  isActive={indexingTechnique === 'high_quality'}
                  icon={<Sparkles className="size-[18px]" />}
                  iconActiveColor="text-orange-500"
                  title="高质量"
                  description="使用向量模型进行嵌入与检索，效果更好"
                  isRecommended
                  onClick={() => setIndexingTechnique('high_quality')}
                />
                <OptionCard
                  id="economy"
                  isActive={indexingTechnique === 'economy'}
                  icon={<Wallet className="size-[18px]" />}
                  iconActiveColor="text-indigo-600"
                  title="经济模式"
                  description={`基于关键词索引，可设置关键词数量（当前 ${keywordNumber}）`}
                  onClick={() => setIndexingTechnique('economy')}
                  showChildren={indexingTechnique === 'economy'}
                >
                  <div className="flex items-center gap-x-1">
                    <div className="grow">
                      <span className="text-xs font-medium text-gray-600">关键词数量</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={50}
                      value={keywordNumber}
                      onChange={e => setKeywordNumber(Number(e.target.value) || 10)}
                      className="mr-3 h-2 w-[206px] shrink-0 appearance-none rounded-full bg-gray-200 accent-[#5147e5]"
                    />
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={keywordNumber}
                      onChange={e =>
                        setKeywordNumber(Math.max(1, Math.min(50, Number(e.target.value) || 10)))
                      }
                      className="h-8 w-12 shrink-0 rounded-md border border-gray-200 px-2 text-sm"
                    />
                  </div>
                </OptionCard>
              </div>
            </div>
          </div>

          {/* Embedding 模型 - 只读，与 Dify IndexingSection 一致 */}
          {indexingTechnique === 'high_quality' && (
            <div className={rowClass}>
              <div className={labelClass}>
                <div className="text-sm font-semibold text-gray-600">Embedding 模型</div>
              </div>
              <div className="grow">
                <div className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm">
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                    {embeddingProvider}
                  </span>
                  <span>{embeddingModel}</span>
                </div>
              </div>
            </div>
          )}

          <div className="my-1 h-px bg-gray-200" />

          {/* 检索设置 - Dify RetrievalMethodConfig：标题 + 了解更多，右侧三张/一张 OptionCard 仅选中展开 */}
          <div className={rowClass}>
            <div className="flex w-[180px] shrink-0 flex-col">
              <div className="flex h-7 items-center pt-1 text-sm font-semibold text-gray-600">
                检索设置
              </div>
              <div className="text-xs text-gray-500">

              </div>
            </div>
            <div className="grow">
              <SettingsRetrievalBlock
                indexMethod={indexingTechnique}
                value={retrievalConfig}
                onChange={setRetrievalConfig}
              />
            </div>
          </div>

          <div className="my-1 h-px bg-gray-200" />

          {/* 保存 - Dify Form 底部 */}
          <div className={rowClass}>
            <div className="flex h-7 w-[180px] shrink-0 items-center pt-1" />
            <div className="grow">
              <button
                onClick={saveSettings}
                disabled={loading}
                className="min-w-24 rounded-lg bg-[#5147e5] px-4 py-2 text-sm font-medium text-white hover:bg-[#453ac8] disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {loading ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
