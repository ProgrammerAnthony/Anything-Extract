'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

import PageHeader from '@/components/layout/PageHeader'
import { usePageContext } from '@/components/layout/PageContext'
import KnowledgeDetailTabs from '@/components/knowledge/KnowledgeDetailTabs'
import { knowledgeBaseApi } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'

export default function KnowledgeBaseDocumentCreatePage() {
  const params = useParams()
  const kbId = params.id as string
  const router = useRouter()
  const { secondaryCollapsed, onOpenSidebar } = usePageContext()

  const [filePath, setFilePath] = useState('')
  const [name, setName] = useState('')
  const [fileType, setFileType] = useState('pdf')
  const [docForm, setDocForm] = useState<'text_model' | 'qa_model' | 'hierarchical_model'>('text_model')
  const [saving, setSaving] = useState(false)
  const { showToast } = useToast()

  const submit = async () => {
    if (!filePath.trim()) {
      showToast({ title: '请输入本地文件路径', variant: 'info' })
      return
    }

    setSaving(true)
    try {
      await knowledgeBaseApi.createDocument(kbId, {
        name: name.trim() || undefined,
        file_path: filePath.trim(),
        file_type: fileType,
        doc_form: docForm,
      })
      showToast({ title: '文档已加入索引队列', variant: 'success' })
      router.push(`/knowledge-bases/${kbId}/documents`)
    }
    catch (error: any) {
      // eslint-disable-next-line no-console
      console.error(error)
      showToast({
        title: '创建失败',
        description: error?.response?.data?.detail || '请检查路径是否正确',
        variant: 'error',
      })
    }
    finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full flex-col bg-[#f3f6fd]">
      <PageHeader title="添加文档" secondaryCollapsed={secondaryCollapsed} onOpenSidebar={onOpenSidebar} />

      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="mx-auto max-w-3xl">
          <KnowledgeDetailTabs knowledgeBaseId={kbId} />

          <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-5">
            <div>
              <p className="mb-1 text-sm font-medium text-gray-700">文档名称（可选）</p>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="留空则使用文件名"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <p className="mb-1 text-sm font-medium text-gray-700">本地文件路径</p>
              <input
                value={filePath}
                onChange={e => setFilePath(e.target.value)}
                placeholder="例如: D:\\data\\demo.pdf"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <p className="mb-1 text-sm font-medium text-gray-700">文件类型</p>
                <input
                  value={fileType}
                  onChange={e => setFileType(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <p className="mb-1 text-sm font-medium text-gray-700">分段模式</p>
                <select
                  value={docForm}
                  onChange={e => setDocForm(e.target.value as any)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="text_model">通用文本</option>
                  <option value="qa_model">Q&A</option>
                  <option value="hierarchical_model">父子分段</option>
                </select>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={submit}
                disabled={saving}
                className="rounded-lg bg-[#5147e5] px-4 py-2 text-sm text-white hover:bg-[#4338ca] disabled:bg-gray-300"
              >
                {saving ? '提交中...' : '创建并开始索引'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
