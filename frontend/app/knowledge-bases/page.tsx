'use client'

/** 知识库列表页：拉取知识库列表，若有则重定向到默认/第一个知识库的文档列表。 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

import PageHeader from '@/components/layout/PageHeader'
import { usePageContext } from '@/components/layout/PageContext'
import { redirectToDefaultKnowledgeBase } from '@/lib/knowledge/redirect-to-default-knowledge-base'
import LoadingState from '@/components/ui/LoadingState'
import EmptyState from '@/components/ui/EmptyState'

export default function KnowledgeBasesPage() {
  const router = useRouter()
  const pathname = usePathname()
  const { secondaryCollapsed, onOpenSidebar } = usePageContext()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadAndRedirect = async () => {
      try {
        await redirectToDefaultKnowledgeBase(pathname, router.push)
      }
      finally {
        setLoading(false)
      }
    }

    loadAndRedirect()
  }, [pathname, router])

  if (loading) {
    return <LoadingState />
  }

  return (
    <div className="flex h-full flex-col bg-[#f3f6fd]">
      <PageHeader title="知识库列表" secondaryCollapsed={secondaryCollapsed} onOpenSidebar={onOpenSidebar} />

      <div className="flex-1 overflow-y-auto p-6">
        <EmptyState
          title="暂未找到可跳转的知识库"
          description="你可以使用创建向导初始化知识库与文档。"
          action={(
            <Link
              href="/knowledge-bases/create"
              className="rounded-lg bg-[#5147e5] px-4 py-2 text-sm text-white hover:bg-[#4338ca]"
            >
              打开创建向导
            </Link>
          )}
        />
      </div>
    </div>
  )
}
