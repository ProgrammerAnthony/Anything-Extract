'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { tagApi } from '@/lib/api';
import PageHeader from '@/components/layout/PageHeader';
import TagCard from '@/components/tags/TagCard';
import { usePageContext } from '@/components/layout/PageContext';
import { Plus } from 'lucide-react';
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'

interface Tag {
  id: string;
  name: string;
  type: 'single_choice' | 'multiple_choice' | 'text_input';
  description?: string;
  options?: string[];
  required: boolean;
  created_at?: string;
}

export default function TagsPage() {
  const { secondaryCollapsed, onOpenSidebar } = usePageContext();
  const router = useRouter();
  const { showToast } = useToast()
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingDeleteTag, setPendingDeleteTag] = useState<Tag | null>(null)

  useEffect(() => {
    loadTags();
  }, []);

  const loadTags = async () => {
    try {
      const response = await tagApi.getAll();
      if (response.data.success) {
        setTags(response.data.data.tags);
      }
    } catch (error) {
      console.error('加载标签失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await tagApi.delete(id);
      await loadTags();
      showToast({ title: '删除成功', variant: 'success' })
    } catch (error) {
      console.error('删除标签失败:', error);
      showToast({ title: '删除失败', description: '请稍后重试', variant: 'error' })
    }
  };

  const handleCreate = () => {
    router.push('/tags/new');
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#f3f6fd]">
      {/* 顶部标题栏 */}
      <PageHeader 
        title="标签管理" 
        secondaryCollapsed={secondaryCollapsed}
        onOpenSidebar={onOpenSidebar}
      />

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-7xl mx-auto">
          {/* 标签卡片网格 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* 创建标签卡片 */}
            <div
              onClick={handleCreate}
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg transition-all duration-250 flex flex-col items-center justify-center cursor-pointer h-[250px]"
            >
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-[#7261e9] flex items-center justify-center mb-3">
                  <Plus size={24} className="text-white" />
                </div>
                <span className="text-lg font-medium text-[#7261e9]">创建标签</span>
              </div>
            </div>

            {/* 标签卡片列表 */}
            {tags.map((tag) => (
              <TagCard
                key={tag.id}
                tag={tag}
                onRequestDelete={(t) => setPendingDeleteTag(t)}
              />
            ))}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!pendingDeleteTag}
        title="确认删除该标签？"
        description={pendingDeleteTag ? `将删除「${pendingDeleteTag.name}」，删除后无法恢复` : '删除后无法恢复'}
        type="danger"
        onClose={() => setPendingDeleteTag(null)}
        onConfirm={() => {
          const id = pendingDeleteTag?.id
          setPendingDeleteTag(null)
          if (id)
            void handleDelete(id)
        }}
      />
    </div>
  );
}

