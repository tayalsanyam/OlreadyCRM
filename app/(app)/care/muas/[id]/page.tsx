import { MuaDetailClient } from "@/components/muas/MuaDetailClient";

export default async function CareMuaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <MuaDetailClient
      muaId={id}
      backHref="/care/muas"
      backLabel="Back to MUA Lookup"
      showPushToLead={false}
      commissionMode
      showCareTickets
    />
  );
}
