'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Eye,
  Filter,
  LayoutPanelLeft,
  LayoutPanelTop,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Square,
  Trash2,
} from 'lucide-react'

import PageHeader from '@/components/layout/PageHeader'
import { usePageContext } from '@/components/layout/PageContext'
import KnowledgeDetailTabs from '@/components/knowledge/KnowledgeDetailTabs'
import { knowledgeBaseApi } from '@/lib/api'
import type { DocumentModel, SegmentDetailModel } from '@/lib/knowledge/types'

type SegmentFilterStatus = 'all' | 'enabled' | 'disabled'

function parseKeywords(input: string) {
  return input
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function formatTime(input?: string | null) {
  if (!input)
    return '-'
  return new Date(input).toLocaleString('zh-CN')
}

function displaySeparator(separator?: string) {
  if (!separator)
    return '\\n'
  return separator
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r')
    .replaceAll('\t', '\\t')
}

export default function DocumentSegmentsPage() {
  const params = useParams()
  const kbId = params.id as string
  const docId = params.docId as string
  const { secondaryCollapsed, onOpenSidebar } = usePageContext()

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [documentInfo, setDocumentInfo] = useState<DocumentModel | null>(null)
  const [segments, setSegments] = useState<SegmentDetailModel[]>([])
  const [showMetadataPanel, setShowMetadataPanel] = useState(true)
  const [isCollapsedContent, setIsCollapsedContent] = useState(false)

  const [searchInput, setSearchInput] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<SegmentFilterStatus>('all')
  const [selectedSegmentIds, setSelectedSegmentIds] = useState<string[]>([])

  const [editingSegment, setEditingSegment] = useState<SegmentDetailModel | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editAnswer, setEditAnswer] = useState('')
  const [editKeywords, setEditKeywords] = useState('')
  const [editEnabled, setEditEnabled] = useState(true)

  const [showAddDrawer, setShowAddDrawer] = useState(false)
  const [addContent, setAddContent] = useState('')
  const [addAnswer, setAddAnswer] = useState('')
  const [addKeywords, setAddKeywords] = useState('')
  const [addEnabled, setAddEnabled] = useState(true)
  const [addAnother, setAddAnother] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      // 按当前筛选条件同时拉取文档详情和分段列表，避免界面数据不一致。
      const enabledParam = statusFilter === 'all' ? undefined : statusFilter === 'enabled'
      const [docRes, segRes] = await Promise.all([
        knowledgeBaseApi.getDocument(kbId, docId),
        knowledgeBaseApi.getSegments(kbId, docId, {
          enabled: enabledParam,
          keyword: searchKeyword || undefined,
        }),
      ])

      if (docRes.data.success)
        setDocumentInfo(docRes.data.data.document as DocumentModel)

      if (segRes.data.success) {
        const nextSegments = (segRes.data.data.segments || []) as SegmentDetailModel[]
        setSegments(nextSegments)
        setSelectedSegmentIds(prev => prev.filter(id => nextSegments.some(seg => seg.id === id)))
      }
    }
    finally {
      setLoading(false)
    }
  }, [docId, kbId, searchKeyword, statusFilter])

  useEffect(() => {
    loadData()
  }, [loadData])

  const openEditDrawer = (segment: SegmentDetailModel) => {
    setEditingSegment(segment)
    setEditContent(segment.content)
    setEditAnswer(segment.answer || '')
    setEditKeywords((segment.keywords || []).join(', '))
    setEditEnabled(segment.enabled)
  }

  const closeEditDrawer = () => {
    setEditingSegment(null)
    setEditContent('')
    setEditAnswer('')
    setEditKeywords('')
  }

  const handleSaveEditSegment = async () => {
    if (!editingSegment)
      return
    if (!editContent.trim()) {
      alert('分段内容不能为空')
      return
    }

    setSubmitting(true)
    try {
      await knowledgeBaseApi.updateSegment(kbId, docId, editingSegment.id, {
        content: editContent.trim(),
        answer: editAnswer || undefined,
        keywords: parseKeywords(editKeywords),
        enabled: editEnabled,
      })
      closeEditDrawer()
      await loadData()
    }
    catch (error: any) {
      alert(error?.response?.data?.detail || '分段保存失败')
    }
    finally {
      setSubmitting(false)
    }
  }

  const handleRegenerateSegment = async () => {
    if (!editingSegment)
      return
    if (!editContent.trim()) {
      alert('分段内容不能为空')
      return
    }

    setSubmitting(true)
    try {
      // 通过提交内容与关键词触发单分段重建索引，保持与“重新设置分段”入口一致。
      await knowledgeBaseApi.updateSegment(kbId, docId, editingSegment.id, {
        content: editContent.trim(),
        answer: editAnswer || undefined,
        keywords: parseKeywords(editKeywords),
        enabled: editEnabled,
      })
      await loadData()
      alert('分段重建索引已完成')
    }
    catch (error: any) {
      alert(error?.response?.data?.detail || '分段重建索引失败')
    }
    finally {
      setSubmitting(false)
    }
  }

  const handleDeleteSegments = async (segmentIds: string[]) => {
    if (!segmentIds.length)
      return
    if (!confirm(`确认删除 ${segmentIds.length} 个分段吗？`))
      return

    setSubmitting(true)
    try {
      await knowledgeBaseApi.deleteSegments(kbId, docId, segmentIds)
      if (editingSegment && segmentIds.includes(editingSegment.id))
        closeEditDrawer()
      setSelectedSegmentIds(prev => prev.filter(id => !segmentIds.includes(id)))
      await loadData()
    }
    catch (error: any) {
      alert(error?.response?.data?.detail || '分段删除失败')
    }
    finally {
      setSubmitting(false)
    }
  }

  const handleCreateSegment = async () => {
    if (!addContent.trim()) {
      alert('分段内容不能为空')
      return
    }

    setSubmitting(true)
    try {
      await knowledgeBaseApi.createSegment(kbId, docId, {
        content: addContent.trim(),
        answer: addAnswer || undefined,
        keywords: parseKeywords(addKeywords),
        enabled: addEnabled,
      })
      await loadData()

      if (addAnother) {
        setAddContent('')
        setAddAnswer('')
        setAddKeywords('')
        setAddEnabled(true)
      }
      else {
        setShowAddDrawer(false)
      }
    }
    catch (error: any) {
      alert(error?.response?.data?.detail || '新增分段失败')
    }
    finally {
      setSubmitting(false)
    }
  }

  const toggleSegmentEnabled = async (segment: SegmentDetailModel) => {
    setSubmitting(true)
    try {
      await knowledgeBaseApi.updateSegment(kbId, docId, segment.id, {
        enabled: !segment.enabled,
      })
      await loadData()
    }
    finally {
      setSubmitting(false)
    }
  }

  const batchSwitchSegments = async (action: 'enable' | 'disable') => {
    if (!selectedSegmentIds.length)
      return

    setSubmitting(true)
    try {
      // 批量启用/禁用走统一状态接口，确保后端索引过滤立即生效。
      await knowledgeBaseApi.patchSegmentsStatus(kbId, docId, action, selectedSegmentIds)
      await loadData()
    }
    finally {
      setSubmitting(false)
    }
  }

  const allSelected = segments.length > 0 && segments.every(item => selectedSegmentIds.includes(item.id))
  const someSelected = segments.some(item => selectedSegmentIds.includes(item.id))

  const totalHit = useMemo(() => {
    return segments.reduce((sum, item) => sum + Number(item.hit_count || 0), 0)
  }, [segments])

  const technicalRows = useMemo(() => {
    const params = documentInfo?.technical_parameters
    const retrievalModel = params?.retrieval_model
    return [
      { label: '索引方式', value: params?.indexing_technique || '-' },
      { label: '检索方式', value: retrievalModel?.search_method || '-' },
      { label: 'Top K', value: retrievalModel?.top_k ?? '-' },
      { label: 'Embedding', value: params?.embedding_model || '-' },
      { label: 'Provider', value: params?.embedding_model_provider || '-' },
      { label: '关键词数', value: params?.keyword_number ?? '-' },
    ]
  }, [documentInfo])

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
        title={documentInfo?.filename || '文档详情'}
        secondaryCollapsed={secondaryCollapsed}
        onOpenSidebar={onOpenSidebar}
      />

      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="mx-auto max-w-[1440px]">
          <KnowledgeDetailTabs knowledgeBaseId={kbId} />

          <div className="flex h-[calc(100vh-220px)] min-h-[560px] rounded-2xl border border-gray-200 bg-white">
            <div className="flex min-w-0 flex-1 flex-col px-4 pt-3">
              <div className="sticky top-0 z-10 -mx-4 mb-3 flex flex-wrap items-center gap-2 border-b border-gray-100 bg-white px-4 pb-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddDrawer(true)}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 text-sm text-gray-700 shadow-sm hover:bg-gray-50"
                >
                  <Plus className="size-4" />
                  添加分段
                </button>
                <Link
                  href={`/knowledge-bases/${kbId}/documents/${docId}/settings`}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 text-sm text-gray-700 shadow-sm hover:bg-gray-50"
                >
                  <Settings2 className="size-4" />
                  分段设置
                </Link>
                <button
                  type="button"
                  onClick={() => setIsCollapsedContent(prev => !prev)}
                  className="inline-flex h-8 items-center rounded-lg border border-gray-300 bg-white px-2.5 text-sm text-gray-700 shadow-sm hover:bg-gray-50"
                  title={isCollapsedContent ? '展开分段内容' : '折叠分段内容'}
                >
                  {isCollapsedContent ? <LayoutPanelTop className="size-4" /> : <LayoutPanelLeft className="size-4" />}
                </button>
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value as SegmentFilterStatus)}
                  className="h-8 rounded-lg border border-gray-300 px-2.5 text-sm"
                >
                  <option value="all">全部分段</option>
                  <option value="enabled">仅启用</option>
                  <option value="disabled">仅禁用</option>
                </select>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-gray-400" />
                  <input
                    value={searchInput}
                    onChange={e => setSearchInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter')
                        setSearchKeyword(searchInput.trim())
                    }}
                    placeholder="搜索分段内容/关键词"
                    className="h-8 w-56 rounded-lg border border-gray-300 py-1 pl-8 pr-2 text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setSearchKeyword(searchInput.trim())}
                  className="h-8 rounded-lg border border-gray-300 px-2.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <Filter className="mr-1 inline size-3.5" />
                  过滤
                </button>
                <button
                  type="button"
                  onClick={loadData}
                  className="h-8 rounded-lg border border-gray-300 px-2.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <RefreshCw className="mr-1 inline size-3.5" />
                  刷新
                </button>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 hover:bg-gray-50"
                    onClick={() => setShowMetadataPanel(prev => !prev)}
                    title={showMetadataPanel ? '收起右侧信息' : '展开右侧信息'}
                  >
                    {showMetadataPanel ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
                  </button>
                </div>
              </div>

              <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-gray-600">
                <button
                  type="button"
                  onClick={() => {
                    if (allSelected)
                      setSelectedSegmentIds([])
                    else
                      setSelectedSegmentIds(segments.map(item => item.id))
                  }}
                  className="inline-flex items-center gap-1"
                >
                  {allSelected
                    ? <CheckSquare className="size-4 text-[#5147e5]" />
                    : someSelected
                      ? <CheckSquare className="size-4 text-gray-500" />
                      : <Square className="size-4 text-gray-500" />}
                  全选
                </button>
                <span className="text-xs text-gray-500">分段 {segments.length} 个</span>
                <span className="text-xs text-gray-500">总召回 {totalHit}</span>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto pb-4">
                {segments.length === 0
                  ? (
                      <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-400">
                        当前筛选条件下暂无分段
                      </div>
                    )
                  : (
                      <div className="space-y-2">
                        {segments.map((segment) => {
                          const selected = selectedSegmentIds.includes(segment.id)
                          const keywords = segment.keywords || []
                          return (
                            <div key={segment.id} className={`group flex gap-2 rounded-xl border px-3 py-2.5 transition ${
                              selected ? 'border-[#5147e5] bg-[#f8f7ff]' : 'border-gray-200 hover:bg-gray-50'
                            }`}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedSegmentIds(prev =>
                                    prev.includes(segment.id)
                                      ? prev.filter(id => id !== segment.id)
                                      : [...prev, segment.id],
                                  )
                                }}
                                className="mt-1 text-gray-500"
                              >
                                {selected ? <CheckSquare className="size-4 text-[#5147e5]" /> : <Square className="size-4" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditDrawer(segment)}
                                className="min-w-0 flex-1 text-left"
                              >
                                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                                  <span className="rounded bg-white px-2 py-0.5">Chunk {segment.position}</span>
                                  <span>{segment.word_count || segment.content.length} 字</span>
                                  <span>召回 {segment.hit_count || 0}</span>
                                  <span>{segment.status}</span>
                                  {!segment.enabled && (
                                    <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600">已禁用</span>
                                  )}
                                </div>
                                {!isCollapsedContent && (
                                  <p className="line-clamp-3 whitespace-pre-wrap text-sm text-gray-800">{segment.content}</p>
                                )}
                                {keywords.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    {keywords.map(keyword => (
                                      <span key={keyword} className="rounded bg-[#f5f4ff] px-2 py-0.5 text-xs text-[#5147e5]">
                                        {keyword}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </button>
                              <div className="flex shrink-0 items-start gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100">
                                <button
                                  type="button"
                                  onClick={() => toggleSegmentEnabled(segment)}
                                  className={`rounded-md px-2 py-1 text-xs ${
                                    segment.enabled
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  {segment.enabled ? '已启用' : '已禁用'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openEditDrawer(segment)}
                                  className="rounded p-1 text-gray-500 hover:bg-gray-100"
                                  title="查看/编辑"
                                >
                                  <Eye className="size-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSegments([segment.id])}
                                  className="rounded p-1 text-gray-500 hover:bg-rose-50 hover:text-rose-600"
                                  title="删除"
                                >
                                  <Trash2 className="size-4" />
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
              </div>
            </div>

            {showMetadataPanel && (
              <aside className="w-[360px] shrink-0 border-l border-gray-200 bg-[#fcfcff] p-4">
                <div className="mb-4 text-sm font-semibold text-gray-800">文档信息</div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex">
                    <span className="w-28 shrink-0 text-gray-500">文档名称</span>
                    <span className="break-all text-gray-800">{documentInfo?.filename || '-'}</span>
                  </div>
                  <div className="flex">
                    <span className="w-28 shrink-0 text-gray-500">文件类型</span>
                    <span className="text-gray-800">{documentInfo?.file_type || '-'}</span>
                  </div>
                  <div className="flex">
                    <span className="w-28 shrink-0 text-gray-500">分段模式</span>
                    <span className="text-gray-800">{documentInfo?.doc_form || '-'}</span>
                  </div>
                  <div className="flex">
                    <span className="w-28 shrink-0 text-gray-500">文档语言</span>
                    <span className="text-gray-800">{documentInfo?.doc_language || '-'}</span>
                  </div>
                  <div className="flex">
                    <span className="w-28 shrink-0 text-gray-500">数据来源</span>
                    <span className="text-gray-800">{documentInfo?.data_source_type || '-'}</span>
                  </div>
                  <div className="flex">
                    <span className="w-28 shrink-0 text-gray-500">创建时间</span>
                    <span className="text-gray-800">{formatTime(documentInfo?.created_at)}</span>
                  </div>
                  <div className="flex">
                    <span className="w-28 shrink-0 text-gray-500">最近更新</span>
                    <span className="text-gray-800">{formatTime(documentInfo?.updated_at)}</span>
                  </div>
                </div>

                <div className="my-4 h-px bg-gray-200" />

                <div className="mb-4 text-sm font-semibold text-gray-800">技术参数</div>
                <div className="space-y-1.5 text-xs">
                  {technicalRows.map(row => (
                    <div key={row.label} className="flex">
                      <span className="w-28 shrink-0 text-gray-500">{row.label}</span>
                      <span className="break-all text-gray-800">{String(row.value)}</span>
                    </div>
                  ))}
                </div>

                <div className="my-4 h-px bg-gray-200" />

                <div className="mb-1 text-sm font-semibold text-gray-800">处理规则</div>
                <div className="rounded-lg border border-gray-200 bg-white p-2.5 text-xs">
                  <div className="mb-1 text-gray-500">分段标识符</div>
                  <div className="break-all text-gray-800">
                    {displaySeparator(
                      documentInfo?.document_process_rule?.rules?.segmentation?.separator
                        || documentInfo?.dataset_process_rule?.rules?.segmentation?.separator,
                    )}
                  </div>
                  <div className="mb-1 mt-2 text-gray-500">最大长度 / 重叠长度</div>
                  <div className="text-gray-800">
                    {(documentInfo?.document_process_rule?.rules?.segmentation?.max_tokens
                      || documentInfo?.dataset_process_rule?.rules?.segmentation?.max_tokens
                      || '-')}
                    {' / '}
                    {(documentInfo?.document_process_rule?.rules?.segmentation?.chunk_overlap
                      || documentInfo?.dataset_process_rule?.rules?.segmentation?.chunk_overlap
                      || '-')}
                  </div>
                </div>
              </aside>
            )}
          </div>
        </div>
      </div>

      {selectedSegmentIds.length > 0 && (
        <div className="fixed bottom-8 left-1/2 z-30 -translate-x-1/2 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-lg">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-600">已选 {selectedSegmentIds.length} 个分段</span>
            <button
              type="button"
              onClick={() => batchSwitchSegments('enable')}
              disabled={submitting}
              className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50"
            >
              批量启用
            </button>
            <button
              type="button"
              onClick={() => batchSwitchSegments('disable')}
              disabled={submitting}
              className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50"
            >
              批量禁用
            </button>
            <button
              type="button"
              onClick={() => handleDeleteSegments(selectedSegmentIds)}
              disabled={submitting}
              className="rounded border border-rose-300 px-2 py-1 text-rose-700 hover:bg-rose-50"
            >
              批量删除
            </button>
            <button
              type="button"
              onClick={() => setSelectedSegmentIds([])}
              className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {editingSegment && (
        <div className="fixed inset-0 z-50 flex bg-black/30" onClick={closeEditDrawer}>
          <div className="ml-auto h-full w-full max-w-[620px] overflow-y-auto bg-white p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold text-gray-900">分段详情</div>
                <div className="text-xs text-gray-500">Chunk {editingSegment.position}</div>
              </div>
              <button onClick={closeEditDrawer} className="rounded p-1.5 text-gray-500 hover:bg-gray-100">关闭</button>
            </div>

            <div className="mb-3 grid grid-cols-2 gap-2 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
              <div>字数：{editingSegment.word_count || editContent.length}</div>
              <div>召回次数：{editingSegment.hit_count || 0}</div>
              <div>状态：{editingSegment.status}</div>
              <div>启用：{editEnabled ? '是' : '否'}</div>
            </div>

            <div className="space-y-3">
              <div>
                <div className="mb-1 text-xs text-gray-500">内容</div>
                <textarea
                  rows={10}
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 p-2.5 text-sm"
                />
              </div>
              {documentInfo?.doc_form === 'qa_model' && (
                <div>
                  <div className="mb-1 text-xs text-gray-500">答案</div>
                  <textarea
                    rows={4}
                    value={editAnswer}
                    onChange={e => setEditAnswer(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 p-2.5 text-sm"
                  />
                </div>
              )}
              <div>
                <div className="mb-1 text-xs text-gray-500">关键词（逗号分隔）</div>
                <input
                  value={editKeywords}
                  onChange={e => setEditKeywords(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={editEnabled} onChange={e => setEditEnabled(e.target.checked)} />
                启用该分段
              </label>
            </div>

            <div className="mt-5 flex items-center justify-between">
              <button
                onClick={() => handleDeleteSegments([editingSegment.id])}
                disabled={submitting}
                className="rounded-lg border border-rose-300 px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-50 disabled:bg-gray-100"
              >
                删除分段
              </button>
              <div className="flex gap-2">
                <button
                  onClick={closeEditDrawer}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  onClick={handleRegenerateSegment}
                  disabled={submitting}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:bg-gray-100"
                >
                  {submitting ? '处理中...' : '重新索引'}
                </button>
                <button
                  onClick={handleSaveEditSegment}
                  disabled={submitting}
                  className="rounded-lg bg-[#5147e5] px-3 py-1.5 text-sm text-white hover:bg-[#453ac8] disabled:bg-gray-300"
                >
                  {submitting ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAddDrawer && (
        <div className="fixed inset-0 z-50 flex bg-black/30" onClick={() => setShowAddDrawer(false)}>
          <div className="ml-auto h-full w-full max-w-[620px] overflow-y-auto bg-white p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-lg font-semibold text-gray-900">新增分段</div>
              <button onClick={() => setShowAddDrawer(false)} className="rounded p-1.5 text-gray-500 hover:bg-gray-100">关闭</button>
            </div>
            <div className="space-y-3">
              <div>
                <div className="mb-1 text-xs text-gray-500">内容</div>
                <textarea
                  rows={10}
                  value={addContent}
                  onChange={e => setAddContent(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 p-2.5 text-sm"
                />
              </div>
              {documentInfo?.doc_form === 'qa_model' && (
                <div>
                  <div className="mb-1 text-xs text-gray-500">答案</div>
                  <textarea
                    rows={4}
                    value={addAnswer}
                    onChange={e => setAddAnswer(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 p-2.5 text-sm"
                  />
                </div>
              )}
              <div>
                <div className="mb-1 text-xs text-gray-500">关键词（逗号分隔）</div>
                <input
                  value={addKeywords}
                  onChange={e => setAddKeywords(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={addEnabled} onChange={e => setAddEnabled(e.target.checked)} />
                新分段默认启用
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={addAnother} onChange={e => setAddAnother(e.target.checked)} />
                连续添加
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setShowAddDrawer(false)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleCreateSegment}
                disabled={submitting}
                className="rounded-lg bg-[#5147e5] px-3 py-1.5 text-sm text-white hover:bg-[#453ac8] disabled:bg-gray-300"
              >
                {submitting ? '提交中...' : '新增分段'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
