'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { knowledgeBaseApi, documentApi } from '@/lib/api';
import FileUploadDialog from '@/components/ui/FileUploadDialog';
import PageHeader from '@/components/layout/PageHeader';
import { usePageContext } from '@/components/layout/PageContext';
import { Upload, FileText, Eye, Trash2, Search } from 'lucide-react';

interface Document {
  id: string;
  filename: string;
  file_type: string;
  status: string;
  created_at: string;
}

export default function KnowledgeBaseDetailPage() {
  const params = useParams();
  const kbId = params.id as string;
  const { secondaryCollapsed, onOpenSidebar } = usePageContext();
  
  const [knowledgeBase, setKnowledgeBase] = useState<any>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (kbId) {
      loadKnowledgeBase();
      loadDocuments();
    }
  }, [kbId]);

  // 轮询文档状态（仅轮询 processing 状态的文档）
  useEffect(() => {
    const hasProcessing = documents.some(doc => doc.status === 'processing');
    if (!hasProcessing) return;

    const interval = setInterval(() => {
      loadDocuments();
    }, 3000); // 每3秒轮询一次

    return () => clearInterval(interval);
  }, [documents, kbId]);

  const loadKnowledgeBase = async () => {
    try {
      const response = await knowledgeBaseApi.getById(kbId);
      if (response.data.success) {
        setKnowledgeBase(response.data.data.knowledge_base);
      }
    } catch (error) {
      console.error('加载知识库失败:', error);
    }
  };

  const loadDocuments = async () => {
    try {
      // 不筛选状态，获取所有文档（包括processing状态的）
      const response = await knowledgeBaseApi.getDocuments(kbId, { status: undefined });
      if (response.data.success) {
        setDocuments(response.data.data.documents);
        console.log('加载文档列表:', response.data.data.documents);
      }
    } catch (error) {
      console.error('加载文档失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (files: File[]) => {
    setUploading(true);
    try {
      const uploadedDocs: Document[] = [];
      for (const file of files) {
        const response = await documentApi.upload(file, kbId);
        if (response.data.success && response.data.data.document) {
          // 立即添加到列表，即使状态是 processing
          const newDoc = response.data.data.document;
          uploadedDocs.push(newDoc);
          console.log('文档上传成功:', newDoc);
        }
      }
      
      // 立即更新文档列表
      if (uploadedDocs.length > 0) {
        setDocuments(prev => [...uploadedDocs, ...prev]);
      }
      
      // 延迟重新加载以确保状态同步（给后端一些时间处理）
      setTimeout(() => {
        loadDocuments();
      }, 1000);
    } catch (error) {
      console.error('上传文档失败:', error);
      alert('上传失败');
    } finally {
      setUploading(false);
      setUploadDialogOpen(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个文档吗？')) return;
    
    try {
      await documentApi.delete(id);
      loadDocuments();
    } catch (error) {
      console.error('删除文档失败:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 bg-green-50';
      case 'processing':
        return 'text-yellow-600 bg-yellow-50';
      case 'failed':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return '已完成';
      case 'processing':
        return '处理中';
      case 'failed':
        return '失败';
      default:
        return status;
    }
  };

  const filteredDocuments = documents.filter((doc) =>
    doc.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
        title={knowledgeBase?.name || '知识库'} 
        secondaryCollapsed={secondaryCollapsed}
        onOpenSidebar={onOpenSidebar}
      />

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-6">
          
            {knowledgeBase && (
              <p className="text-sm text-gray-500 mb-4">
                kb_id:{knowledgeBase.id}
              </p>
            )}
            
              {/* Tabs and Actions */}
            <div className="mb-4">
              <div className="flex items-center gap-2 border-b border-gray-200">
                <button className="px-4 py-2 text-sm font-medium text-[#5147e5] border-b-2 border-[#5147e5]">
                  文档集
                </button>
              </div>
            </div>

            {/* Search and Upload */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <button className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded hover:bg-gray-50">
                批量删除
              </button>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder="搜索文档"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#5147e5] focus:border-transparent"
                />
              </div>
              <button
                onClick={() => setUploadDialogOpen(true)}
                disabled={uploading}
                className="px-4 py-2 bg-[#5147e5] text-white rounded-lg hover:bg-[#4338ca] disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                <Upload size={18} />
                {uploading ? '上传中...' : '上传文档'}
              </button>
            </div>
          </div>
        </div>

        {/* Documents Table */}
        {filteredDocuments.length > 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    <input type="checkbox" className="rounded" />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">文档ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">文档名称</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">文档状态(解析成功...)</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">文件大小</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">创建日期</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">备注</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredDocuments.map((doc) => (
                  <tr key={doc.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <input type="checkbox" className="rounded" />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">{doc.id}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{doc.filename}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded ${getStatusColor(doc.status)}`}>
                        {getStatusText(doc.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">-</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(doc.created_at).toLocaleDateString('zh-CN')}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">-</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/documents/${doc.id}`}
                          className="p-1.5 text-gray-600 hover:text-[#5147e5] hover:bg-gray-50 rounded transition-colors"
                          title="查看"
                        >
                          <Eye size={16} />
                        </Link>
                        <button
                          onClick={() => handleDelete(doc.id)}
                          className="p-1.5 text-gray-600 hover:text-red-500 hover:bg-gray-50 rounded transition-colors"
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
          <div className="text-center py-16 bg-white rounded-lg border border-gray-200">
            <FileText className="mx-auto text-gray-300 mb-4" size={48} />
            <p className="text-gray-500 mb-4">暂无数据</p>
          </div>
        )}
      </div>
    </div>

      {/* Upload Dialog */}
      <FileUploadDialog
        open={uploadDialogOpen}
        onClose={() => setUploadDialogOpen(false)}
        onConfirm={handleUpload}
        accept=".pdf,.docx"
        maxSize={100}
        multiple={true}
      />
    </div>
  );
}


