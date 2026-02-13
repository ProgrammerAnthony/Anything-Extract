'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Eye, FileText, RefreshCw, Search, Trash2, Upload } from 'lucide-react';

import PageHeader from '@/components/layout/PageHeader';
import { usePageContext } from '@/components/layout/PageContext';
import FileUploadDialog, { UploadProcessingMode } from '@/components/ui/FileUploadDialog';
import { documentApi, knowledgeBaseApi } from '@/lib/api';

interface IngestJob {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  attempts: number;
  max_attempts: number;
  error_msg?: string | null;
  processing_mode: UploadProcessingMode;
}

interface DocumentItem {
  id: string;
  filename: string;
  file_type: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | string;
  created_at: string;
  updated_at: string;
  ingest_job?: IngestJob | null;
}

const ACTIVE_STATUSES = new Set(['queued', 'processing']);

function merge文档集(prev: DocumentItem[], incoming: DocumentItem[]) {
  const map = new Map<string, DocumentItem>();
  prev.forEach((doc) => map.set(doc.id, doc));
  incoming.forEach((doc) => map.set(doc.id, doc));
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

export default function KnowledgeBaseDetailPage() {
  const params = useParams();
  const kbId = params.id as string;
  const { secondaryCollapsed, onOpenSidebar } = usePageContext();

  const [knowledgeBase, setKnowledgeBase] = useState<{ id: string; name: string } | null>(null);
  const [documents, set文档集] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [processingMode, setProcessingMode] = useState<UploadProcessingMode>('queue');
  const [searchQuery, setSearchQuery] = useState('');

  const loadKnowledgeBase = useCallback(async () => {
    try {
      const response = await knowledgeBaseApi.getById(kbId);
      if (response.data.success) {
        setKnowledgeBase(response.data.data.knowledge_base);
      }
    } catch (error) {
      console.error('加载知识库失败:', error);
    }
  }, [kbId]);

  const load文档集 = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const response = await knowledgeBaseApi.get文档集(kbId);
        if (response.data.success) {
          set文档集(response.data.data.documents || []);
        }
      } catch (error) {
        console.error('加载文档失败:', error);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [kbId],
  );

  useEffect(() => {
    if (!kbId) return;
    loadKnowledgeBase();
    load文档集();
  }, [kbId, loadKnowledgeBase, load文档集]);

  useEffect(() => {
    const hasActiveJob = documents.some((doc) => ACTIVE_STATUSES.has(doc.status));
    if (!hasActiveJob) return;

    const timer = setInterval(() => {
      load文档集(true);
    }, 2000);

    return () => clearInterval(timer);
  }, [documents, load文档集]);

  const handleUpload = async (files: File[], mode: UploadProcessingMode) => {
    setUploading(true);
    try {
      const uploadedDocs: DocumentItem[] = [];
      for (const file of files) {
        const response = await documentApi.upload(file, kbId, mode);
        if (response.data.success && response.data.data?.document) {
          uploadedDocs.push(response.data.data.document as DocumentItem);
        }
      }

      if (uploadedDocs.length > 0) {
        set文档集((prev) => merge文档集(prev, uploadedDocs));
      }

      load文档集(true);
    } catch (error) {
      console.error('上传失败:', error);
      alert('上传失败，请稍后重试');
      throw error;
    } finally {
      setUploading(false);
    }
  };

  const handleRetry = async (documentId: string) => {
    try {
      const response = await documentApi.retry(documentId);
      if (response.data.success && response.data.data?.document) {
        const retriedDoc = response.data.data.document as DocumentItem;
        set文档集((prev) => merge文档集(prev, [retriedDoc]));
      }
      load文档集(true);
    } catch (error: any) {
      console.error('重试失败:', error);
      alert(error?.response?.data?.detail || '重试失败');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个文档吗？')) return;

    try {
      await documentApi.delete(id);
      set文档集((prev) => prev.filter((doc) => doc.id !== id));
    } catch (error) {
      console.error('删除失败:', error);
      alert('删除失败，请稍后重试');
    }
  };

  const filtered文档集 = useMemo(
    () => documents.filter((doc) => doc.filename.toLowerCase().includes(searchQuery.toLowerCase())),
    [documents, searchQuery],
  );

  const get状态Color = (status: string) => {
    switch (status) {
      case 'queued':
        return 'text-slate-700 bg-slate-100';
      case 'processing':
        return 'text-amber-700 bg-amber-100';
      case 'completed':
        return 'text-emerald-700 bg-emerald-100';
      case 'failed':
        return 'text-red-700 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const get状态Text = (status: string) => {
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
    <div className="flex h-full flex-col bg-[#f3f6fd]">
      <PageHeader
        title={knowledgeBase?.name || '知识库'}
        secondaryCollapsed={secondaryCollapsed}
        onOpenSidebar={onOpenSidebar}
      />

      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6">
            {knowledgeBase && <p className="mb-4 text-sm text-gray-500">kb_id: {knowledgeBase.id}</p>}

            <div className="mb-4 border-b border-gray-200">
              <button className="border-b-2 border-[#5147e5] px-4 py-2 text-sm font-medium text-[#5147e5]">
                文档集
              </button>
            </div>

            <div className="mb-4 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder="搜索文档"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#5147e5]"
                />
              </div>
              <button
                onClick={() => setUploadDialogOpen(true)}
                disabled={uploading}
                className="flex items-center gap-2 rounded-lg bg-[#5147e5] px-4 py-2 text-white transition-colors hover:bg-[#4338ca] disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                <Upload size={18} />
                {uploading ? '上传中...' : '上传文档'}
              </button>
            </div>
          </div>

          {filtered文档集.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">文档ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">文档名</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">状态</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">队列信息</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">创建时间</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filtered文档集.map((doc) => (
                    <tr key={doc.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-xs text-gray-700">{doc.id}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{doc.filename}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded px-2 py-1 text-xs ${get状态Color(doc.status)}`}>
                          {get状态Text(doc.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {doc.ingest_job ? (
                          <div>
                            <div>
                              {doc.ingest_job.processing_mode === 'queue' ? '队列信息 worker' : 'Immediate'} | 
                              尝试 {Math.min(doc.ingest_job.attempts, doc.ingest_job.max_attempts)}/
                              {doc.ingest_job.max_attempts}
                            </div>
                            {doc.ingest_job.error_msg && (
                              <div className="mt-1 line-clamp-2 text-red-500">{doc.ingest_job.error_msg}</div>
                            )}
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {new Date(doc.created_at).toLocaleDateString('zh-CN')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Link
                            href={`/documents/${doc.id}`}
                            className="rounded p-1.5 text-gray-600 transition-colors hover:bg-gray-50 hover:text-[#5147e5]"
                            title="查看"
                          >
                            <Eye size={16} />
                          </Link>
                          {doc.status === 'failed' && doc.ingest_job && (
                            <button
                              onClick={() => handleRetry(doc.id)}
                              className="rounded p-1.5 text-gray-600 transition-colors hover:bg-gray-50 hover:text-amber-600"
                              title="重试"
                            >
                              <RefreshCw size={16} />
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(doc.id)}
                            className="rounded p-1.5 text-gray-600 transition-colors hover:bg-gray-50 hover:text-red-500"
                            title="删除"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-white py-16 text-center">
              <FileText className="mx-auto mb-4 text-gray-300" size={48} />
              <p className="text-gray-500">暂无数据</p>
            </div>
          )}
        </div>
      </div>

      <FileUploadDialog
        open={uploadDialogOpen}
        onClose={() => setUploadDialogOpen(false)}
        onConfirm={handleUpload}
        accept=".pdf,.docx,.txt,.md,.csv,.json,.xlsx,.pptx,.eml"
        maxSize={100}
        multiple
        showProcessingModeToggle
        processingMode={processingMode}
        onProcessingModeChange={setProcessingMode}
      />
    </div>
  );
}
