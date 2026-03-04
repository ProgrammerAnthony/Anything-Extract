'use client'

/** 知识库列表页：拉取知识库列表，若有则重定向到默认/第一个知识库的文档列表。 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

import PageHeader from '@/components/layout/PageHeader'
import { usePageContext } from '@/components/layout/PageContext'
import { knowledgeBaseApi } from '@/lib/api'

interface KnowledgeBase {
  id: string
  name: string
  is_default: boolean
}

export default function KnowledgeBasesPage() {
  const router = useRouter()
  const pathname = usePathname()
  const { secondaryCollapsed, onOpenSidebar } = usePageContext()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadKnowledgeBases = async () => {
      try {
        const response = await knowledgeBaseApi.getAll({ page: 1, limit: 50 })
        if (response.data.success) {
          const kbs = response.data.data.knowledge_bases as KnowledgeBase[]
          if (kbs.length > 0 && pathname === '/knowledge-bases') {
            const defaultKb = kbs.find(kb => kb.is_default) || kbs[0]
            router.push(`/knowledge-bases/${defaultKb.id}/documents`)
            return
          }
        }
      }
      finally {
        setLoading(false)
      }
    }

    loadKnowledgeBases()
  }, [pathname, router])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-gray-500">加载中...</div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-[#f3f6fd]">
      <PageHeader title="知识库列表" secondaryCollapsed={secondaryCollapsed} onOpenSidebar={onOpenSidebar} />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-2 text-lg font-semibold text-gray-800">暂未找到可跳转的知识库</h2>
          <p className="mb-4 text-sm text-gray-500">你可以使用创建向导初始化知识库与文档。</p>
          <Link href="/knowledge-bases/create" className="rounded-lg bg-[#5147e5] px-4 py-2 text-sm text-white hover:bg-[#4338ca]">
            打开创建向导
          </Link>
        </div>
      </div>
    </div>
  )
}
