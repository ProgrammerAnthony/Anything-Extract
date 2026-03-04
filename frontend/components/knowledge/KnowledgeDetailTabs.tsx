'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface KnowledgeDetailTabsProps {
  knowledgeBaseId: string
}

const tabs = [
  { id: 'documents', label: '文档', suffix: '/documents' },
  { id: 'hit-testing', label: '召回测试', suffix: '/hit-testing' },
  { id: 'settings', label: '设置', suffix: '/settings' },
]

export default function KnowledgeDetailTabs({ knowledgeBaseId }: KnowledgeDetailTabsProps) {
  const pathname = usePathname()

  return (
    <div className="mb-5 border-b border-gray-200">
      <div className="flex items-center gap-2">
        {tabs.map((tab) => {
          const href = `/knowledge-bases/${knowledgeBaseId}${tab.suffix}`
          const active = pathname?.startsWith(href)
          return (
            <Link
              key={tab.id}
              href={href}
              className={`rounded-t-md border px-4 py-2 text-sm transition-colors ${
                active
                  ? 'border-b-white border-[#5147e5] bg-white text-[#5147e5]'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
