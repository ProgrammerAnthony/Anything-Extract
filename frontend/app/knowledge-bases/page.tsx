'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { knowledgeBaseApi } from '@/lib/api';
import PageHeader from '@/components/layout/PageHeader';
import { usePageContext } from '@/components/layout/PageContext';
import { Plus } from 'lucide-react';

interface KnowledgeBase {
  id: string;
  name: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export default function KnowledgeBasesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { secondaryCollapsed, onOpenSidebar } = usePageContext();
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadKnowledgeBases();
  }, []);

  const loadKnowledgeBases = async () => {
    try {
      const response = await knowledgeBaseApi.getAll();
      if (response.data.success) {
        const kbs = response.data.data.knowledge_bases;
        setKnowledgeBases(kbs);
        
        // 如果有知识库且当前在 /knowledge-bases 路径，默认跳转到第一个知识库
        if (kbs.length > 0 && pathname === '/knowledge-bases') {
          const defaultKb = kbs.find((kb: KnowledgeBase) => kb.is_default) || kbs[0];
          if (defaultKb) {
            router.push(`/knowledge-bases/${defaultKb.id}`);
            return; // 跳转后不设置 loading 为 false，让页面保持加载状态
          }
        }
      }
    } catch (error) {
      console.error('加载知识库失败:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#f3f6fd]">
      {/* 顶部标题栏 */}
      <PageHeader 
        title="知识库列表" 
        secondaryCollapsed={secondaryCollapsed}
        onOpenSidebar={onOpenSidebar}
      />

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="text-center py-16">
          <p className="text-gray-500 mb-4">
            请在左侧侧边栏创建和管理知识库
          </p>
        </div>
      </div>
    </div>
  );
}

