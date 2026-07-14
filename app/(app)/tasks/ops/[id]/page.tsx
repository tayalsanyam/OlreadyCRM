import { OpsTaskWorkspaceClient } from "@/components/ops/OpsTaskWorkspaceClient";

export default async function OpsTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OpsTaskWorkspaceClient taskId={id} />;
}
