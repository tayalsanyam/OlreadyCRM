import { FeedbackTicketClient } from "./FeedbackTicketClient";

export default async function FeedbackGrievanceTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <FeedbackTicketClient ticketId={id} />;
}
