'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import PageHeader from '@/components/layout/PageHeader'
import { usePageContext } from '@/components/layout/PageContext'
import { knowledgeBaseApi } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'

type Step = 1 | 2 | 3

export default function KnowledgeBaseCreateWizardPage() {
  const router = useRouter()
  const { secondaryCollapsed, onOpenSidebar } = usePageContext()

  const [step, setStep] = useState<Step>(1)
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState('')
  const [indexingTechnique, setIndexingTechnique] = useState<'high_quality' | 'economy'>('high_quality')

  const [docForm, setDocForm] = useState<'text_model' | 'qa_model' | 'hierarchical_model'>('text_model')
  const [separator, setSeparator] = useState('\n\n')
  const [maxTokens, setMaxTokens] = useState(500)
  const [chunkOverlap, setChunkOverlap] = useState(50)
  const [removeExtraSpaces, setRemoveExtraSpaces] = useState(true)
  const [removeUrlsEmails, setRemoveUrlsEmails] = useState(false)
  const [searchMethod, setSearchMethod] = useState<'semantic_search' | 'full_text_search' | 'hybrid_search' | 'keyword_search'>('semantic_search')
  const [topK, setTopK] = useState(3)
  const [embeddingModel] = useState('nomic-embed-text')

  const [filePathsText, setFilePathsText] = useState('')
  const [createdKbId, setCreatedKbId] = useState<string | null>(null)
  const [batchId, setBatchId] = useState<string | null>(null)
  const [batchStatus, setBatchStatus] = useState<any[]>([])
  const { showToast } = useToast()

  const filePaths = useMemo(
    () => filePathsText.split('\n').map(line => line.trim()).filter(Boolean),
    [filePathsText],
  )

  useEffect(() => {
    if (!createdKbId || !batchId)
      return

    const timer = setInterval(async () => {
      const response = await knowledgeBaseApi.getBatchIndexingStatus(createdKbId, batchId)
      if (response.data.success)
        setBatchStatus(response.data.data.documents || [])
    }, 2000)

    return () => clearInterval(timer)
  }, [createdKbId, batchId])

  const submit = async () => {
    if (!name.trim()) {
      showToast({ title: '请输入知识库名称', variant: 'info' })
      return
    }

    setSaving(true)
    try {
      const response = await knowledgeBaseApi.init({
        knowledge_base: {
          name: name.trim(),
          indexing_technique: indexingTechnique,
          doc_form: docForm,
          embedding_model: embeddingModel,
          embedding_model_provider: 'ollama',
          retrieval_model: {
            search_method: searchMethod,
            reranking_enable: false,
            top_k: topK,
            score_threshold_enabled: false,
            score_threshold: 0.5,
          },
        },
        process_rule: {
          mode: 'custom',
          rules: {
            pre_processing_rules: [
              { id: 'remove_extra_spaces', enabled: removeExtraSpaces },
              { id: 'remove_urls_emails', enabled: removeUrlsEmails },
            ],
            segmentation: {
              separator,
              max_tokens: maxTokens,
              chunk_overlap: chunkOverlap,
            },
          },
        },
        file_paths: filePaths,
      })

      if (response.data.success) {
        const kbId = response.data.data.knowledge_base.id as string
        const nextBatch = response.data.data.batch as string | null
        setCreatedKbId(kbId)
        setBatchId(nextBatch)
        setStep(3)
      }
    }
    catch (error: any) {
      // eslint-disable-next-line no-console
      console.error(error)
      showToast({
        title: '创建失败',
        description: error?.response?.data?.detail,
        variant: 'error',
      })
    }
    finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full flex-col bg-[#f3f6fd]">
      <PageHeader title="创建知识库向导" secondaryCollapsed={secondaryCollapsed} onOpenSidebar={onOpenSidebar} />

      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="mx-auto max-w-4xl rounded-lg border border-gray-200 bg-white p-5">
          <div className="mb-6 flex items-center gap-2 text-sm">
            <span className={`${step === 1 ? 'text-[#5147e5]' : 'text-gray-400'}`}>1. 基础信息</span>
            <span className="text-gray-300">/</span>
            <span className={`${step === 2 ? 'text-[#5147e5]' : 'text-gray-400'}`}>2. 分段与检索</span>
            <span className="text-gray-300">/</span>
            <span className={`${step === 3 ? 'text-[#5147e5]' : 'text-gray-400'}`}>3. 索引进度</span>
          </div>

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <p className="mb-1 text-sm font-medium text-gray-700">知识库名称</p>
                <input value={name} onChange={e => setName(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <p className="mb-1 text-sm font-medium text-gray-700">索引模式</p>
                <select value={indexingTechnique} onChange={e => setIndexingTechnique(e.target.value as any)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  <option value="high_quality">高质量</option>
                  <option value="economy">经济模式</option>
                </select>
              </div>
              <div className="flex justify-end">
                <button onClick={() => setStep(2)} className="rounded-lg bg-[#5147e5] px-4 py-2 text-sm text-white hover:bg-[#4338ca]">下一步</button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <p className="mb-1 text-sm font-medium text-gray-700">分段模式</p>
                  <select value={docForm} onChange={e => setDocForm(e.target.value as any)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                    <option value="text_model">通用文本</option>
                    <option value="qa_model">Q&A</option>
                    <option value="hierarchical_model">父子分段</option>
                  </select>
                </div>
                <div>
                  <p className="mb-1 text-sm font-medium text-gray-700">Embedding 模型</p>
                  <input value={embeddingModel} readOnly className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <p className="mb-1 text-sm font-medium text-gray-700">分隔符</p>
                  <input value={separator} onChange={e => setSeparator(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <p className="mb-1 text-sm font-medium text-gray-700">最大 tokens</p>
                  <input type="number" min={50} max={4000} value={maxTokens} onChange={e => setMaxTokens(Number(e.target.value) || 500)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <p className="mb-1 text-sm font-medium text-gray-700">重叠 tokens</p>
                  <input type="number" min={0} max={2000} value={chunkOverlap} onChange={e => setChunkOverlap(Number(e.target.value) || 0)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
                <label className="mr-4 inline-flex items-center gap-2">
                  <input type="checkbox" checked={removeExtraSpaces} onChange={e => setRemoveExtraSpaces(e.target.checked)} />
                  去除多余空白
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={removeUrlsEmails} onChange={e => setRemoveUrlsEmails(e.target.checked)} />
                  去除 URL/邮箱
                </label>
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
                  <input type="number" min={1} max={20} value={topK} onChange={e => setTopK(Number(e.target.value) || 3)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </div>
              </div>

              <div>
                <p className="mb-1 text-sm font-medium text-gray-700">本地文件路径（每行一个，可为空）</p>
                <textarea
                  rows={5}
                  value={filePathsText}
                  onChange={e => setFilePathsText(e.target.value)}
                  placeholder="D:\\data\\a.pdf&#10;D:\\data\\b.docx"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="flex justify-between">
                <button onClick={() => setStep(1)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">上一步</button>
                <button onClick={submit} disabled={saving} className="rounded-lg bg-[#5147e5] px-4 py-2 text-sm text-white hover:bg-[#4338ca] disabled:bg-gray-300">
                  {saving ? '创建中...' : '保存并开始处理'}
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-700">知识库已创建，正在索引文档。</p>
              {batchId && <p className="text-xs text-gray-500">batch: {batchId}</p>}

              <div className="space-y-2">
                {batchStatus.map(item => (
                  <div key={item.document_id} className="rounded-lg border border-gray-200 p-3 text-sm">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-medium text-gray-800">{item.filename}</span>
                      <span className="text-xs text-gray-500">{item.indexing_status}</span>
                    </div>
                    <p className="text-xs text-gray-500">{item.completed_segments}/{item.total_segments} segments</p>
                  </div>
                ))}
                {batchStatus.length === 0 && <p className="text-sm text-gray-500">当前批次暂无文档，稍后可在文档页上传。</p>}
              </div>

              <div className="flex justify-end gap-2">
                <button onClick={() => router.push('/knowledge-bases')} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">返回列表</button>
                {createdKbId && <button onClick={() => router.push(`/knowledge-bases/${createdKbId}/documents`)} className="rounded-lg bg-[#5147e5] px-4 py-2 text-sm text-white hover:bg-[#4338ca]">进入文档页</button>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
