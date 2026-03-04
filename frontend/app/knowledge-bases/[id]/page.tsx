import { redirect } from 'next/navigation'

export default function KnowledgeBaseRedirectPage({ params }: { params: { id: string } }) {
  redirect(`/knowledge-bases/${params.id}/documents`)
}
