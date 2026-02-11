'use client';

import { PanelRightClose } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  secondaryCollapsed: boolean;
  onOpenSidebar: () => void;
}

export default function PageHeader({ title, secondaryCollapsed, onOpenSidebar }: PageHeaderProps) {
  return (
    <div className="h-16 flex items-center gap-3 px-6 border-b border-gray-200 bg-white">
      {secondaryCollapsed && (
        <button
          onClick={onOpenSidebar}
          className="p-2 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 transition-all duration-200 ease-in-out flex items-center gap-2 text-gray-700"
        >
          <PanelRightClose size={18} />
          <span className="text-sm">打开侧边栏</span>
        </button>
      )}
      <h1 className="text-xl font-semibold text-gray-800">{title}</h1>
    </div>
  );
}

