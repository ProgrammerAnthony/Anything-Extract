'use client';

import { useState, useEffect } from 'react';
import { extractApi, tagApi, documentApi, knowledgeBaseApi } from '@/lib/api';
import Link from 'next/link';
import PageHeader from '@/components/layout/PageHeader';
import { usePageContext } from '@/components/layout/PageContext';

interface Tag {
  id: string;
  name: string;
  type: string;
  description?: string;
  options?: string[];
}

interface Document {
  id: string;
  filename: string;
  status: string;
}

interface KnowledgeBase {
  id: string;
  name: string;
  is_default: boolean;
}

export default function ExtractPage() {
  const { secondaryCollapsed, onOpenSidebar } = usePageContext();
  const [tags, setTags] = useState<Tag[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedKbId, setSelectedKbId] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedDocId, setSelectedDocId] = useState('');
  const [retrievalMethod, setRetrievalMethod] = useState('basic');
  const [extracting, setExtracting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [extractionLogs, setExtractionLogs] = useState<string[]>([]);
  const [currentStage, setCurrentStage] = useState<string>('');

  useEffect(() => {
    loadTags();
    loadKnowledgeBases();
  }, []);

  useEffect(() => {
    if (selectedKbId) {
      loadDocuments();
    } else {
      setDocuments([]);
      setSelectedDocId('');
    }
  }, [selectedKbId]);

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

  const loadKnowledgeBases = async () => {
    try {
      const response = await knowledgeBaseApi.getAll();
      if (response.data.success) {
        const kbs = response.data.data.knowledge_bases;
        setKnowledgeBases(kbs);
        // 如果有默认知识库，自动选择
        const defaultKb = kbs.find((kb: KnowledgeBase) => kb.is_default);
        if (defaultKb) {
          setSelectedKbId(defaultKb.id);
        } else if (kbs.length > 0) {
          setSelectedKbId(kbs[0].id);
        }
      }
    } catch (error) {
      console.error('加载知识库失败:', error);
    }
  };

  const loadDocuments = async () => {
    if (!selectedKbId) return;
    
    try {
      const response = await documentApi.getAll({ 
        status: 'completed',
        knowledge_base_id: selectedKbId
      });
      if (response.data.success) {
        setDocuments(response.data.data.documents);
        // 如果当前选择的文档不在新列表中，清空选择
        if (selectedDocId && !response.data.data.documents.find((doc: Document) => doc.id === selectedDocId)) {
          setSelectedDocId('');
        }
      }
    } catch (error) {
      console.error('加载文档失败:', error);
    }
  };

  const handleExtract = async () => {
    if (selectedTagIds.length === 0 || !selectedKbId || !selectedDocId) {
      alert('请至少选择一个标签、知识库和文档');
      return;
    }

    setExtracting(true);
    setResult(null);
    setExtractionLogs([]);
    setCurrentStage('');

    try {
      // 统一使用多标签提取接口（无论是单个还是多个标签）
      const response = await extractApi.multiTagExtract({
        tag_config_ids: selectedTagIds,
        document_id: selectedDocId,
        retrieval_method: retrievalMethod,
        top_k: 5,
      });

      if (response.data.success) {
        setResult(response.data.data);
        setExtractionLogs(['提取完成']);
      } else {
        throw new Error(response.data.message || '提取失败');
      }
    } catch (error: any) {
      console.error('提取失败:', error);
      setExtractionLogs(prev => [...prev, `错误: ${error.message || '提取失败'}`]);
      alert(error.message || '提取失败');
    } finally {
      setExtracting(false);
      setCurrentStage('');
    }
  };

  const toggleTag = (tagId: string) => {
    setSelectedTagIds(prev => 
      prev.includes(tagId)
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    );
  };

  return (
    <div className="h-full flex flex-col bg-[#f3f6fd]">
      {/* 顶部标题栏 */}
      <PageHeader 
        title="信息提取" 
        secondaryCollapsed={secondaryCollapsed}
        onOpenSidebar={onOpenSidebar}
      />

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Panel - Configuration */}
          <div className="space-y-6">
            {/* Tags Selection */}
            <div className="bg-white p-5 rounded-lg border border-gray-200">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                选择标签配置（可多选）
              </label>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {tags.map((tag) => {
                  const isSelected = selectedTagIds.includes(tag.id);
                  return (
                    <label
                      key={tag.id}
                      className={`
                        flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors
                        ${isSelected ? 'bg-[#f0f0ff] border border-[#5147e5]' : 'bg-gray-50 hover:bg-gray-100 border border-transparent'}
                      `}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleTag(tag.id)}
                        className="mt-1 w-4 h-4 text-[#5147e5] border-gray-300 rounded focus:ring-[#5147e5]"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-gray-800">{tag.name}</div>
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
                          <div className="text-xs text-gray-600 mt-1">
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
                  );
                })}
              </div>
              {tags.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <p className="mb-2">还没有标签配置</p>
                  <Link
                    href="/tags/new"
                    className="text-[#5147e5] hover:text-[#4338ca] text-sm font-medium"
                  >
                    创建标签 →
                  </Link>
                </div>
              )}
            </div>

            {/* Knowledge Base Selection */}
            <div className="bg-white p-5 rounded-lg border border-gray-200">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                选择知识库
              </label>
              <select
                value={selectedKbId}
                onChange={(e) => {
                  setSelectedKbId(e.target.value);
                  setSelectedDocId(''); // 清空文档选择
                }}
                className="w-full p-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#5147e5] focus:border-transparent"
              >
                <option value="">请选择知识库</option>
                {knowledgeBases.map((kb) => (
                  <option key={kb.id} value={kb.id}>
                    {kb.name} {kb.is_default ? '(默认)' : ''}
                  </option>
                ))}
              </select>
              {knowledgeBases.length === 0 && (
                <p className="text-sm text-gray-500 mt-2">
                  没有可用的知识库，请先创建知识库
                </p>
              )}
            </div>

            {/* Document Selection */}
            <div className="bg-white p-5 rounded-lg border border-gray-200">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                选择文档
              </label>
              <select
                value={selectedDocId}
                onChange={(e) => setSelectedDocId(e.target.value)}
                disabled={!selectedKbId}
                className="w-full p-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#5147e5] focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                <option value="">{selectedKbId ? '请选择文档' : '请先选择知识库'}</option>
                {documents.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.filename}
                  </option>
                ))}
              </select>
              {selectedKbId && documents.length === 0 && (
                <p className="text-sm text-gray-500 mt-2">
                  该知识库中没有可用的文档，请先上传文档
                </p>
              )}
              {!selectedKbId && (
                <p className="text-sm text-gray-500 mt-2">
                  请先选择知识库
                </p>
              )}
            </div>

            {/* Retrieval Method */}
            <div className="bg-white p-5 rounded-lg border border-gray-200">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                检索方法
              </label>
              <select
                value={retrievalMethod}
                onChange={(e) => setRetrievalMethod(e.target.value)}
                className="w-full p-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#5147e5] focus:border-transparent"
              >
                <option value="basic">基础检索</option>
                <option value="multi_query">Multi-Query</option>
                <option value="hyde">HyDE</option>
                <option value="parent_document">Parent Document</option>
                <option value="rerank">RERANK</option>
                <option value="bm25">BM25</option>
              </select>
            </div>

            {/* Extract Button */}
            <button
              onClick={handleExtract}
              disabled={extracting || selectedTagIds.length === 0 || !selectedKbId || !selectedDocId}
              className="w-full px-4 py-3 bg-[#5147e5] text-white rounded-lg hover:bg-[#4338ca] disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {extracting ? '提取中...' : '开始提取'}
            </button>
          </div>

          {/* Right Panel - Results */}
          <div>
            {/* Extraction Logs */}
            {(extracting || extractionLogs.length > 0) && (
              <div className="bg-white p-6 rounded-lg border border-gray-200 mb-6">
                <h2 className="text-xl font-semibold text-gray-800 mb-4">
                  提取过程 {extracting && <span className="text-sm text-gray-500">(进行中...)</span>}
                </h2>
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 max-h-64 overflow-y-auto">
                  {extractionLogs.length === 0 ? (
                    <p className="text-sm text-gray-500">等待开始...</p>
                  ) : (
                    <div className="space-y-1">
                      {extractionLogs.map((log, idx) => (
                        <div key={idx} className="text-sm text-gray-700 font-mono">
                          {log}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {currentStage && (
                  <div className="mt-3 text-sm text-[#5147e5]">
                    当前阶段: {currentStage}
                  </div>
                )}
              </div>
            )}

            {result ? (
              <div className="bg-white p-6 rounded-lg border border-gray-200">
                <h2 className="text-xl font-semibold text-gray-800 mb-4">提取结果</h2>
                
                {/* 多标签结果 - 按标签分组展示 */}
                {result.tag_results ? (
                  <div className="space-y-6">
                    {Object.values(result.tag_results).map((tagResult: any, tagIdx: number) => (
                      <div key={tagResult.tag_id || tagIdx} className="border border-gray-200 rounded-lg p-4">
                        <h3 className="text-lg font-semibold text-gray-800 mb-3">
                          标签: {tagResult.tag_name}
                        </h3>
                        
                        {/* 提取结果值 */}
                        <div className="mb-4">
                          <h4 className="text-sm font-medium text-gray-700 mb-2">提取结果</h4>
                          <div className="bg-gray-50 p-3 rounded border border-gray-200">
                            {Array.isArray(tagResult.result) ? (
                              <div className="flex flex-wrap gap-2">
                                {tagResult.result.map((item: any, idx: number) => (
                                  <span
                                    key={idx}
                                    className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
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
                                  className="p-3 bg-gray-50 rounded border border-gray-200 text-sm"
                                >
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-medium text-gray-500">
                                      Chunk {idx + 1} ({retrieval.chunk_id})
                                    </span>
                                    <span className="text-xs font-medium text-[#5147e5]">
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
                  <>
                    <div className="mb-6">
                      <h3 className="text-sm font-medium text-gray-700 mb-2">结构化数据</h3>
                      <pre className="bg-gray-50 p-4 rounded-lg overflow-auto text-sm border border-gray-200">
                        {JSON.stringify(result.result, null, 2)}
                      </pre>
                    </div>

                    {result.sources && result.sources.length > 0 && (
                      <div className="mb-4">
                        <h3 className="text-sm font-medium text-gray-700 mb-3">来源信息</h3>
                        <div className="space-y-3">
                          {result.sources.map((source: any, idx: number) => (
                            <div
                              key={idx}
                              className="p-4 bg-gray-50 rounded-lg border border-gray-200"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-medium text-gray-500">来源 {idx + 1}</span>
                                <span className="text-xs font-medium text-[#5147e5]">
                                  相似度: {(source.similarity || 0).toFixed(3)}
                                </span>
                              </div>
                              <p className="text-sm text-gray-700 leading-relaxed">{source.content}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Extraction Time */}
                {result.extraction_time && (
                  <div className="pt-4 border-t border-gray-200 mt-4">
                    <p className="text-sm text-gray-500">
                      提取耗时: <span className="font-medium">
                        {typeof result.extraction_time === 'number' 
                          ? result.extraction_time.toFixed(2) 
                          : result.detailed_time?.total?.toFixed(2) || 'N/A'}
                      </span> 秒
                    </p>
                    {result.detailed_time && (
                      <div className="text-xs text-gray-400 mt-1">
                        检索: {result.detailed_time.retrieval?.toFixed(2)}s | 
                        LLM: {result.detailed_time.llm?.toFixed(2)}s | 
                        解析: {result.detailed_time.parse?.toFixed(2)}s
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white p-12 rounded-lg border border-gray-200 text-center">
                <div className="text-gray-400 mb-2">
                  <svg className="mx-auto" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M21 12c-1 0-3-1-3-3s2-3 3-3 3 1 3 3-2 3-3 3z" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M3 12c1 0 3-1 3-3s-2-3-3-3-3 1-3 3 2 3 3 3z" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M12 21c0-1-1-3-3-3s-3 2-3 3 1 3 3 3 3-2 3-3z" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M12 3c0 1 1 3 3 3s3-2 3-3-1-3-3-3-3 2-3 3z" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <p className="text-gray-500">提取结果将显示在这里</p>
              </div>
            )}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}

