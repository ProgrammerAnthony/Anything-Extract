'use client';

import { useState, useRef, useEffect } from 'react';
import { MoreVertical, Edit2, Trash2 } from 'lucide-react';
import Link from 'next/link';

interface Tag {
  id: string;
  name: string;
  type: 'single_choice' | 'multiple_choice' | 'text_input';
  description?: string;
  options?: string[];
  required: boolean;
  created_at?: string;
}

interface TagCardProps {
  tag: Tag;
  onDelete: (id: string) => void;
}

export default function TagCard({ tag, onDelete }: TagCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu]);

  const typeColors = {
    single_choice: 'bg-blue-50 text-blue-700 border-blue-200',
    multiple_choice: 'bg-purple-50 text-purple-700 border-purple-200',
    text_input: 'bg-green-50 text-green-700 border-green-200',
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  return (
    <div className="relative bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg hover:-translate-y-1 transition-all duration-200 flex flex-col cursor-pointer h-[250px]">
      {/* 顶部信息 - 参考BotList样式 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* 图标 */}
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#7b5ef2] to-[#c383fe] flex items-center justify-center flex-shrink-0">
            <span className="text-white text-sm font-bold">T</span>
          </div>
          <h3 className="text-lg font-semibold text-gray-800 truncate flex-1">{tag.name}</h3>
        </div>
        
        {/* 更多操作按钮 */}
        <div className="relative flex-shrink-0" ref={menuRef}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <MoreVertical size={20} className="text-gray-600" />
          </button>
          
          {/* 下拉菜单 */}
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 w-32 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
              <Link
                href={`/tags/${tag.id}/edit`}
                onClick={() => setShowMenu(false)}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Edit2 size={16} />
                <span>编辑</span>
              </Link>
              <button
                onClick={() => {
                  setShowMenu(false);
                  onDelete(tag.id);
                }}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <Trash2 size={16} />
                <span>删除</span>
              </button>
            </div>
          )}
        </div>
      </div>
      
      {/* 标签类型 */}
      <div className="mb-2">
        <span className={`inline-block px-2 py-1 text-xs font-medium rounded border ${
          tag.type === 'single_choice' ? 'bg-blue-50 text-blue-700 border-blue-200' :
          tag.type === 'multiple_choice' ? 'bg-purple-50 text-purple-700 border-purple-200' :
          'bg-green-50 text-green-700 border-green-200'
        }`}>
          {tag.type === 'single_choice' ? '单选' : tag.type === 'multiple_choice' ? '多选' : '填空'}
        </span>
      </div>

      {/* 描述 - 参考BotList的intro样式 */}
      <div className="flex-1 mb-3 min-h-[38px]">
        <p className="text-sm text-gray-600 line-clamp-2 leading-5">
          {tag.description || tag.name}
        </p>
      </div>

      {/* 可选项 */}
      {tag.options && tag.options.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-gray-500 mb-1">可选项:</p>
          <div className="flex flex-wrap gap-1">
            {tag.options.slice(0, 3).map((option, idx) => (
              <span key={idx} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded">
                {option}
              </span>
            ))}
            {tag.options.length > 3 && (
              <span className="px-2 py-0.5 text-xs text-gray-500">
                +{tag.options.length - 3}
              </span>
            )}
          </div>
        </div>
      )}

      {/* 底部时间 - 参考BotList的time样式 */}
      <div className="mt-auto">
        <p className="text-xs text-gray-500">
          {tag.created_at ? `最近编辑 ${formatDate(tag.created_at)}` : ''}
        </p>
      </div>
    </div>
  );
}

