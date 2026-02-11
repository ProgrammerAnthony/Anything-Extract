'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, FileText, MessageSquare } from 'lucide-react';

interface PrimaryMenuItem {
  id: string;
  name: string;
  icon: React.ReactNode;
}

const primaryMenuItems: PrimaryMenuItem[] = [
  {
    id: 'knowledge-extract',
    name: '知识提取',
    icon: <FileText size={16} />,
  },
  {
    id: 'knowledge-base',
    name: '知识库管理',
    icon: <MessageSquare size={16} />,
  },
  {
    id: 'knowledge-qa',
    name: '知识问答',
    icon: <MessageSquare size={16} />,
  },
];

interface PrimarySiderProps {
  activeMenu: string;
  onMenuChange: (menuId: string) => void;
  collapsed: boolean;
  onToggle: () => void;
}

export default function PrimarySider({ activeMenu, onMenuChange, collapsed, onToggle }: PrimarySiderProps) {
  return (
    <div className={`
      relative bg-[#26293b] h-screen flex flex-col border-r border-[#333647]
      transition-all duration-300
      ${collapsed ? 'w-16' : 'w-[200px]'}
    `}>
      {/* Logo */}
      <div className="h-16 flex items-center justify-center border-b border-[#333647] px-3">
        {!collapsed && (
          <div className="flex items-center gap-2 flex-1">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#7b5ef2] to-[#c383fe] flex items-center justify-center">
              <span className="text-white text-sm font-bold">A</span>
            </div>
            <span className="text-white text-sm font-semibold">AnythingExtract</span>
          </div>
        )}
        {collapsed && (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#7b5ef2] to-[#c383fe] flex items-center justify-center">
            <span className="text-white text-sm font-bold">A</span>
          </div>
        )}
      </div>

      {/* Toggle Button */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-20 z-10 w-6 h-6 bg-[#333647] rounded-full flex items-center justify-center text-white hover:bg-[#3d4052] transition-colors shadow-md"
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {/* Menu Items */}
      <div className="flex-1 py-4">
        {primaryMenuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onMenuChange(item.id)}
            className={`
              w-full h-12 flex items-center mb-2 px-3
              transition-all duration-200
              ${
                activeMenu === item.id
                  ? 'bg-[#333647] text-white'
                  : 'text-[#999999] hover:text-white hover:bg-[#333647]'
              }
            `}
            title={collapsed ? item.name : ''}
          >
            <span className="flex-shrink-0">{item.icon}</span>
            {!collapsed && (
              <span className="ml-3 text-sm whitespace-nowrap">{item.name}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

