'use client';

import { ReactNode, useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronRight,PanelRightOpen,PanelRightClose } from 'lucide-react';
import PrimarySider from './PrimarySider';
import SecondarySider from './SecondarySider';
import { PageProvider } from './PageContext';

interface MainLayoutProps {
  children: ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [activeMenu, setActiveMenu] = useState('knowledge-extract');
  const [currentKbId, setCurrentKbId] = useState<string | null>(null);
  const [primaryCollapsed, setPrimaryCollapsed] = useState(false);
  const [secondaryCollapsed, setSecondaryCollapsed] = useState(false);

  // 使用 useCallback 稳定 onOpenSidebar 函数引用
  const handleOpenSidebar = useCallback(() => {
    setSecondaryCollapsed(false);
  }, []);

  // 使用 useCallback 稳定 onToggle 函数引用
  const handleToggleSecondary = useCallback(() => {
    setSecondaryCollapsed(prev => !prev);
  }, []);

  useEffect(() => {
    // 根据路径确定激活的菜单
    if (pathname?.startsWith('/knowledge-bases')) {
      setActiveMenu('knowledge-base');
      const kbMatch = pathname.match(/\/knowledge-bases\/([^\/]+)/);
      if (kbMatch) {
        setCurrentKbId(kbMatch[1]);
      } else {
        setCurrentKbId(null);
      }
    } else if (pathname?.startsWith('/tags') || pathname?.startsWith('/extract')) {
      setActiveMenu('knowledge-extract');
    } else if (pathname?.startsWith('/qa')) {
      setActiveMenu('knowledge-qa');
    }
  }, [pathname]);

  // 处理菜单切换时的路由导航
  const handleMenuChange = (menuId: string) => {
    setActiveMenu(menuId);
    
    // 根据菜单切换路由
    if (menuId === 'knowledge-extract') {
      // 如果当前不在知识提取相关页面，导航到标签管理
      if (!pathname?.startsWith('/tags') && !pathname?.startsWith('/extract')) {
        router.push('/tags');
      }
    } else if (menuId === 'knowledge-base') {
      // 如果当前不在知识库相关页面，导航到知识库列表
      if (!pathname?.startsWith('/knowledge-bases')) {
        router.push('/knowledge-bases');
      }
    } else if (menuId === 'knowledge-qa') {
      // 如果当前不在知识问答相关页面，导航到知识问答页面
      if (!pathname?.startsWith('/qa')) {
        router.push('/qa');
      }
    }
  };

  return (
    <div className="min-h-screen flex bg-white">
      <PrimarySider 
        activeMenu={activeMenu} 
        onMenuChange={handleMenuChange}
        collapsed={primaryCollapsed}
        onToggle={() => setPrimaryCollapsed(!primaryCollapsed)}
      />
      <SecondarySider 
        activeMenu={activeMenu} 
        currentKbId={currentKbId}
        collapsed={secondaryCollapsed}
        onToggle={handleToggleSecondary}
      />
      <main className="flex-1 overflow-y-auto bg-white relative">
        <PageProvider 
          secondaryCollapsed={secondaryCollapsed}
          onOpenSidebar={handleOpenSidebar}
        >
          {children}
        </PageProvider>
      </main>
    </div>
  );
}

