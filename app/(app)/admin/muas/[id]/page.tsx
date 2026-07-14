import { MuaDetailClient } from "@/components/muas/MuaDetailClient";

export default async function AdminMuaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <MuaDetailClient
      muaId={id}
      backHref="/admin/muas"
      backLabel="Back to MUAs"
      showPushToLead={false}
      canEdit
      canEditPlanFields
      showCareTickets
    />
  );
}
