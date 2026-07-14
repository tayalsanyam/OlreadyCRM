import { MuaDetailClient } from "@/components/muas/MuaDetailClient";

export default async function CommissionMuaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <MuaDetailClient
      muaId={id}
      backHref="/commission/muas"
      backLabel="Back to MUA Database"
      showPushToLead={false}
      leadQueueStatus="commissionRm"
      commissionMode
    />
  );
}
