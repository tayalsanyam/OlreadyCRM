import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { MuaDetailClient } from "@/components/muas/MuaDetailClient";

export default async function RmMuaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session || session.role !== "regionalRm") {
    redirect("/login");
  }
  const { id } = await params;
  return (
    <MuaDetailClient
      muaId={id}
      backHref="/rm/muas"
      backLabel="Back to My MUAs"
      showPushToLead={false}
      leadQueueStatus="assigned"
      region={session.region ?? undefined}
      canEdit
      showCareTickets
      careTicketsReadOnly
    />
  );
}
