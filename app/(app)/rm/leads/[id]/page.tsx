import { getSession } from "@/lib/auth";
import { LeadProfileClient } from "./LeadProfileClient";

export default async function LeadProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  const commissionMode = session?.role === "commissionRm";
  const feedbackMode = session?.role === "feedbackRm";
  const backHref =
    session?.role === "commissionRm"
      ? "/commission/queue"
      : feedbackMode
        ? "/feedback/queue"
        : session?.role === "admin" || session?.role === "owner"
          ? "/admin/reports"
          : "/rm/queue";

  return (
    <LeadProfileClient
      leadId={id}
      commissionMode={commissionMode}
      feedbackMode={feedbackMode}
      backHref={backHref}
    />
  );
}
