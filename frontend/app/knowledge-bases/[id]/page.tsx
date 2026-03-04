import { redirect } from 'next/navigation'

/** [id] 入口：直接重定向到该知识库的文档列表。 */
export default function KnowledgeBaseRedirectPage({ params }: { params: { id: string } }) {
  redirect(`/knowledge-bases/${params.id}/documents`)
}
