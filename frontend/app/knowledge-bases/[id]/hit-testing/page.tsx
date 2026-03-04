'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useParams } from 'next/navigation'
import {
  ArrowDown,
  Clock3,
  Database,
  Files,
  History,
  PlayCircle,
  Search,
  Sparkles,
  Target,
} from 'lucide-react'

import PageHeader from '@/components/layout/PageHeader'
import { usePageContext } from '@/components/layout/PageContext'
import KnowledgeDetailTabs from '@/components/knowledge/KnowledgeDetailTabs'
import { knowledgeBaseApi } from '@/lib/api'
import type { HitTestingQuery, HitTestingRecord, KnowledgeBase, RetrievalConfig } from '@/lib/knowledge/types'

type SearchMethod = RetrievalConfig['search_method']

const HIGH_QUALITY_METHOD_OPTIONS: Array<{
  value: SearchMethod
  title: string
  icon: ReactNode
}> = [
  { value: 'semantic_search', title: '向量检索', icon: <Database className="size-3.5" /> },
  { value: 'full_text_search', title: '全文检索', icon: <Files className="size-3.5" /> },
  { value: 'hybrid_search', title: '混合检索', icon: <Sparkles className="size-3.5" /> },
]

const ECONOMY_METHOD_OPTIONS: Array<{
  value: SearchMethod
  title: string
  icon: ReactNode
}> = [
  { value: 'keyword_search', title: '关键词检索', icon: <Search className="size-3.5" /> },
]

function normalizeRecords(data: {
  records?: HitTestingRecord[]
  hits?: Array<{
    chunk_id: string
    content: string
    similarity: number
    metadata: Record<string, any>
  }>
}): HitTestingRecord[] {
  if (data.records?.length)
    return data.records

  return (data.hits || []).map(hit => ({
    score: Number(hit.similarity || 0),
    segment: {
      id: hit.chunk_id,
      document_id: hit.metadata?.document_id,
      knowledge_base_id: hit.metadata?.knowledge_base_id,
      position: hit.metadata?.position,
      content: hit.content,
      word_count: hit.metadata?.word_count || hit.content.length,
      keywords: hit.metadata?.keywords || [],
      hit_count: 0,
      enabled: true,
    },
    document: {
      id: hit.metadata?.document_id,
      name: '',
      doc_form: '',
    },
    metadata: hit.metadata || {},
  }))
}

export default function KnowledgeBaseHitTestingPage() {
  const params = useParams()
  const kbId = params.id as string
  const { secondaryCollapsed, onOpenSidebar } = usePageContext()

  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeBase | null>(null)
  const [queryText, setQueryText] = useState('')
  const [loading, setLoading] = useState(false)
  const [recordsLoading, setRecordsLoading] = useState(false)
  const [results, setResults] = useState<HitTestingRecord[]>([])
  const [historyQueries, setHistoryQueries] = useState<HitTestingQuery[]>([])
  const [selectedQueryId, setSelectedQueryId] = useState<string | null>(null)

  const [searchMethod, setSearchMethod] = useState<SearchMethod>('semantic_search')
  const [topK, setTopK] = useState(3)
  const [scoreThresholdEnabled, setScoreThresholdEnabled] = useState(false)
  const [scoreThreshold, setScoreThreshold] = useState(0.5)
  const [sortTimeOrder, setSortTimeOrder] = useState<'asc' | 'desc'>('desc')

  const methodOptions = useMemo(() => {
    // 经济模式固定关键词检索；高质量模式支持向量/全文/混合。
    if (knowledgeBase?.indexing_technique === 'economy')
      return ECONOMY_METHOD_OPTIONS
    return HIGH_QUALITY_METHOD_OPTIONS
  }, [knowledgeBase?.indexing_technique])

  const loadHistoryQueries = useCallback(async () => {
    setRecordsLoading(true)
    try {
      const response = await knowledgeBaseApi.getHitTestingQueries(kbId, { page: 1, limit: 50 })
      if (response.data.success)
        setHistoryQueries((response.data.data.queries || []) as HitTestingQuery[])
    }
    finally {
      setRecordsLoading(false)
    }
  }, [kbId])

  useEffect(() => {
    const load = async () => {
      const response = await knowledgeBaseApi.getById(kbId)
      if (!response.data.success)
        return

      const kb = response.data.data.knowledge_base as KnowledgeBase
      setKnowledgeBase(kb)
      const defaultMethod = (kb.retrieval_model?.search_method || 'semantic_search') as SearchMethod
      if (kb.indexing_technique === 'economy')
        setSearchMethod('keyword_search')
      else if (defaultMethod === 'keyword_search')
        setSearchMethod('semantic_search')
      else
        setSearchMethod(defaultMethod)
      setTopK(kb.retrieval_model?.top_k || 3)
      setScoreThresholdEnabled(Boolean(kb.retrieval_model?.score_threshold_enabled))
      setScoreThreshold(kb.retrieval_model?.score_threshold ?? 0.5)
    }

    load()
    loadHistoryQueries()
  }, [kbId, loadHistoryQueries])

  useEffect(() => {
    if (!methodOptions.some(item => item.value === searchMethod))
      setSearchMethod(methodOptions[0].value)
  }, [methodOptions, searchMethod])

  const runHitTesting = useCallback(async (overrideQuery?: string) => {
    const nextQuery = (overrideQuery ?? queryText).trim()
    if (!nextQuery) {
      alert('请输入查询问题')
      return
    }

    setLoading(true)
    try {
      // 每次测试都带上当前页面配置，保证右侧结果与当前检索参数一致。
      const response = await knowledgeBaseApi.hitTesting(kbId, {
        query: nextQuery,
        retrieval_model: {
          ...(knowledgeBase?.retrieval_model || {}),
          search_method: searchMethod,
          top_k: topK,
          score_threshold_enabled: scoreThresholdEnabled,
          score_threshold: scoreThreshold,
        },
      })

      if (!response.data.success)
        return
      const data = response.data.data as {
        retrieval_model?: Record<string, any>
        records?: HitTestingRecord[]
        hits?: Array<{
          chunk_id: string
          content: string
          similarity: number
          metadata: Record<string, any>
        }>
      }

      if (data.retrieval_model?.search_method)
        setSearchMethod(data.retrieval_model.search_method as SearchMethod)
      if (typeof data.retrieval_model?.top_k === 'number')
        setTopK(data.retrieval_model.top_k)

      setResults(normalizeRecords(data))
      await loadHistoryQueries()
    }
    catch (error: any) {
      const msg = error?.response?.data?.detail || error?.message || '召回测试失败'
      alert(msg)
    }
    finally {
      setLoading(false)
    }
  }, [kbId, knowledgeBase, loadHistoryQueries, queryText, scoreThreshold, scoreThresholdEnabled, searchMethod, topK])

  const sortedHistoryQueries = useMemo(() => {
    return [...historyQueries].sort((a, b) => {
      const left = new Date(a.created_at).getTime()
      const right = new Date(b.created_at).getTime()
      return sortTimeOrder === 'asc' ? left - right : right - left
    })
  }, [historyQueries, sortTimeOrder])

  const canRun = !loading && queryText.trim().length > 0 && queryText.length <= 200

  return (
    <div className="flex h-full flex-col bg-[#f3f6fd]">
      <PageHeader
        title={`${knowledgeBase?.name || '知识库'} · 召回测试`}
        secondaryCollapsed={secondaryCollapsed}
        onOpenSidebar={onOpenSidebar}
      />

      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="mx-auto max-w-[1440px]">
          <KnowledgeDetailTabs knowledgeBaseId={kbId} />

          <div className="flex min-h-[680px] gap-6 pl-2">
            <div className="flex min-w-0 flex-1 flex-col py-2">
              <div className="mb-3">
                <h2 className="text-base font-semibold text-gray-900">召回测试</h2>
                <p className="text-[13px] text-gray-500">输入查询问题，验证当前知识库分段的召回效果。</p>
              </div>

              <div className="relative mb-6 h-80 rounded-xl bg-gradient-to-r from-[#b7adff] to-[#7ba8ff] p-[1px] shadow-sm">
                <div className="flex h-full flex-col overflow-hidden rounded-[11px] bg-[#f7f9ff]">
                  <div className="flex items-center justify-between px-3 pb-1 pt-2.5">
                    <span className="text-xs font-semibold uppercase text-gray-700">源文本</span>
                    <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 text-xs">
                      {methodOptions.map(item => (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => setSearchMethod(item.value)}
                          className={`inline-flex h-6 items-center gap-1 rounded-md px-2 transition ${
                            searchMethod === item.value
                              ? 'bg-[#f1efff] text-[#5147e5]'
                              : 'text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          {item.icon}
                          {item.title}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className={`relative flex-1 overflow-hidden border-t border-gray-200 bg-white px-4 pb-0 pt-3 ${queryText.length > 200 ? 'border-red-300' : ''}`}>
                    <textarea
                      value={queryText}
                      onChange={e => setQueryText(e.target.value)}
                      placeholder="输入你要测试的查询内容"
                      className="h-full w-full resize-none border-none bg-transparent text-sm text-gray-700 outline-none"
                    />
                    <div className={`absolute right-2 top-1.5 rounded px-1.5 py-0.5 text-[10px] uppercase ${
                      queryText.length > 200 ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'
                    }`}
                    >
                      {queryText.length}/200
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-gray-200 bg-white px-4 py-2">
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1 text-xs text-gray-600">
                        Top K
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={topK}
                          onChange={e => setTopK(Math.max(1, Math.min(20, Number(e.target.value) || 3)))}
                          className="h-7 w-14 rounded-md border border-gray-300 px-1.5"
                        />
                      </label>
                      <label className="flex items-center gap-1 text-xs text-gray-600">
                        <input
                          type="checkbox"
                          checked={scoreThresholdEnabled}
                          onChange={e => setScoreThresholdEnabled(e.target.checked)}
                        />
                        阈值
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={0.01}
                        disabled={!scoreThresholdEnabled}
                        value={scoreThreshold}
                        onChange={e => setScoreThreshold(Number(e.target.value) || 0)}
                        className="h-7 w-16 rounded-md border border-gray-300 px-1.5 text-xs disabled:bg-gray-100"
                      />
                      {knowledgeBase?.indexing_technique === 'economy' && (
                        <span className="rounded bg-[#fff7ed] px-1.5 py-0.5 text-[11px] text-[#b45309]">
                          经济模式固定关键词检索
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => runHitTesting()}
                      disabled={!canRun}
                      className="inline-flex h-8 items-center rounded-lg bg-[#5147e5] px-3 text-xs font-medium text-white hover:bg-[#453ac8] disabled:cursor-not-allowed disabled:bg-gray-300"
                    >
                      <PlayCircle className="mr-1 size-4" />
                      {loading ? '测试中' : '开始测试'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="mb-2 text-base font-semibold text-gray-900">查询记录</div>
              {recordsLoading
                ? (
                    <div className="flex flex-1 items-center justify-center text-sm text-gray-400">记录加载中...</div>
                  )
                : sortedHistoryQueries.length === 0
                  ? (
                      <div className="rounded-2xl bg-[#f6f8fe] p-5">
                        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-[10px] border border-gray-200 bg-white shadow-sm">
                          <History className="size-5 text-gray-400" />
                        </div>
                        <div className="text-[13px] text-gray-500">暂无最近检索记录</div>
                      </div>
                    )
                  : (
                      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-gray-200">
                        <table className="w-full border-collapse text-[13px]">
                          <thead className="sticky top-0 bg-[#f7f8fc] text-xs uppercase text-gray-500">
                            <tr className="h-8">
                              <td className="rounded-l-lg pl-3">查询内容</td>
                              <td className="w-36 pl-3">来源</td>
                              <td className="w-52 rounded-r-lg pl-3">
                                <button
                                  type="button"
                                  onClick={() => setSortTimeOrder(prev => (prev === 'asc' ? 'desc' : 'asc'))}
                                  className="inline-flex items-center"
                                >
                                  时间
                                  <ArrowDown className={`ml-0.5 size-3 ${sortTimeOrder === 'asc' ? 'rotate-180' : ''}`} />
                                </button>
                              </td>
                            </tr>
                          </thead>
                          <tbody>
                            {sortedHistoryQueries.map(item => (
                              <tr
                                key={item.id}
                                className={`cursor-pointer border-t border-gray-100 hover:bg-gray-50 ${
                                  selectedQueryId === item.id ? 'bg-[#f5f4ff]' : ''
                                }`}
                                onClick={async () => {
                                  setSelectedQueryId(item.id)
                                  setQueryText(item.query)
                                  await runHitTesting(item.query)
                                }}
                              >
                                <td className="max-w-xs p-3 pr-2">
                                  <div className="line-clamp-2 text-gray-700">{item.query}</div>
                                </td>
                                <td className="w-36 p-3 pr-2 capitalize text-gray-500">
                                  {(item.source || 'hit_testing').replace('_', ' ')}
                                </td>
                                <td className="w-52 p-3 pr-2 text-gray-500">
                                  <span className="inline-flex items-center gap-1">
                                    <Clock3 className="size-3.5" />
                                    {new Date(item.created_at).toLocaleString('zh-CN')}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
            </div>

            <div className="flex w-[48%] min-w-[420px] flex-col pt-2">
              {loading
                ? (
                    <div className="flex h-full flex-col rounded-tl-2xl bg-[#f7f8fc] px-4 py-3">
                      <div className="h-24 animate-pulse rounded-lg bg-gray-200" />
                      <div className="mt-2 h-24 animate-pulse rounded-lg bg-gray-200" />
                      <div className="mt-2 h-24 animate-pulse rounded-lg bg-gray-200" />
                    </div>
                  )
                : results.length === 0
                  ? (
                      <div className="flex h-full flex-col items-center justify-center rounded-tl-2xl bg-[#f7f8fc] px-4 py-3">
                        <Target className="mb-3 size-14 text-gray-300" />
                        <div className="text-[13px] text-gray-400">开始测试后，右侧展示召回结果</div>
                      </div>
                    )
                  : (
                      <div className="flex h-full flex-col rounded-tl-2xl bg-[#f7f8fc] px-4 py-3">
                        <div className="mb-2 pl-2 text-sm font-semibold text-gray-800">
                          召回结果（{results.length}）
                        </div>
                        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
                          {results.map((record, idx) => {
                            const keywords = record.segment.keywords || []
                            const score = Number(record.score || 0)
                            const scoreWidth = `${Math.max(0, Math.min(100, score * 100))}%`
                            return (
                              <div key={`${record.segment.id}-${idx}`} className="rounded-xl bg-white pt-3 shadow-sm hover:shadow-md">
                                <div className="flex items-center justify-between px-3">
                                  <div className="flex items-center gap-2 text-xs text-gray-500">
                                    <span className="rounded bg-gray-100 px-2 py-0.5">Chunk {record.segment.position ?? '-'}</span>
                                    <span>{record.segment.word_count || record.segment.content.length} 字</span>
                                  </div>
                                  <div className="relative h-5 overflow-hidden rounded border border-blue-200 px-1.5 text-xs text-blue-700">
                                    <div className="absolute inset-y-0 left-0 bg-blue-100" style={{ width: scoreWidth }} />
                                    <span className="relative">score {score.toFixed(2)}</span>
                                  </div>
                                </div>

                                <div className="mt-2 px-3">
                                  <p className="line-clamp-3 whitespace-pre-wrap text-sm text-gray-800">
                                    {record.segment.content}
                                  </p>
                                  {keywords.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                      {keywords.map(keyword => (
                                        <span key={keyword} className="rounded bg-[#f5f4ff] px-2 py-0.5 text-xs text-[#5147e5]">
                                          {keyword}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                <div className="mt-3 flex h-10 items-center justify-between border-t border-gray-100 px-3 text-xs text-gray-500">
                                  <span className="truncate">文档：{record.document.name || record.document.id || '-'}</span>
                                  <span>历史命中 {record.segment.hit_count || 0}</span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
