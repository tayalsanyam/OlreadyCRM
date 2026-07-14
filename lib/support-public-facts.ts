import type { SupportChatMode } from "@/lib/support-chat-mode";
import { CARE_EMAIL, CARE_PHONE_DISPLAY } from "@/lib/care-contact";
import type { SupportVisitorSegment } from "@/lib/support-chat-intake";
import { detectSupportTopic } from "@/lib/support-rag-sections";
import { supportSubmitConcernLink } from "@/lib/support-public-links";

export function buildPartnerContextBlock(
  snapshot: Record<string, unknown>,
  segment: SupportVisitorSegment,
): string | undefined {
  if (segment !== "existing_mua_active" && segment !== "existing_mua_inactive") {
    return undefined;
  }

  const active = snapshot.activePlan === true;
  const tier = snapshot.planTier ? String(snapshot.planTier) : null;
  const city = snapshot.city ? String(snapshot.city) : null;
  const muaName = snapshot.muaName ? String(snapshot.muaName) : null;

  const parts = [
    active ? "Status: **active plan partner**" : "Status: **lapsed/past plan partner** (on file)",
    tier ? `Plan on file: ${tier.replace(/_/g, " ")}` : null,
    city ? `City on file: ${city}` : null,
    muaName ? `Business name on file: ${muaName}` : null,
  ].filter(Boolean);

  return parts.length ? `Partner record (high-level — do not recite IDs):\n${parts.join("\n")}` : undefined;
}

export function buildTopicAnswerGuide(query: string, mode: SupportChatMode): string {
  const topic = detectSupportTopic(query, mode);

  const guides: Record<string, string> = {
    leads_flow:
      mode === "mua_sales"
        ? "Answer with exact lead counts per plan from plansrag.md: Prime 30, Pro 70, Phoenix 120. Then explain unlock flow briefly. Ask city + events/month."
        : "Explain unlock flow, RM role, and plan lead limits from plansrag.md if known.",
    plans:
      mode === "mua_sales"
        ? "Full sales comparison: Prime ₹9,999/30 leads, Pro ₹19,999/70 leads, Phoenix ₹29,999/120 leads — include validity, access, RM/reversal. Recommend Phoenix for growth MUAs. CTA: city + events/month or call Team Olready."
        : "Compare Prime, Pro, Phoenix using plansrag.md only: price, leads, validity, access, support. Do not use CRM or internal config.",
    reversal:
      "Cover: paid partners only, report within window via Submit concern or care@olready.in, reasonable contact attempts first, eligible cases (already booked elsewhere, not looking, non-responsive, location change, cancelled). Do NOT approve their specific case. Lead reversal is NOT a plan refund.",
    refund:
      "All MUA subscription plans are non-refundable once payment is processed and activated. State this clearly. Do not offer, negotiate, or discuss refunds.",
    rm_support:
      `RM assists paid-plan partners with follow-ups and conversion support after activation. For account RM contact → ${supportSubmitConcernLink()} or care line.`,
    onboarding:
      "Steps: sales call/demo → plan choice → onboarding (profile, regions, contract) → training (profile link, unlock, reversal rules) → activation → RM servicing.",
    reactivation:
      "Acknowledge past partnership. Explain they can rejoin; plan details from plansrag.md; sales or care can pick up reinstatement — Submit concern for account-linked questions.",
    bride:
      "How Olready connects brides to artists, consultation approach, Assured standards where relevant. Booking changes → artist or care team via Submit concern.",
    general: "Answer the specific question from excerpts; do not default to care escalation for prospects.",
  };

  const refundAsked = /\b(refund|money back|cancel plan|get my payment)\b/i.test(query);
  const topicKey = refundAsked ? "refund" : topic;

  return `Topic detected: ${topicKey}. ${guides[topicKey] ?? guides.general}`;
}

export function buildEscalationHint(mode: SupportChatMode): string {
  const ticketLink = supportSubmitConcernLink();
  if (mode === "mua_sales") {
    return "Escalation: only for signup/join intent (handled separately) or if excerpts truly do not cover the question — then invite one qualifying question, not care@ for every reply.";
  }
  if (mode === "mua_care") {
    return `Escalation: account-specific outcomes → ${ticketLink}, ${CARE_EMAIL}, or ${CARE_PHONE_DISPLAY} after explaining process.`;
  }
  return `Escalation: booking/account specifics → ${ticketLink}, ${CARE_EMAIL}, or Submit concern.`;
}
