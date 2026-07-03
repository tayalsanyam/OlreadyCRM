import { POST as handleCanonicalCallyzerWebhook } from "@/app/api/callyzer/webhook/route";

// Legacy path kept for compatibility; route all traffic through canonical sales webhook handler.
export async function POST(request: Request) {
  return handleCanonicalCallyzerWebhook(request);
}
