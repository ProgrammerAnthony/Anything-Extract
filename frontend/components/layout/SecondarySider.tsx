'use client';

import { useState, useEffect, useRef, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Tag, Search, FolderOpen, Edit2, Trash2, Check, X, ChevronLeft,PanelRightOpen, ChevronRight, ChevronLeftIcon } from 'lucide-react';
import { knowledgeBaseApi } from '@/lib/api';

// 可复用的二级侧边栏顶部组件
interface SecondarySiderHeaderProps {
  title?: string;
  collapsed: boolean;
  onToggle: () => void;
}

function SecondarySiderHeader({ title, collapsed, onToggle }: SecondarySiderHeaderProps) {
  if (collapsed) return null;
  
  return (
    <div className="relative h-16 flex items-center justify-center px-4 border-b border-gray-200">
      {title && <h2 className="text-gray-800 text-sm font-medium">{title}</h2>}
      {/* Toggle Button - 放在右上角，与标题居中对齐 */}
      <button
        onClick={onToggle}
        className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-6 h-6 bg-white border border-gray-300 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-colors shadow-sm"
      >
        <PanelRightOpen size={20} />
      </button>
    </div>
  );
}

interface KnowledgeBase {
  id: string;
  name: string;
  is_default: boolean;
}

interface SecondarySiderProps {
  activeMenu: string;
  currentKbId?: string | null;
  collapsed: boolean;
  onToggle: () => void;
}

export default function SecondarySider({ activeMenu, currentKbId, collapsed, onToggle }: SecondarySiderProps) {
  const router = useRouter();
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [inputKeyword, setInputKeyword] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [hoveredKbId, setHoveredKbId] = useState<string | null>(null);
  const [hoverMenuPosition, setHoverMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const hoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (activeMenu !== 'knowledge-base') {
      return;
    }

    const timer = setTimeout(() => {
      const keyword = inputKeyword.trim();
      loadKnowledgeBases(keyword || undefined);
    }, 250);

    return () => clearTimeout(timer);
  }, [activeMenu, inputKeyword]);

  const loadKnowledgeBases = async (search?: string) => {
    try {
      const response = await knowledgeBaseApi.getAll(search ? { search } : undefined);
      if (response.data.success) {
        setKnowledgeBases(response.data.data.knowledge_bases);
      }
    } catch (error) {
      console.error('加载知识库失败:', error);
    }
  };

  const handleSearch = async () => {
    const keyword = inputKeyword.trim();
    await loadKnowledgeBases(keyword || undefined);
  };

  const handleCreate = async () => {
    const name = inputKeyword.trim();
    if (!name) {
      alert('请输入知识库名称');
      return;
    }

    const exactMatch = knowledgeBases.find(
      (kb) => kb.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (exactMatch) {
      router.push(`/knowledge-bases/${exactMatch.id}`);
      return;
    }

    try {
      await knowledgeBaseApi.create({ name });
      setInputKeyword('');
      loadKnowledgeBases();
    } catch (error: any) {
      console.error('创建知识库失败:', error);
      alert(error.response?.data?.detail || '创建失败');
    }
  };

  const handleRename = (kb: KnowledgeBase) => {
    if (hoverCloseTimerRef.current) {
      clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
    setEditingId(kb.id);
    setEditingName(kb.name);
    setHoveredKbId(null);
    setHoverMenuPosition(null);
  };

  const handleHoverMenuOpen = (e: MouseEvent<HTMLDivElement>, kbId: string) => {
    if (hoverCloseTimerRef.current) {
      clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setHoveredKbId(kbId);
    setHoverMenuPosition({
      top: rect.top,
      left: rect.right + 8,
    });
  };

  const handleHoverMenuClose = () => {
    setHoveredKbId(null);
    setHoverMenuPosition(null);
  };

  const scheduleHoverMenuClose = () => {
    if (hoverCloseTimerRef.current) {
      clearTimeout(hoverCloseTimerRef.current);
    }
    hoverCloseTimerRef.current = setTimeout(() => {
      handleHoverMenuClose();
      hoverCloseTimerRef.current = null;
    }, 120);
  };

  useEffect(() => {
    return () => {
      if (hoverCloseTimerRef.current) {
        clearTimeout(hoverCloseTimerRef.current);
      }
    };
  }, []);

  const handleSaveRename = async (id: string) => {
    if (!editingName.trim()) {
      alert('知识库名称不能为空');
      return;
    }

    try {
      await knowledgeBaseApi.update(id, { name: editingName.trim() });
      setEditingId(null);
      setEditingName('');
      loadKnowledgeBases(inputKeyword.trim() || undefined);
    } catch (error: any) {
      console.error('重命名失败:', error);
      alert(error.response?.data?.detail || '重命名失败');
      setEditingName('');
    }
  };

  const handleCancelRename = () => {
    setEditingId(null);
    setEditingName('');
  };

  const handleDelete = async (id: string) => {
    try {
      await knowledgeBaseApi.delete(id);
      setShowDeleteConfirm(null);
      if (hoverCloseTimerRef.current) {
        clearTimeout(hoverCloseTimerRef.current);
        hoverCloseTimerRef.current = null;
      }
      setHoverMenuPosition(null);
      loadKnowledgeBases(inputKeyword.trim() || undefined);
      if (currentKbId === id) {
        router.push('/knowledge-bases');
      }
    } catch (error: any) {
      console.error('删除知识库失败:', error);
      alert(error.response?.data?.detail || '删除失败');
      setShowDeleteConfirm(null);
    }
  };

  if (activeMenu === 'knowledge-extract') {
    return (
      <div className={`
        relative bg-white h-screen flex flex-col border-r border-gray-200
        transition-all duration-200 ease-in-out
        ${collapsed ? 'w-0 overflow-hidden' : 'w-[280px]'}
      `}>
        {/* 顶部标题栏（留空） */}
        <SecondarySiderHeader collapsed={collapsed} onToggle={onToggle} />
        
        <div className="flex-1 overflow-y-auto py-5 px-3">
          <Link
            href="/tags"
            className={`
              block h-10 rounded-lg flex items-center px-3 mb-2
              ${collapsed ? 'justify-center' : ''}
              bg-gray-50 text-gray-700 hover:bg-gray-100 transition-colors
            `}
            title={collapsed ? '标签管理' : ''}
          >
            <Tag size={16} className={collapsed ? '' : 'mr-3'} />
            {!collapsed && <span className="text-sm">标签管理</span>}
          </Link>
          <Link
            href="/extract"
            className={`
              block h-10 rounded-lg flex items-center px-3 mb-2
              ${collapsed ? 'justify-center' : ''}
              bg-gray-50 text-gray-700 hover:bg-gray-100 transition-colors
            `}
            title={collapsed ? '信息提取' : ''}
          >
            <Search size={16} className={collapsed ? '' : 'mr-3'} />
            {!collapsed && <span className="text-sm">信息提取</span>}
          </Link>
        </div>
      </div>
    );
  }

  if (activeMenu === 'knowledge-base') {
    return (
      <>
        <div className={`
          relative bg-white h-screen flex flex-col border-r border-gray-200
          transition-all duration-200 ease-in-out
          ${collapsed ? 'w-0 overflow-hidden' : 'w-[280px]'}
        `}>
          {/* 顶部标题栏 */}
          <SecondarySiderHeader title="知识库列表" collapsed={collapsed} onToggle={onToggle} />

          {/* 搜索/新建共用输入框 */}
          {!collapsed && (
            <div className="px-3 py-4 border-b border-gray-200">
              <div className="relative flex items-center bg-white border border-gray-300 rounded-lg overflow-visible">
                <button
                  onClick={handleSearch}
                  className="absolute left-2 p-1 text-gray-400 hover:text-gray-600 z-10"
                  title="搜索"
                >
                  <Search size={16} />
                </button>
                <input
                  type="text"
                  value={inputKeyword}
                  onChange={(e) => setInputKeyword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate();
                  }}
                  placeholder="输入名称可实时检索，回车可新建"
                  className="flex-1 pl-10 pr-16 py-2 text-sm text-gray-800 bg-transparent border-0 outline-none placeholder:text-gray-400"
                />
                <button
                  onClick={handleCreate}
                  className="absolute right-1 px-3 py-1.5 bg-white text-[#5a47e5] text-sm rounded hover:bg-gray-50 transition-colors z-10 border-0"
                  style={{ minWidth: '48px', height: '24px', lineHeight: '24px' }}
                >
                  新建
                </button>
              </div>
            </div>
          )}

          {/* 知识库列表 */}
          {!collapsed && (
            <div className="flex-1 overflow-y-auto py-4 px-3">
              {knowledgeBases.length > 0 ? (
                knowledgeBases.map((kb) => (
                <div
                  key={kb.id}
                  className="relative mb-4"
                  onMouseEnter={(e) => !collapsed && handleHoverMenuOpen(e, kb.id)}
                  onMouseLeave={scheduleHoverMenuClose}
                >
                  <div
                    className={`
                      ${collapsed ? 'w-12 h-12' : 'w-[232px] h-12'} mx-auto rounded-lg cursor-pointer transition-all duration-200
                      ${currentKbId === kb.id ? 'border-2 border-[#5a47e5]' : 'border border-transparent'}
                      ${editingId === kb.id ? 'bg-gray-100' : 'bg-gradient-to-r from-[#7b5ef2] to-[#c383fe]'}
                    `}
                    onClick={() => !editingId && router.push(`/knowledge-bases/${kb.id}`)}
                    title={collapsed ? kb.name : ''}
                  >
                    {editingId === kb.id ? (
                      <div className="flex items-center h-full px-3">
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRename(kb.id);
                            if (e.key === 'Escape') handleCancelRename();
                          }}
                          className="flex-1 px-2 py-1 text-sm text-gray-800 bg-white border border-[#7261e9] rounded outline-none"
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSaveRename(kb.id);
                          }}
                          className="ml-2 p-1 text-green-600 hover:text-green-700"
                        >
                          <Check size={16} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCancelRename();
                          }}
                          className="ml-1 p-1 text-red-600 hover:text-red-700"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <div className={`
                        flex items-center h-full
                        ${collapsed ? 'justify-center' : 'px-3'}
                      `}>
                        <FolderOpen size={16} className={`${collapsed ? '' : 'mr-2'} text-white flex-shrink-0`} />
                        {!collapsed && (
                          <>
                            <span className="flex-1 text-sm text-white truncate">{kb.name}</span>
                            {kb.is_default && (
                              <span className="text-xs text-white/70 ml-2">默认</span>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 悬停菜单：重命名/删除 */}
                  {!collapsed && hoveredKbId === kb.id && !editingId && (
                    <div
                      className="fixed z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg py-2 min-w-[100px]"
                      style={{
                        top: hoverMenuPosition?.top,
                        left: hoverMenuPosition?.left,
                      }}
                      onMouseEnter={() => {
                        if (hoverCloseTimerRef.current) {
                          clearTimeout(hoverCloseTimerRef.current);
                          hoverCloseTimerRef.current = null;
                        }
                        setHoveredKbId(kb.id);
                      }}
                      onMouseLeave={scheduleHoverMenuClose}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => handleRename(kb)}
                        className="w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                      >
                        <Edit2 size={14} />
                        <span>重命名</span>
                      </button>
                      <button
                        onClick={() => {
                          setShowDeleteConfirm(kb.id);
                          handleHoverMenuClose();
                        }}
                        className="w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                      >
                        <Trash2 size={14} />
                        <span>删除</span>
                      </button>
                    </div>
                  )}
                </div>
              ))
              ) : (
                <div className="text-center py-8 text-gray-500 text-sm">
                  暂无知识库
                </div>
              )}
            </div>
          )}
        </div>

        {/* 删除确认对话框 */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-md mx-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                  <span className="text-orange-500 text-xl">!</span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">确认删除该知识库？</h3>
                  <p className="text-sm text-gray-500 mt-1">删除后无法恢复</p>
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(null)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={() => handleDelete(showDeleteConfirm)}
                  className="px-4 py-2 bg-[#5147e5] text-white rounded hover:bg-[#4338ca] transition-colors"
                >
                  确定
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  if (activeMenu === 'knowledge-qa') {
    return (
      <div className={`
        relative bg-white h-screen flex flex-col border-r border-gray-200
        transition-all duration-200 ease-in-out
        ${collapsed ? 'w-0 overflow-hidden' : 'w-[280px]'}
      `}>
        {/* 顶部标题栏（留空） */}
        <SecondarySiderHeader collapsed={collapsed} onToggle={onToggle} />
        
        <div className="flex-1 overflow-y-auto py-5 px-3">
          {!collapsed && (
            <div className="text-center py-8 text-gray-500 text-sm">
              功能开发中...
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}

