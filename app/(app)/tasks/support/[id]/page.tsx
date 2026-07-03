import { SupportInquiryTaskClient } from "@/components/support/SupportInquiryTaskClient";

export default async function SupportInquiryTaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SupportInquiryTaskClient inquiryId={id} />;
}
