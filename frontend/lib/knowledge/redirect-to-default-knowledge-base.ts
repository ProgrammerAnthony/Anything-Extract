import { knowledgeBaseApi } from '@/lib/api'

interface KnowledgeBaseLite {
  id: string
  is_default: boolean
}

/**
 * 加载知识库列表，并在存在知识库且当前位于列表路由时重定向到默认/第一个知识库。
 * 返回值表示是否执行了重定向。
 */
export async function redirectToDefaultKnowledgeBase(
  currentPath: string | null,
  push: (path: string) => void,
) {
  const response = await knowledgeBaseApi.getAll({ page: 1, limit: 50 })
  if (!response.data.success)
    return false

  const kbs = response.data.data.knowledge_bases as KnowledgeBaseLite[]
  if (kbs.length === 0 || currentPath !== '/knowledge-bases')
    return false

  const defaultKb = kbs.find(kb => kb.is_default) || kbs[0]
  push(`/knowledge-bases/${defaultKb.id}/documents`)
  return true
}

