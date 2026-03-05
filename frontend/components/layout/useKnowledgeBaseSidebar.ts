'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { knowledgeBaseApi } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'

export interface KnowledgeBaseSidebarItem {
  id: string
  name: string
  is_default: boolean
}

export function useKnowledgeBaseSidebar(activeMenu: string, currentKbId: string | null) {
  const router = useRouter()
  const { showToast } = useToast()

  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseSidebarItem[]>([])
  const [inputKeyword, setInputKeyword] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)
  const hoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadKnowledgeBases = useCallback(async (search?: string) => {
    try {
      const response = await knowledgeBaseApi.getAll(search ? { search } : undefined)
      if (response.data.success) {
        setKnowledgeBases(response.data.data.knowledge_bases as KnowledgeBaseSidebarItem[])
      }
    } catch (error) {
      console.error('加载知识库失败:', error)
      showToast({ title: '加载失败', description: '请稍后重试', variant: 'error' })
    }
  }, [showToast])

  useEffect(() => {
    if (activeMenu !== 'knowledge-base')
      return

    const timer = setTimeout(() => {
      const keyword = inputKeyword.trim()
      loadKnowledgeBases(keyword || undefined)
    }, 250)

    return () => clearTimeout(timer)
  }, [activeMenu, inputKeyword, loadKnowledgeBases])

  useEffect(() => {
    return () => {
      if (hoverCloseTimerRef.current)
        clearTimeout(hoverCloseTimerRef.current)
    }
  }, [])

  const handleSearch = useCallback(async () => {
    const keyword = inputKeyword.trim()
    await loadKnowledgeBases(keyword || undefined)
  }, [inputKeyword, loadKnowledgeBases])

  const handleCreate = useCallback(async () => {
    const name = inputKeyword.trim()
    if (!name) {
      showToast({ title: '请输入知识库名称', variant: 'info' })
      return
    }

    const exactMatch = knowledgeBases.find(kb => kb.name.trim().toLowerCase() === name.toLowerCase())
    if (exactMatch) {
      router.push(`/knowledge-bases/${exactMatch.id}/documents`)
      return
    }

    try {
      await knowledgeBaseApi.create({ name })
      setInputKeyword('')
      await loadKnowledgeBases()
      showToast({ title: '创建成功', variant: 'success' })
    } catch (error: any) {
      console.error('创建知识库失败:', error)
      showToast({
        title: '创建失败',
        description: error?.response?.data?.detail || '请稍后重试',
        variant: 'error',
      })
    }
  }, [inputKeyword, knowledgeBases, loadKnowledgeBases, router, showToast])

  const startRename = useCallback((kb: KnowledgeBaseSidebarItem) => {
    if (hoverCloseTimerRef.current) {
      clearTimeout(hoverCloseTimerRef.current)
      hoverCloseTimerRef.current = null
    }
    setEditingId(kb.id)
    setEditingName(kb.name)
  }, [])

  const cancelRename = useCallback(() => {
    setEditingId(null)
    setEditingName('')
  }, [])

  const saveRename = useCallback(async (id: string) => {
    if (!editingName.trim()) {
      showToast({ title: '知识库名称不能为空', variant: 'info' })
      return
    }

    try {
      await knowledgeBaseApi.update(id, { name: editingName.trim() })
      setEditingId(null)
      setEditingName('')
      await loadKnowledgeBases(inputKeyword.trim() || undefined)
      showToast({ title: '重命名成功', variant: 'success' })
    } catch (error: any) {
      console.error('重命名失败:', error)
      showToast({
        title: '重命名失败',
        description: error?.response?.data?.detail || '请稍后重试',
        variant: 'error',
      })
      setEditingName('')
    }
  }, [editingName, inputKeyword, loadKnowledgeBases, showToast])

  const deleteKnowledgeBase = useCallback(async (id: string) => {
    try {
      await knowledgeBaseApi.delete(id)
      setShowDeleteConfirm(null)
      await loadKnowledgeBases(inputKeyword.trim() || undefined)
      if (currentKbId === id)
        router.push('/knowledge-bases')
      showToast({ title: '删除成功', variant: 'success' })
    } catch (error: any) {
      console.error('删除知识库失败:', error)
      showToast({
        title: '删除失败',
        description: error?.response?.data?.detail || '请稍后重试',
        variant: 'error',
      })
      setShowDeleteConfirm(null)
    }
  }, [currentKbId, inputKeyword, loadKnowledgeBases, router, showToast])

  return {
    knowledgeBases,
    inputKeyword,
    setInputKeyword,

    editingId,
    editingName,
    setEditingName,
    startRename,
    cancelRename,
    saveRename,

    showDeleteConfirm,
    setShowDeleteConfirm,
    deleteKnowledgeBase,

    handleSearch,
    handleCreate,

    hoverCloseTimerRef,
  }
}

