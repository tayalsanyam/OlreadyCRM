import { CareTaskWorkspaceClient } from "@/components/grievances/CareTaskWorkspaceClient";

export default async function CareTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CareTaskWorkspaceClient taskId={id} />;
}
