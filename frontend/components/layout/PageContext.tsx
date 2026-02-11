'use client';

import { createContext, useContext, ReactNode, useMemo } from 'react';

interface PageContextType {
  secondaryCollapsed: boolean;
  onOpenSidebar: () => void;
}

const PageContext = createContext<PageContextType | undefined>(undefined);

export function PageProvider({ 
  children, 
  secondaryCollapsed, 
  onOpenSidebar 
}: { 
  children: ReactNode;
  secondaryCollapsed: boolean;
  onOpenSidebar: () => void;
}) {
  // 使用 useMemo 确保 value 对象稳定，避免不必要的重新渲染
  const value = useMemo(() => ({
    secondaryCollapsed,
    onOpenSidebar
  }), [secondaryCollapsed, onOpenSidebar]);

  return (
    <PageContext.Provider value={value}>
      {children}
    </PageContext.Provider>
  );
}

export function usePageContext() {
  const context = useContext(PageContext);
  if (context === undefined) {
    throw new Error('usePageContext must be used within a PageProvider');
  }
  return context;
}

