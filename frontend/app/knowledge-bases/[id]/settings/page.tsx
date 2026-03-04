'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

import PageHeader from '@/components/layout/PageHeader'
import { usePageContext } from '@/components/layout/PageContext'
import KnowledgeDetailTabs from '@/components/knowledge/KnowledgeDetailTabs'
import { knowledgeBaseApi } from '@/lib/api'
import type { KnowledgeBase } from '@/lib/knowledge/types'

export default function KnowledgeBaseSettingsPage() {
  const params = useParams()
  const kbId = params.id as string
  const { secondaryCollapsed, onOpenSidebar } = usePageContext()

  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeBase | null>(null)
  const [loading, setLoading] = useState(false)

  const [name, setName] = useState('')
  const [indexingTechnique, setIndexingTechnique] = useState<'high_quality' | 'economy'>('high_quality')
  const [docForm, setDocForm] = useState<'text_model' | 'qa_model' | 'hierarchical_model'>('text_model')
  const [embeddingModel, setEmbeddingModel] = useState('nomic-embed-text')
  const [embeddingProvider, setEmbeddingProvider] = useState('ollama')
  const [searchMethod, setSearchMethod] = useState<'semantic_search' | 'full_text_search' | 'hybrid_search' | 'keyword_search'>('semantic_search')
  const [topK, setTopK] = useState(3)
  const [scoreThresholdEnabled, setScoreThresholdEnabled] = useState(false)
  const [scoreThreshold, setScoreThreshold] = useState(0.5)

  useEffect(() => {
    const load = async () => {
      const response = await knowledgeBaseApi.getById(kbId)
      if (!response.data.success)
        return

      const kb = response.data.data.knowledge_base as KnowledgeBase
      setKnowledgeBase(kb)
      setName(kb.name)
      setIndexingTechnique(kb.indexing_technique)
      setDocForm(kb.doc_form)
      setEmbeddingModel(kb.embedding_model || 'nomic-embed-text')
      setEmbeddingProvider(kb.embedding_model_provider || 'ollama')
      setSearchMethod(kb.retrieval_model?.search_method || 'semantic_search')
      setTopK(kb.retrieval_model?.top_k || 3)
      setScoreThresholdEnabled(Boolean(kb.retrieval_model?.score_threshold_enabled))
      setScoreThreshold(kb.retrieval_model?.score_threshold ?? 0.5)
    }

    load()
  }, [kbId])

  const saveSettings = async () => {
    setLoading(true)
    try {
      await knowledgeBaseApi.update(kbId, {
        name,
        indexing_technique: indexingTechnique,
        doc_form: docForm,
        embedding_model: embeddingModel,
        embedding_model_provider: embeddingProvider,
        retrieval_model: {
          ...(knowledgeBase?.retrieval_model || {}),
          search_method: searchMethod,
          top_k: topK,
          score_threshold_enabled: scoreThresholdEnabled,
          score_threshold: scoreThreshold,
        },
      })
      alert('设置保存成功')
    }
    catch (error) {
      // eslint-disable-next-line no-console
      console.error(error)
      alert('保存失败，请稍后重试')
    }
    finally {
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
        <div className="mx-auto max-w-4xl">
          <KnowledgeDetailTabs knowledgeBaseId={kbId} />

          <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-5">
            <div>
              <p className="mb-1 text-sm font-medium text-gray-700">知识库名称</p>
              <input value={name} onChange={e => setName(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <p className="mb-1 text-sm font-medium text-gray-700">索引方式</p>
                <select value={indexingTechnique} onChange={e => setIndexingTechnique(e.target.value as any)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  <option value="high_quality">高质量</option>
                  <option value="economy">经济模式</option>
                </select>
              </div>
              <div>
                <p className="mb-1 text-sm font-medium text-gray-700">分段模式</p>
                <select value={docForm} onChange={e => setDocForm(e.target.value as any)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  <option value="text_model">通用文本</option>
                  <option value="qa_model">Q&A</option>
                  <option value="hierarchical_model">父子分段</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <p className="mb-1 text-sm font-medium text-gray-700">Embedding Provider</p>
                <input value={embeddingProvider} onChange={e => setEmbeddingProvider(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <p className="mb-1 text-sm font-medium text-gray-700">Embedding Model</p>
                <input value={embeddingModel} onChange={e => setEmbeddingModel(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <p className="mb-1 text-sm font-medium text-gray-700">检索方式</p>
                <select value={searchMethod} onChange={e => setSearchMethod(e.target.value as any)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  <option value="semantic_search">向量检索</option>
                  <option value="full_text_search">全文检索</option>
                  <option value="hybrid_search">混合检索</option>
                  <option value="keyword_search">关键词检索</option>
                </select>
              </div>
              <div>
                <p className="mb-1 text-sm font-medium text-gray-700">Top K</p>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={topK}
                  onChange={e => setTopK(Math.max(1, Math.min(20, Number(e.target.value) || 3)))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={scoreThresholdEnabled}
                  onChange={e => setScoreThresholdEnabled(e.target.checked)}
                />
                启用分数阈值
              </label>
              {scoreThresholdEnabled && (
                <input
                  type="number"
                  step={0.01}
                  min={0}
                  max={1}
                  value={scoreThreshold}
                  onChange={e => setScoreThreshold(Number(e.target.value) || 0)}
                  className="mt-2 w-40 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              )}
            </div>

            <div className="pt-2">
              <button
                onClick={saveSettings}
                disabled={loading}
                className="rounded-lg bg-[#5147e5] px-4 py-2 text-sm text-white hover:bg-[#4338ca] disabled:bg-gray-300"
              >
                {loading ? '保存中...' : '保存设置'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
