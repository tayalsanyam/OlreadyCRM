import { extractRagBulletFacts, muaFirstName, polishSalesReply } from "@/lib/ai-reply-polish";

export function buildStructuredSalesFallback(input: {
  message: string;
  muaName?: string | null;
  muaCity?: string | null;
  stage?: string | null;
  docsBlock?: string;
}): string {
  const first = muaFirstName(input.muaName) ?? "there";
  const m = input.message.toLowerCase();
  const ragFacts = extractRagBulletFacts(input.docsBlock ?? "", 2);
  const proof = ragFacts[0] ?? "Olready leads are verified bridal queries with RM support on paid plans.";

  if (/whatsapp|sms|message|draft|script|email/.test(m)) {
    const draft = `Hi ${first}, I hear you on cost — Instagram gives visibility but Olready adds verified bridal queries, weekly profile pushes by plan, and RM follow-up support. ${proof} Can we do a 15-min call ${input.muaCity ? `this week (${input.muaCity})` : "this week"} to see if a tier fits your volume?`;
    return polishSalesReply(draft, input.muaName);
  }

  if (/objection|pushback|not interested|expensive|instagram/.test(m)) {
    return polishSalesReply(
      [
        `Objection: "${input.message.slice(0, 80)}${input.message.length > 80 ? "…" : ""}"`,
        `Response: ${first}, many MUAs start with Instagram; Olready adds verified bridal demand and structured follow-up.`,
        `Proof: ${proof}`,
        `CTA: Book a short call this week to compare weekly push caps for ${input.muaCity ?? "your city"}.`,
      ].join("\n"),
      input.muaName,
    );
  }

  if (/next|stage|follow.?up|what should i do/.test(m)) {
    const stage = input.stage?.replace(/_/g, " ") ?? "current stage";
    return [
      `Stage: ${stage}.`,
      `Next: one touchpoint in 48h — confirm plan fit, training readiness, or activation blocker.`,
      ragFacts[1] ? `Reference: ${ragFacts[1]}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return polishSalesReply(
    [
      input.muaName ? `${input.muaName}${input.muaCity ? ` (${input.muaCity})` : ""} — stage ${input.stage ?? "n/a"}.` : "",
      ragFacts.length ? ragFacts.map((f) => `- ${f}`).join("\n") : `On "${input.message.slice(0, 100)}": use Sales Toolkit for product/process claims.`,
      "Next: one concrete CTA with date/time.",
    ]
      .filter(Boolean)
      .join("\n\n"),
    input.muaName,
  );
}
