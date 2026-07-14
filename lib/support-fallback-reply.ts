import { CARE_EMAIL, CARE_PHONE_DISPLAY } from "@/lib/care-contact";
import { extractRagBulletFacts } from "@/lib/ai-reply-polish";
import {
  buildProspectPlansTableFallback,
  isProspectPlanQuestion,
} from "@/lib/plans-rag-public";
import type { SupportChatMode } from "@/lib/support-chat-mode";
import { detectSupportTopic } from "@/lib/support-rag-sections";
import { supportSubmitConcernLink } from "@/lib/support-public-links";

export function buildStructuredSupportFallback(input: {
  mode: SupportChatMode;
  message: string;
  visitorFirstName?: string;
  docsBlock?: string;
  partnerActive?: boolean;
}): string {
  const first = input.visitorFirstName?.trim().split(/\s+/)[0] || "there";
  const topic = detectSupportTopic(input.message, input.mode);
  const ragFacts = extractRagBulletFacts(input.docsBlock ?? "", 3);
  const ticketLink = supportSubmitConcernLink();

  if (input.mode === "mua_sales") {
    if (topic === "plans" || isProspectPlanQuestion(input.message)) {
      return buildProspectPlansTableFallback(input.visitorFirstName);
    }

    const leadFacts =
      topic === "leads_flow" || topic === "general"
        ? [
            "Brides submit queries on Olready; verified requests are matched to partner MUAs.",
            "Your profile is pushed to matching brides up to your plan's weekly cap; you unlock and contact leads.",
            "Paid plans include RM support for follow-ups after activation.",
          ]
        : [];

    const facts = ragFacts.length ? ragFacts : leadFacts;
    const lines = [`Hi ${first},`];

    if (topic === ("plans" as typeof topic) && ragFacts.length) {
      lines.push("", ...ragFacts.slice(0, 3).map((f) => `- ${f}`));
    } else if (facts.length) {
      lines.push("", ...facts.slice(0, 3).map((f) => `- ${f}`));
    } else {
      lines.push("", "Olready routes verified bridal queries to partner MUAs by plan tier and city.");
    }

    if (/sign up|join|onboard|get started/i.test(input.message)) {
      lines.push("", `Our team can walk you through joining — WhatsApp ${CARE_PHONE_DISPLAY} or ${CARE_EMAIL}.`);
    } else {
      lines.push("", "Which city are you based in, and do you run a studio or freelance?");
    }

    return lines.join("\n").slice(0, 900);
  }

  if (input.mode === "mua_care") {
    const mentionsReversal = /\b(reversal|reverse|report a problem|non.?responsive|lead credit)\b/i.test(
      input.message,
    );
    const mentionsRefund = /\b(refund|money back|cancel plan)\b/i.test(input.message);
    const reversalFacts = [
      `Report lead reversals via ${ticketLink} or care@olready.in with lead ID and contact attempts.`,
      "Olready verifies eligibility before any credit — we do not approve your specific case in chat.",
    ];
    const refundFacts = [
      "All MUA plans are non-refundable once payment is processed and the plan is activated.",
      `For a formal review, use ${ticketLink}.`,
    ];
    const careFacts =
      mentionsRefund
        ? refundFacts
        : topic === "reversal" || mentionsReversal
          ? reversalFacts
          : ragFacts.length
            ? ragFacts
            : reversalFacts.slice(0, 1);

    const lines = [
      `Hi ${first},`,
      input.partnerActive !== false ? "You're an Olready partner on file." : "Welcome back — you're on file as a past partner.",
    ];

    if (careFacts.length) {
      lines.push("", ...careFacts.slice(0, 3).map((f) => `- ${f}`));
    } else {
      lines.push("", `For account-specific review (your leads, payment, RM), use ${ticketLink} or:`);
    }

    lines.push(`- ${CARE_EMAIL} · ${CARE_PHONE_DISPLAY}`);
    return lines.join("\n").slice(0, 900);
  }

  // bride
  const brideFacts =
    ragFacts.length > 0
      ? ragFacts
      : [
          "Ask about products for your skin type, longevity for your events, and timing on the wedding day.",
          "Confirm what's included in the quote and how changes work after the trial.",
        ];

  return [
    `Hi ${first},`,
    "",
    ...brideFacts.slice(0, 3).map((f) => `- ${f}`),
    "",
    `For booking or service issues, raise a ticket: ${ticketLink}`,
    `${CARE_EMAIL} · ${CARE_PHONE_DISPLAY}.`,
  ]
    .join("\n")
    .slice(0, 900);
}
