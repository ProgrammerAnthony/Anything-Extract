'use client';

import PageHeader from '@/components/layout/PageHeader';
import { usePageContext } from '@/components/layout/PageContext';

export default function QAPage() {
  const { secondaryCollapsed, onOpenSidebar } = usePageContext();
  
  return (
    <div className="h-full flex flex-col bg-[#f3f6fd]">
      {/* 顶部标题栏 */}
      <PageHeader 
        title="知识问答" 
        secondaryCollapsed={secondaryCollapsed}
        onOpenSidebar={onOpenSidebar}
      />

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <div className="text-gray-300 mb-4">
              <svg className="mx-auto" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">知识问答</h2>
            <p className="text-gray-500 mb-4">功能开发中，敬请期待...</p>
          </div>
        </div>
      </div>
    </div>
  );
}

