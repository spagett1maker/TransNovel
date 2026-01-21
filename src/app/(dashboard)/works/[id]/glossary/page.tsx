import { redirect } from "next/navigation";

interface GlossaryPageProps {
  params: Promise<{ id: string }>;
}

export default async function GlossaryPage({ params }: GlossaryPageProps) {
  const { id } = await params;

  // 설정집 용어 탭으로 리다이렉트
  redirect(`/works/${id}/setting-bible?tab=terms`);
}
