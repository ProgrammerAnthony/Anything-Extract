'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, FileText, Search, Trash2, Upload } from 'lucide-react';

import { documentApi } from '@/lib/api';

interface DocumentItem {
  id: string;
  filename: string;
  file_type: string;
  status: string;
  created_at: string;
}

export default function 文档列表Page() {
  const router = useRouter();
  const [documents, set文档列表] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const load文档列表 = async () => {
    try {
      const response = await documentApi.getAll();
      if (response.data.success) {
        set文档列表(response.data.data.documents || []);
      }
    } catch (error) {
      console.error('加载文档失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load文档列表();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个文档吗？')) return;

    try {
      await documentApi.delete(id);
      set文档列表((prev) => prev.filter((doc) => doc.id !== id));
    } catch (error) {
      console.error('删除文档失败:', error);
    }
  };

  const filtered文档列表 = useMemo(
    () => documents.filter((doc) => doc.filename.toLowerCase().includes(searchQuery.toLowerCase())),
    [documents, searchQuery],
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'queued':
        return 'text-slate-700 bg-slate-100';
      case 'processing':
        return 'text-yellow-600 bg-yellow-50';
      case 'completed':
        return 'text-green-600 bg-green-50';
      case 'failed':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'queued':
        return '排队中';
      case 'processing':
        return '处理中';
      case 'completed':
        return '已完成';
      case 'failed':
        return '失败';
      default:
        return status;
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <h1 className="mb-4 text-2xl font-bold text-gray-800 md:text-3xl">文档列表</h1>

          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="按文档名搜索"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#5147e5]"
              />
            </div>
            <button
              onClick={() => router.push('/knowledge-bases')}
              className="flex items-center gap-2 rounded-lg bg-[#5147e5] px-4 py-2 text-white transition-colors hover:bg-[#4338ca]"
            >
              <Upload size={18} />
              去知识库上传
            </button>
          </div>
        </div>

        {filtered文档列表.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered文档列表.map((doc) => (
              <div
                key={doc.id}
                className="rounded-lg border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md"
              >
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <FileText className="mt-1 flex-shrink-0 text-[#5147e5]" size={20} />
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-medium text-gray-800">{doc.filename}</h3>
                      <p className="mt-1 text-xs text-gray-500">
                        {new Date(doc.created_at).toLocaleDateString('zh-CN')}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <span className={`rounded px-2 py-1 text-xs ${getStatusColor(doc.status)}`}>
                    {getStatusText(doc.status)}
                  </span>
                  <div className="flex gap-2">
                    <Link
                      href={`/documents/${doc.id}`}
                      className="rounded p-1.5 text-gray-600 transition-colors hover:bg-gray-50 hover:text-[#5147e5]"
                      title="查看"
                    >
                      <Eye size={16} />
                    </Link>
                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="rounded p-1.5 text-gray-600 transition-colors hover:bg-gray-50 hover:text-red-500"
                      title="删除"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200 bg-white py-16 text-center">
            <FileText className="mx-auto mb-4 text-gray-300" size={48} />
            <p className="mb-4 text-gray-500">{searchQuery ? '未找到匹配文档' : '暂无文档'}</p>
            {!searchQuery && (
              <button
                onClick={() => router.push('/knowledge-bases')}
                className="rounded-lg bg-[#5147e5] px-4 py-2 text-white transition-colors hover:bg-[#4338ca]"
              >
                去上传文档
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
