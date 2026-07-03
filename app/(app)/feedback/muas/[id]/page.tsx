import { MuaDetailClient } from "@/components/muas/MuaDetailClient";

export default async function FeedbackMuaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <MuaDetailClient
      muaId={id}
      backHref="/feedback/muas"
      backLabel="Back to MUA Database"
      showPushToLead={false}
      showCreateCareTicket
    />
  );
}
