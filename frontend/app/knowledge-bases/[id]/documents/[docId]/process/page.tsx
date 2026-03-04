'use client'

/**
 * 文档处理流程页（Dify 风格）：STEP2 文本分段与清洗、STEP3 处理并完成。
 * 列表页上传成功后进入本页 STEP2；点击「保存并处理」后保存设置、触发 reindex、进入 STEP3。
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

import { usePageContext } from '@/components/layout/PageContext'
import PageHeader from '@/components/layout/PageHeader'
import ProcessStepTwoForm from '@/components/knowledge/document-process/ProcessStepTwoForm'
import ProcessStepThreeView from '@/components/knowledge/document-process/ProcessStepThreeView'
import { knowledgeBaseApi } from '@/lib/api'
import type { DocumentModel, KnowledgeBase } from '@/lib/knowledge/types'

const STEP_LABELS = [
  { step: 1, label: '选择数据源' },
  { step: 2, label: '文本分段与清洗' },
  { step: 3, label: '处理并完成' },
]

export default function DocumentProcessPage() {
  const params = useParams()
  const kbId = params.id as string
  const docId = params.docId as string
  const { secondaryCollapsed, onOpenSidebar } = usePageContext()

  const [currentStep, setCurrentStep] = useState<2 | 3>(2)
  const [documentInfo, setDocumentInfo] = useState<DocumentModel | null>(null)
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeBase | null>(null)
  const [loading, setLoading] = useState(true)

  const loadDocAndKb = useCallback(async () => {
    setLoading(true)
    try {
      const [docRes, kbRes] = await Promise.all([
        knowledgeBaseApi.getDocument(kbId, docId),
        knowledgeBaseApi.getById(kbId),
      ])
      if (kbRes.data.success)
        setKnowledgeBase(kbRes.data.data.knowledge_base as KnowledgeBase)
      if (docRes.data.success)
        setDocumentInfo(docRes.data.data.document as DocumentModel)
    } finally {
      setLoading(false)
    }
  }, [kbId, docId])

  useEffect(() => {
    loadDocAndKb()
  }, [loadDocAndKb])

  return (
    <div className="flex h-full flex-col bg-[#f3f6fd]">
      <PageHeader
        title={currentStep === 2 ? '文本分段与清洗' : '处理并完成'}
        secondaryCollapsed={secondaryCollapsed}
        onOpenSidebar={onOpenSidebar}
      />

      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="mx-auto max-w-[1400px]">
          <div className="mb-6 flex items-center gap-4">
            <Link
              href={`/knowledge-bases/${kbId}/documents`}
              className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-[#5147e5]"
            >
              <ChevronLeft className="size-4" />
              知识库
            </Link>
            <div className="flex items-center gap-1 text-sm text-gray-500">
              {STEP_LABELS.map(({ step, label }) => (
                <span key={step}>
                  <span
                    className={
                      step === currentStep
                        ? 'font-semibold text-[#5147e5]'
                        : ''
                    }
                  >
                    {step === currentStep ? `STEP ${step} ` : `${step} `}
                    {label}
                  </span>
                  {step < STEP_LABELS.length && <span className="mx-1">·</span>}
                </span>
              ))}
            </div>
          </div>

          {loading && (
            <div className="flex h-48 items-center justify-center text-gray-500">
              加载中...
            </div>
          )}
          {!loading && currentStep === 2 && (
            <ProcessStepTwoForm
              kbId={kbId}
              docId={docId}
              onSaveAndProcess={() => setCurrentStep(3)}
            />
          )}
          {!loading && currentStep === 3 && (
            <ProcessStepThreeView
              kbId={kbId}
              docId={docId}
              documentInfo={documentInfo}
              knowledgeBase={knowledgeBase}
            />
          )}
        </div>
      </div>
    </div>
  )
}
