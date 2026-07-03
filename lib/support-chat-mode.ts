import type { SupportVisitorSegment } from "@/lib/support-chat-intake";
import { CARE_EMAIL, CARE_PHONE_DISPLAY } from "@/lib/care-contact";
import { buildProspectPlansTableFallback } from "@/lib/plans-rag-public";
import { supportSubmitConcernLink } from "@/lib/support-public-links";

/** How the public /support AI should behave for this visitor. */
export type SupportChatMode = "mua_sales" | "mua_care" | "bride";

export function resolveSupportChatMode(segment: SupportVisitorSegment): SupportChatMode {
  if (segment === "existing_mua_active" || segment === "existing_mua_inactive") {
    return "mua_care";
  }
  if (segment === "potential_mua") return "mua_sales";
  return "bride";
}

export function buildSupportModeSystemPrompt(mode: SupportChatMode): string {
  switch (mode) {
    case "mua_sales":
      return `CHAT MODE: MUA PROSPECT (sales — educate & capture interest)
- This visitor is NOT an existing Olready partner — treat them as a **sales prospect**.
- Your job: explain Olready clearly, share **concrete plan facts** (price, leads, validity), and help them see which plan fits.
- For plan/pricing/lead questions: use **only** Prime, Pro, Phoenix from plansrag.md — share the comparison table with real ₹ prices and lead counts. Never mention Privy, Phoenix 2, or other legacy tiers.
- Be enthusiastic but factual — highlight Phoenix as best value (120 leads, RM, all-India).
- After plan detail, ask **city + events/month** and suggest a plan, or invite WhatsApp/call to join.
- For non-plan topics (how leads work, onboarding): keep answers crisp (~80 words).
- Do NOT push Submit concern — they are exploring.
- Do NOT imply you can see their account.`;

    case "mua_care":
      return `CHAT MODE: EXISTING MUA PARTNER (care & support)
- This visitor is an existing Olready customer: active plan OR has been on a plan in the past.
- Your job: partner support — plans, RM process, reversals (process only), policies, reactivation if lapsed.
- You may acknowledge they are a partner on file at a high level (active or returning partner). Do not recite internal CRM IDs.
- For account-specific issues (my payment, my leads, my reversal, my RM, billing dispute): explain the process if known, then direct to ${supportSubmitConcernLink()}, ${CARE_EMAIL}, or ${CARE_PHONE_DISPLAY}.
- Never approve/deny a specific reversal, refund, or compensation — explain eligibility process only.
- All MUA plans are **non-refundable** once activated. If asked about a plan refund, state the policy clearly — do not offer or discuss refunds.
- If they want to rejoin or upgrade and excerpts cover it, help — otherwise route to care/sales contact.`;

    case "bride":
      return `CHAT MODE: BRIDE / CUSTOMER
- Help with how Olready supports brides, makeup guidance, and general process.
- For booking-specific or account issues: suggest their assigned artist or care team via ${supportSubmitConcernLink()} / ${CARE_EMAIL}.`;
  }
}

export function supportModeContextHint(mode: SupportChatMode): string {
  switch (mode) {
    case "mua_sales":
      return "Prospect MUA — sell and educate using knowledge base. Do not treat as an existing partner or route everything to care.";
    case "mua_care":
      return "Existing partner (active or past plan) — support and policy first; Submit concern for account-specific disputes.";
    case "bride":
      return "Bride/customer — concierge tone; care escalation only for booking/account specifics.";
  }
}

export function fallbackPublicReplyForMode(
  mode: SupportChatMode,
  message: string,
  docTitles: string[],
  visitorFirstName?: string,
): string {
  const first = visitorFirstName?.trim().split(/\s+/)[0] || "there";

  if (mode === "mua_sales") {
    return buildProspectPlansTableFallback(first);
  }

  if (mode === "bride") {
    const lines = [
      `Hi ${first} — thanks for reaching out.`,
      "",
      docTitles.length
        ? `I found guidance on: ${docTitles.join(", ")}.`
        : "I'm here to help you understand how Olready supports brides.",
      "",
      "For booking changes tied to your enquiry, raise a ticket:",
      supportSubmitConcernLink(),
      `• ${CARE_EMAIL} · ${CARE_PHONE_DISPLAY}`,
      "",
      "Team Olready",
    ];
    return lines.join("\n");
  }

  const lines = [
    `Hi ${first} — thanks for reaching out.`,
    "",
    docTitles.length
      ? `I found guidance related to: ${docTitles.join(", ")}. For your account ("${message.slice(0, 100)}${message.length > 100 ? "…" : ""}"), our care team can review your records.`
      : `For partner account questions ("${message.slice(0, 100)}${message.length > 100 ? "…" : ""}"), our care team should review your file.`,
    "",
    "Please use **Submit concern** to raise a ticket:",
    supportSubmitConcernLink(),
    `Or contact us:`,
    `• Email: ${CARE_EMAIL}`,
    `• Phone / WhatsApp: ${CARE_PHONE_DISPLAY}`,
    "",
    "Team Olready",
  ];
  return lines.join("\n");
}

/** Sales prospects should prefer toolkit + plans in RAG fallback. */
export const SUPPORT_MODE_RAG_PRIORITY: Record<SupportChatMode, string[]> = {
  mua_sales: ["plansrag.md", "Olready_Sales_Toolkit.md"],
  mua_care: [
    "plansrag.md",
    "Olready_Master_Knowledge_Dump_No_Pricing.md",
    "Olready_Bride_Side_Knowledge_Bank_RAG.md",
  ],
  bride: ["Olready_Bride_Side_Knowledge_Bank_RAG.md", "Olready_Master_Knowledge_Dump_No_Pricing.md"],
};
