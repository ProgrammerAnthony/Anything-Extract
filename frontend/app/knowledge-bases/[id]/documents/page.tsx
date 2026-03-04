'use client'

/**
 * 知识库文档列表页：文档表格、状态筛选、排序、上传、批量操作。
 * 上传成功后跳转到该文档的 process 页（STEP2）；进行中文档轮询 indexing-status。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  Archive,
  ChevronDown,
  Circle,
  FileText,
  MoreHorizontal,
  PencilLine,
  Search,
  Trash2,
  Upload,
} from 'lucide-react'

import PageHeader from '@/components/layout/PageHeader'
import { usePageContext } from '@/components/layout/PageContext'
import KnowledgeDetailTabs from '@/components/knowledge/KnowledgeDetailTabs'
import FileUploadDialog, { UploadProcessingMode } from '@/components/ui/FileUploadDialog'
import { documentApi, knowledgeBaseApi } from '@/lib/api'
import type { DocumentModel, KnowledgeBase } from '@/lib/knowledge/types'

/** 处于队列或处理中的状态，用于轮询与展示「进行中」 */
const ACTIVE_STATUSES = new Set(['queued', 'processing', 'parsing', 'cleaning', 'splitting', 'indexing', 'waiting'])

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'available', label: '可用' },
  { value: 'disabled', label: '已禁用' },
  { value: 'archived', label: '已归档' },
  { value: 'error', label: '索引失败' },
]

type SortField = 'filename' | 'word_count' | 'hit_count' | 'created_at'
type SortOrder = 'asc' | 'desc'

const CHUNK_MODE_LABEL: Record<string, string> = {
  text_model: '通用',
  qa_model: '问答',
  hierarchical_model: '父子分段',
}

function mergeDocuments(prev: DocumentModel[], incoming: DocumentModel[]) {
  const map = new Map<string, DocumentModel>()
  prev.forEach((doc) => map.set(doc.id, doc))
  incoming.forEach((doc) => map.set(doc.id, doc))
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )
}

function getStatusText(doc: DocumentModel) {
  return doc.display_status || doc.indexing_status || doc.status || 'unknown'
}

function getStatusClass(status: string) {
  switch (status) {
    case 'available':
    case 'completed':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    case 'disabled':
      return 'bg-slate-100 text-slate-700 border-slate-200'
    case 'archived':
      return 'bg-violet-50 text-violet-700 border-violet-200'
    case 'queuing':
    case 'waiting':
      return 'bg-slate-100 text-slate-700 border-slate-200'
    case 'indexing':
    case 'processing':
    case 'splitting':
    case 'cleaning':
    case 'parsing':
      return 'bg-amber-50 text-amber-700 border-amber-200'
    case 'error':
    case 'failed':
      return 'bg-rose-50 text-rose-700 border-rose-200'
    default:
      return 'bg-gray-50 text-gray-600 border-gray-200'
  }
}

export default function KnowledgeBaseDocumentsPage() {
  const params = useParams()
  const router = useRouter()
  const kbId = params.id as string
  const { secondaryCollapsed, onOpenSidebar } = usePageContext()

  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeBase | null>(null)
  const [documents, setDocuments] = useState<DocumentModel[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [processingMode, setProcessingMode] = useState<UploadProcessingMode>('queue')

  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  const [openMenuDocId, setOpenMenuDocId] = useState<string | null>(null)
  const [renamingDoc, setRenamingDoc] = useState<DocumentModel | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameSubmitting, setRenameSubmitting] = useState(false)

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const loadKnowledgeBase = useCallback(async () => {
    const response = await knowledgeBaseApi.getById(kbId)
    if (response.data.success)
      setKnowledgeBase(response.data.data.knowledge_base as KnowledgeBase)
  }, [kbId])

  const loadDocuments = useCallback(
    async (silent = false) => {
      if (!silent)
        setLoading(true)
      try {
        const response = await knowledgeBaseApi.getDocuments(kbId, {
          page: 1,
          page_size: 100,
          status: statusFilter || undefined,
          sort_by: 'updated_at',
          sort_order: 'desc',
        })
        if (response.data.success) {
          const nextDocuments = (response.data.data.documents || []) as DocumentModel[]
          setDocuments(nextDocuments)
          // 避免筛选切换后保留无效勾选项。
          setSelectedIds((prev) => prev.filter(id => nextDocuments.some(doc => doc.id === id)))
        }
      }
      catch (error: any) {
        const msg = error?.response?.data?.detail || error?.message || '加载文档列表失败'
        // eslint-disable-next-line no-console
        console.error(msg, error)
        alert(msg)
      }
      finally {
        if (!silent)
          setLoading(false)
      }
    },
    [kbId, statusFilter],
  )

  useEffect(() => {
    if (!kbId)
      return
    loadKnowledgeBase()
    loadDocuments()
  }, [kbId, loadKnowledgeBase, loadDocuments])

  useEffect(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }

    const hasActiveJob = documents.some((doc) => {
      const status = getStatusText(doc)
      const jobStatus = doc.ingest_job?.status
      return ACTIVE_STATUSES.has(status) || (jobStatus ? ACTIVE_STATUSES.has(jobStatus) : false)
    })
    if (!hasActiveJob)
      return

    pollingIntervalRef.current = setInterval(() => {
      loadDocuments(true)
    }, 2500)

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
    }
  }, [documents, loadDocuments])

  useEffect(() => {
    if (!openMenuDocId)
      return
    const closeMenu = () => setOpenMenuDocId(null)
    document.addEventListener('click', closeMenu)
    return () => document.removeEventListener('click', closeMenu)
  }, [openMenuDocId])

  const handleUpload = async (files: File[], mode: UploadProcessingMode) => {
    setUploading(true)
    try {
      const batch = crypto.randomUUID().replace(/-/g, '')
      const uploadedDocs: DocumentModel[] = []
      for (const file of files) {
        const response = await documentApi.upload(file, kbId, mode, batch)
        if (response.data.success && response.data.data?.document)
          uploadedDocs.push(response.data.data.document as DocumentModel)
      }
      if (uploadedDocs.length > 0) {
        setDocuments(prev => mergeDocuments(prev, uploadedDocs))
        await loadDocuments(true)
        setUploadDialogOpen(false)
        router.push(`/knowledge-bases/${kbId}/documents/${uploadedDocs[0].id}/process`)
      }
    }
    catch (error) {
      // eslint-disable-next-line no-console
      console.error('上传失败', error)
      alert('上传失败，请稍后重试')
      throw error
    }
    finally {
      setUploading(false)
    }
  }

  const applySingleAction = async (
    action: 'enable' | 'disable' | 'archive' | 'un_archive',
    documentId: string,
  ) => {
    await knowledgeBaseApi.patchDocumentsStatusBatch(kbId, action, [documentId])
    await loadDocuments(true)
  }

  const applyBatchAction = async (
    action: 'enable' | 'disable' | 'archive' | 'un_archive',
  ) => {
    if (selectedIds.length === 0) {
      alert('请先选择文档')
      return
    }
    await knowledgeBaseApi.patchDocumentsStatusBatch(kbId, action, selectedIds)
    setSelectedIds([])
    await loadDocuments(true)
  }

  const handleDelete = async (documentId: string) => {
    if (!confirm('确认删除这个文档吗？删除后无法恢复。'))
      return
    await documentApi.delete(documentId)
    setSelectedIds(prev => prev.filter(id => id !== documentId))
    await loadDocuments(true)
  }

  const handleOpenRename = (doc: DocumentModel) => {
    setRenamingDoc(doc)
    setRenameValue(doc.filename)
  }

  const handleSubmitRename = async () => {
    if (!renamingDoc)
      return
    const nextName = renameValue.trim()
    if (!nextName) {
      alert('文档名称不能为空')
      return
    }
    setRenameSubmitting(true)
    try {
      await knowledgeBaseApi.renameDocument(kbId, renamingDoc.id, nextName)
      setRenamingDoc(null)
      setRenameValue('')
      await loadDocuments(true)
    }
    catch (error: any) {
      const msg = error?.response?.data?.detail || '重命名失败'
      alert(msg)
    }
    finally {
      setRenameSubmitting(false)
    }
  }

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortField(field)
    setSortOrder('desc')
  }

  const filteredAndSortedDocuments = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const filtered = query
      ? documents.filter(doc => doc.filename.toLowerCase().includes(query))
      : documents

    const sorted = [...filtered].sort((a, b) => {
      if (sortField === 'filename') {
        const result = a.filename.localeCompare(b.filename, 'zh-CN')
        return sortOrder === 'asc' ? result : -result
      }
      if (sortField === 'word_count') {
        const result = Number(a.word_count || 0) - Number(b.word_count || 0)
        return sortOrder === 'asc' ? result : -result
      }
      if (sortField === 'hit_count') {
        const result = Number(a.hit_count || 0) - Number(b.hit_count || 0)
        return sortOrder === 'asc' ? result : -result
      }
      const result = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      return sortOrder === 'asc' ? result : -result
    })

    return sorted
  }, [documents, searchQuery, sortField, sortOrder])

  const allChecked = filteredAndSortedDocuments.length > 0
    && filteredAndSortedDocuments.every(doc => selectedIds.includes(doc.id))
  const someChecked = filteredAndSortedDocuments.some(doc => selectedIds.includes(doc.id))

  const toggleSelectAll = () => {
    if (allChecked) {
      setSelectedIds([])
      return
    }
    setSelectedIds(filteredAndSortedDocuments.map(doc => doc.id))
  }

  const toggleSelectOne = (documentId: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(documentId))
        return prev.filter(id => id !== documentId)
      return [...prev, documentId]
    })
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
        title={knowledgeBase?.name || '知识库'}
        secondaryCollapsed={secondaryCollapsed}
        onOpenSidebar={onOpenSidebar}
      />

      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="mx-auto max-w-7xl">
          <KnowledgeDetailTabs knowledgeBaseId={kbId} />

          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="搜索文档"
                    className="h-9 w-64 rounded-lg border border-gray-300 py-1.5 pl-9 pr-3 text-sm"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="h-9 rounded-lg border border-gray-300 px-3 text-sm"
                >
                  {STATUS_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => loadDocuments()}
                  className="h-9 rounded-lg border border-gray-300 px-3 text-sm text-gray-700 hover:bg-gray-50"
                >
                  刷新
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setUploadDialogOpen(true)}
                  disabled={uploading}
                  className="inline-flex h-9 items-center gap-1 rounded-lg bg-[#5147e5] px-3 text-sm text-white hover:bg-[#453ac8] disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  <Upload size={14} />
                  {uploading ? '上传中...' : '上传文档'}
                </button>
                <Link
                  href={`/knowledge-bases/${kbId}/documents/create`}
                  className="inline-flex h-9 items-center rounded-lg border border-[#5147e5] px-3 text-sm text-[#5147e5] hover:bg-[#f5f4ff]"
                >
                  本地路径添加
                </Link>
              </div>
            </div>

            {selectedIds.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <span className="text-xs text-gray-600">已选 {selectedIds.length} 项</span>
                <button onClick={() => applyBatchAction('enable')} className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs hover:bg-gray-50">批量启用</button>
                <button onClick={() => applyBatchAction('disable')} className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs hover:bg-gray-50">批量禁用</button>
                <button onClick={() => applyBatchAction('archive')} className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs hover:bg-gray-50">批量归档</button>
                <button onClick={() => applyBatchAction('un_archive')} className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs hover:bg-gray-50">取消归档</button>
                <button
                  onClick={async () => {
                    if (!confirm(`确认删除已选的 ${selectedIds.length} 个文档吗？`))
                      return
                    for (const id of selectedIds)
                      await documentApi.delete(id)
                    setSelectedIds([])
                    await loadDocuments(true)
                  }}
                  className="rounded-md border border-rose-300 bg-white px-2.5 py-1 text-xs text-rose-700 hover:bg-rose-50"
                >
                  批量删除
                </button>
              </div>
            )}

            {filteredAndSortedDocuments.length === 0
              ? (
                  <div className="rounded-xl border border-dashed border-gray-200 py-16 text-center">
                    <FileText className="mx-auto mb-3 text-gray-300" size={36} />
                    <p className="text-sm text-gray-500">暂无文档</p>
                  </div>
                )
              : (
                  <div className="overflow-hidden rounded-xl border border-gray-200">
                    <table className="w-full border-collapse text-sm">
                      <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                        <tr className="h-10">
                          <td className="w-14 px-3">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={allChecked}
                                ref={(el) => {
                                  if (el)
                                    el.indeterminate = !allChecked && someChecked
                                }}
                                onChange={toggleSelectAll}
                              />
                              #
                            </div>
                          </td>
                          <td className="px-3">
                            <button type="button" onClick={() => toggleSort('filename')} className="inline-flex items-center">
                              文件名
                              <ChevronDown className={`ml-0.5 size-3 ${sortField === 'filename' && sortOrder === 'asc' ? 'rotate-180' : ''}`} />
                            </button>
                          </td>
                          <td className="w-32 px-3">分段模式</td>
                          <td className="w-24 px-3">
                            <button type="button" onClick={() => toggleSort('word_count')} className="inline-flex items-center">
                              字数
                              <ChevronDown className={`ml-0.5 size-3 ${sortField === 'word_count' && sortOrder === 'asc' ? 'rotate-180' : ''}`} />
                            </button>
                          </td>
                          <td className="w-24 px-3">
                            <button type="button" onClick={() => toggleSort('hit_count')} className="inline-flex items-center">
                              召回
                              <ChevronDown className={`ml-0.5 size-3 ${sortField === 'hit_count' && sortOrder === 'asc' ? 'rotate-180' : ''}`} />
                            </button>
                          </td>
                          <td className="w-44 px-3">
                            <button type="button" onClick={() => toggleSort('created_at')} className="inline-flex items-center">
                              上传时间
                              <ChevronDown className={`ml-0.5 size-3 ${sortField === 'created_at' && sortOrder === 'asc' ? 'rotate-180' : ''}`} />
                            </button>
                          </td>
                          <td className="w-32 px-3">状态</td>
                          <td className="w-24 px-3">操作</td>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAndSortedDocuments.map((doc, index) => {
                          const statusText = getStatusText(doc)
                          const isEnabled = !!doc.enabled && !doc.archived
                          return (
                            <tr key={doc.id} className="h-11 border-t border-gray-100 hover:bg-gray-50/70">
                              <td className="px-3">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={selectedIds.includes(doc.id)}
                                    onChange={() => toggleSelectOne(doc.id)}
                                  />
                                  <span className="text-xs text-gray-500">{index + 1}</span>
                                </div>
                              </td>
                              <td className="px-3">
                                <div className="group flex max-w-[460px] items-center gap-2">
                                  <FileText className="size-4 shrink-0 text-gray-400" />
                                  <Link
                                    href={`/knowledge-bases/${kbId}/documents/${doc.id}`}
                                    className="truncate text-sm text-gray-800 hover:text-[#5147e5] hover:underline"
                                    title={doc.filename}
                                  >
                                    {doc.filename}
                                  </Link>
                                  {!doc.archived && (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenRename(doc)}
                                      className="hidden rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 group-hover:inline-flex"
                                      title="重命名"
                                    >
                                      <PencilLine className="size-3.5" />
                                    </button>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 text-gray-600">
                                {CHUNK_MODE_LABEL[doc.doc_form || ''] || doc.doc_form || '-'}
                              </td>
                              <td className="px-3 text-gray-600">{doc.word_count || 0}</td>
                              <td className="px-3 text-gray-600">{doc.hit_count || 0}</td>
                              <td className="px-3 text-gray-500">
                                {new Date(doc.created_at).toLocaleString('zh-CN')}
                              </td>
                              <td className="px-3">
                                <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs ${getStatusClass(statusText)}`}>
                                  {statusText}
                                </span>
                              </td>
                              <td className="px-3">
                                <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                                  <button
                                    type="button"
                                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full border transition ${
                                      isEnabled
                                        ? 'border-emerald-300 bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                                        : 'border-gray-300 bg-white text-gray-400 hover:bg-gray-100'
                                    }`}
                                    title={isEnabled ? '禁用文档' : '启用文档'}
                                    onClick={() => applySingleAction(isEnabled ? 'disable' : 'enable', doc.id)}
                                  >
                                    <Circle className={`size-3 ${isEnabled ? 'fill-current' : ''}`} />
                                  </button>

                                  <div className="relative">
                                    <button
                                      type="button"
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-gray-500 hover:bg-gray-100"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setOpenMenuDocId(prev => (prev === doc.id ? null : doc.id))
                                      }}
                                      title="更多操作"
                                    >
                                      <MoreHorizontal className="size-4" />
                                    </button>

                                    {openMenuDocId === doc.id && (
                                      <div
                                        className="absolute right-0 top-8 z-20 w-36 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
                                        onClick={e => e.stopPropagation()}
                                      >
                                        {!doc.archived && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setOpenMenuDocId(null)
                                              handleOpenRename(doc)
                                            }}
                                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                                          >
                                            <PencilLine className="size-4" />
                                            重命名
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          onClick={async () => {
                                            setOpenMenuDocId(null)
                                            await applySingleAction(doc.archived ? 'un_archive' : 'archive', doc.id)
                                          }}
                                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                                        >
                                          <Archive className="size-4" />
                                          {doc.archived ? '取消归档' : '归档'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={async () => {
                                            setOpenMenuDocId(null)
                                            await handleDelete(doc.id)
                                          }}
                                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
                                        >
                                          <Trash2 className="size-4" />
                                          删除
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
          </div>
        </div>
      </div>

      {renamingDoc && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 p-4" onClick={() => setRenamingDoc(null)}>
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-900">重命名文档</h3>
            <p className="mt-1 text-xs text-gray-500">更新后会直接显示在文档列表与详情页中。</p>
            <input
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              className="mt-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="请输入新名称"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setRenamingDoc(null)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleSubmitRename}
                disabled={renameSubmitting}
                className="rounded-lg bg-[#5147e5] px-3 py-1.5 text-sm text-white hover:bg-[#453ac8] disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {renameSubmitting ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      <FileUploadDialog
        open={uploadDialogOpen}
        onClose={() => setUploadDialogOpen(false)}
        onConfirm={handleUpload}
        accept=".pdf,.docx,.txt,.md,.csv,.json,.xlsx,.pptx,.eml,.jpg,.jpeg,.png"
        maxSize={100}
        multiple
        showProcessingModeToggle
        processingMode={processingMode}
        onProcessingModeChange={setProcessingMode}
      />
    </div>
  )
}
