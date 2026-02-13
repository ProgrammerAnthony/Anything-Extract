'use client';

import { useState, useEffect } from 'react';
import { documentApi } from '@/lib/api';
import Link from 'next/link';
import FileUploadDialog from '@/components/ui/FileUploadDialog';
import { Upload, FileText, Eye, Trash2, Search } from 'lucide-react';

interface Document {
  id: string;
  filename: string;
  file_type: string;
  status: string;
  created_at: string;
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    try {
      const response = await documentApi.getAll();
      if (response.data.success) {
        setDocuments(response.data.data.documents);
      }
    } catch (error) {
      console.error('加载文档失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (files: File[], knowledgeBaseId?: string) => {
    if (!knowledgeBaseId) {
      alert('请先选择知识库');
      return;
    }
    
    setUploading(true);
    try {
      // 逐个上传文件
      for (const file of files) {
        await documentApi.upload(file, knowledgeBaseId);
      }
      loadDocuments();
    } catch (error) {
      console.error('上传文档失败:', error);
      alert('上传失败');
    } finally {
      setUploading(false);
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
    <div className="p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-4">
            文档列表
          </h1>
          
          {/* Search and Upload */}
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="请输入文档名称"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#5147e5] focus:border-transparent"
              />
            </div>
            <button
              onClick={() => setUploadDialogOpen(true)}
              disabled={uploading}
              className="px-4 py-2 bg-[#5147e5] text-white rounded-lg hover:bg-[#4338ca] disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              <Upload size={18} />
              {uploading ? '上传中...' : '新建'}
            </button>
          </div>
        </div>

        {/* Documents List */}
        {filteredDocuments.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDocuments.map((doc) => (
              <div
                key={doc.id}
                className="bg-white p-5 rounded-lg border border-gray-200 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <FileText className="text-[#5147e5] flex-shrink-0 mt-1" size={20} />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-800 truncate">{doc.filename}</h3>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(doc.created_at).toLocaleDateString('zh-CN')}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-4">
                  <span
                    className={`px-2 py-1 text-xs rounded ${getStatusColor(doc.status)}`}
                  >
                    {getStatusText(doc.status)}
                  </span>
                  <div className="flex gap-2">
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
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 bg-white rounded-lg border border-gray-200">
            <FileText className="mx-auto text-gray-300 mb-4" size={48} />
            <p className="text-gray-500 mb-4">
              {searchQuery ? '没有找到匹配的文档' : '还没有文档'}
            </p>
            {!searchQuery && (
              <button
                onClick={() => setUploadDialogOpen(true)}
                className="px-4 py-2 bg-[#5147e5] text-white rounded-lg hover:bg-[#4338ca] transition-colors"
              >
                上传第一个文档
              </button>
            )}
          </div>
        )}
      </div>

      {/* Upload Dialog */}
      <FileUploadDialog
        open={uploadDialogOpen}
        onClose={() => setUploadDialogOpen(false)}
        onConfirm={handleUpload}
        accept=".pdf,.docx,.txt,.md,.csv,.json,.xlsx,.pptx,.eml"
        maxSize={100}
        multiple={true}
      />
    </div>
  );
}

