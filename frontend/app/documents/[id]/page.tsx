'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { documentApi, extractApi, tagApi } from '@/lib/api';
import Link from 'next/link';

interface Document {
  id: string;
  filename: string;
  file_type: string;
  status: string;
  metadata?: any;
  has_extraction?: boolean;
  extraction_history?: Record<string, {
    tag_config_id: string;
    latest_result: any;
    all_results: any[];
  }>;
  created_at: string;
}

interface Tag {
  id: string;
  name: string;
  type: string;
  description?: string;
  options?: string[];
}

interface ExtractionResult {
  result: Record<string, any>;
  sources: Array<{
    chunk_id?: string;
    document_id: string;
    similarity?: number;
    content: string;
  }>;
  tag_results?: Record<string, {
    tag_id: string;
    tag_name: string;
    result: any;
    retrieval_results: any[];
    sources: any[];
  }>;
  extraction_time?: number;
  detailed_time?: {
    total: number;
    retrieval: number;
    llm: number;
    parse: number;
  };
}

export default function DocumentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const documentId = params.id as string;
  
  const [document, setDocument] = useState<Document | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDocument();
    loadTags();
  }, [documentId]);

  const loadDocument = async () => {
    try {
      const response = await documentApi.getById(documentId);
      if (response.data.success) {
        const doc = response.data.data.document;
        setDocument(doc);
        // 如果有历史提取结果，可以选择显示最新的
        if (doc.has_extraction && doc.extraction_history) {
          // 可以在这里设置默认显示的历史结果
        }
      }
    } catch (error) {
      console.error('加载文档失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTags = async () => {
    try {
      const response = await tagApi.getAll();
      if (response.data.success) {
        setTags(response.data.data.tags);
      }
    } catch (error) {
      console.error('加载标签失败:', error);
    }
  };

  const handleExtract = async () => {
    if (selectedTagIds.length === 0) {
      alert('请至少选择一个标签');
      return;
    }

    if (!document || document.status !== 'completed') {
      alert('文档尚未处理完成');
      return;
    }

    setExtracting(true);
    setExtractionResult(null);

    try {
      const response = await extractApi.multiTagExtract({
        tag_config_ids: selectedTagIds,
        document_id: documentId,
        retrieval_method: 'basic',
        top_k: 5,
      });

      if (response.data.success) {
        setExtractionResult(response.data.data);
        // 提取完成后重新加载文档以获取最新的历史记录
        await loadDocument();
      }
    } catch (error: any) {
      console.error('提取失败:', error);
      alert(error.response?.data?.error?.message || '提取失败');
    } finally {
      setExtracting(false);
    }
  };

  const toggleTag = (tagId: string) => {
    setSelectedTagIds(prev => 
      prev.includes(tagId)
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    );
  };

  if (loading) {
    return <div className="p-8">加载中...</div>;
  }

  if (!document) {
    return <div className="p-8">文档不存在</div>;
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="text-blue-500 hover:text-blue-700 mb-4"
          >
            ← 返回
          </button>
          <h1 className="text-4xl font-bold mb-2">{document.filename}</h1>
          <p className="text-gray-500">
            类型: {document.file_type} | 状态: {document.status}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* 左侧：标签选择和提取 */}
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold mb-4">选择标签进行提取</h2>
              
              <div className="space-y-2 mb-4">
                {tags.map((tag) => (
                  <label
                    key={tag.id}
                    className="flex items-start gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTagIds.includes(tag.id)}
                      onChange={() => toggleTag(tag.id)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="font-medium">{tag.name}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded border ${
                          tag.type === 'single_choice' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          tag.type === 'multiple_choice' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                          'bg-green-50 text-green-700 border-green-200'
                        }`}>
                          {tag.type === 'single_choice' ? '单选' : tag.type === 'multiple_choice' ? '多选' : '填空'}
                        </span>
                      </div>
                      {tag.description && (
                        <div className="text-sm text-gray-600 mt-1">
                          {tag.description}
                        </div>
                      )}
                      {tag.options && tag.options.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs text-gray-500 mb-1">可选项:</p>
                          <div className="flex flex-wrap gap-1">
                            {tag.options.map((option: string, idx: number) => (
                              <span key={idx} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded">
                                {option}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </label>
                ))}
              </div>

              {tags.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <p>还没有标签配置</p>
                  <Link
                    href="/tags/new"
                    className="text-blue-500 hover:text-blue-700 mt-2 inline-block"
                  >
                    创建标签
                  </Link>
                </div>
              )}

              <button
                onClick={handleExtract}
                disabled={extracting || selectedTagIds.length === 0 || document.status !== 'completed'}
                className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
              >
                {extracting ? '提取中...' : '开始提取'}
              </button>
            </div>
          </div>

          {/* 右侧：提取结果和历史记录 */}
          <div>
            {/* 历史提取结果 */}
            {document?.has_extraction && document?.extraction_history && (
              <div className="mb-6 space-y-4">
                <h2 className="text-2xl font-semibold">历史提取结果</h2>
                {Object.values(document.extraction_history).map((history: any, idx: number) => (
                  <div key={history.tag_config_id || idx} className="p-4 border rounded-lg bg-white">
                    <h3 className="text-lg font-semibold mb-3">标签ID: {history.tag_config_id}</h3>
                    {history.latest_result && (
                      <div className="space-y-3">
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 mb-2">最新提取结果</h4>
                          <div className="bg-gray-50 p-3 rounded">
                            <pre className="text-sm overflow-auto">
                              {JSON.stringify(history.latest_result.result, null, 2)}
                            </pre>
                          </div>
                        </div>
                        {history.latest_result.retrieval_results && history.latest_result.retrieval_results.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium text-gray-700 mb-2">
                              检索结果 ({history.latest_result.retrieval_results.length} 条)
                            </h4>
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                              {history.latest_result.retrieval_results.map((retrieval: any, rIdx: number) => (
                                <div key={rIdx} className="p-2 bg-gray-50 rounded text-xs">
                                  <div className="flex justify-between mb-1">
                                    <span>Chunk {rIdx + 1}</span>
                                    <span className="text-blue-600">
                                      相似度: {(retrieval.similarity || 0).toFixed(4)}
                                    </span>
                                  </div>
                                  <p className="text-gray-600 truncate">{retrieval.content}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        <p className="text-xs text-gray-500">
                          提取时间: {new Date(history.latest_result.created_at).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 新提取结果 */}
            {extractionResult && (
              <div className="space-y-6">
                <h2 className="text-2xl font-semibold">本次提取结果</h2>
                
                {/* 多标签结果 - 按标签分组展示 */}
                {extractionResult.tag_results ? (
                  <div className="space-y-4">
                    {Object.values(extractionResult.tag_results).map((tagResult: any, tagIdx: number) => (
                      <div key={tagResult.tag_id || tagIdx} className="p-6 border rounded-lg bg-white">
                        <h3 className="text-lg font-semibold mb-3">标签: {tagResult.tag_name}</h3>
                        
                        {/* 提取结果值 */}
                        <div className="mb-4">
                          <h4 className="text-sm font-medium text-gray-700 mb-2">提取结果</h4>
                          <div className="bg-gray-50 p-3 rounded">
                            {Array.isArray(tagResult.result) ? (
                              <div className="flex flex-wrap gap-2">
                                {tagResult.result.map((item: any, idx: number) => (
                                  <span
                                    key={idx}
                                    className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full"
                                  >
                                    {String(item)}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className="text-gray-800">
                                {tagResult.result !== null && tagResult.result !== undefined 
                                  ? String(tagResult.result) 
                                  : '未找到'}
                              </p>
                            )}
                          </div>
                        </div>
                        
                        {/* 该标签的检索结果 */}
                        {tagResult.retrieval_results && tagResult.retrieval_results.length > 0 && (
                          <div className="mb-4">
                            <h4 className="text-sm font-medium text-gray-700 mb-2">
                              检索结果 ({tagResult.retrieval_results.length} 条)
                            </h4>
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                              {tagResult.retrieval_results.map((retrieval: any, idx: number) => (
                                <div
                                  key={idx}
                                  className="p-3 bg-gray-50 rounded text-sm"
                                >
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-medium text-gray-500">
                                      Chunk {idx + 1} ({retrieval.chunk_id})
                                    </span>
                                    <span className="text-xs font-medium text-blue-600">
                                      相似度: {(retrieval.similarity || 0).toFixed(4)}
                                    </span>
                                  </div>
                                  <p className="text-gray-700 text-xs leading-relaxed">
                                    {retrieval.content}
                                  </p>
                                  {retrieval.metadata?.page_number && (
                                    <p className="text-xs text-gray-500 mt-1">
                                      页码: {retrieval.metadata.page_number}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  /* 单标签结果或旧格式 */
                  <div className="p-6 border rounded-lg bg-white">
                    <div className="space-y-4">
                      {Object.entries(extractionResult.result).map(([key, value]) => (
                        <div key={key} className="border-b pb-4 last:border-b-0">
                          <div className="font-semibold text-lg mb-2">{key}</div>
                          <div className="text-gray-700">
                            {Array.isArray(value) ? (
                              <div className="flex flex-wrap gap-2">
                                {value.map((item, idx) => (
                                  <span
                                    key={idx}
                                    className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full"
                                  >
                                    {String(item)}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <div className="p-2 bg-gray-50 rounded">
                                {value !== null && value !== undefined ? String(value) : '未找到'}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {extractionResult.extraction_time && (
                  <p className="text-sm text-gray-500">
                    提取耗时: {typeof extractionResult.extraction_time === 'number'
                      ? extractionResult.extraction_time.toFixed(2)
                      : extractionResult.detailed_time?.total?.toFixed(2) || 'N/A'} 秒
                  </p>
                )}

                {extractionResult.sources && extractionResult.sources.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-lg font-semibold mb-3">来源信息</h3>
                    <div className="space-y-2">
                      {extractionResult.sources.map((source: any, idx: number) => (
                        <div
                          key={idx}
                          className="p-3 bg-gray-50 rounded text-sm"
                        >
                          {source.similarity !== undefined && (
                            <p className="font-medium mb-1">
                              相似度: {source.similarity.toFixed(3)}
                            </p>
                          )}
                          <p className="text-gray-600">{source.content}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!extractionResult && !document?.has_extraction && (
              <div className="text-center py-12 text-gray-500">
                <p>选择标签后点击"开始提取"查看结果</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

