import { extractRagBulletFacts } from "@/lib/ai-reply-polish";

export function buildStructuredRmFallback(input: {
  message: string;
  context: "verification" | "makeup" | "general";
  lead?: { brideName: string; city: string; region: string; status: string } | null;
  leadContextBlock?: string;
  docsBlock?: string;
}): string {
  const ragFacts = extractRagBulletFacts(input.docsBlock ?? "", 2);
  const bride = input.lead?.brideName?.split(/\s+/)[0] ?? "the bride";

  if (input.context === "verification") {
    const questions = [
      `Which event is the trial for, ${bride}?`,
      "Have you already finalised your wedding-day artist?",
      "What outcome do you want from today's trial vs the booked artist?",
      ...(ragFacts[0] ? [ragFacts[0]] : []),
    ];
    return [
      "Verification questions:",
      ...questions.slice(0, 4).map((q, i) => `${i + 1}) ${q}`),
      "Red flags: conflicting booking story, price-only enquiry with no event details.",
    ].join("\n");
  }

  if (input.context === "makeup") {
    const tips = ragFacts.length
      ? ragFacts
      : [
          "Soft glam for outdoor day: lightweight base, waterproof eyes, setting spray.",
          "Discuss heat/longevity for the venue and event timing.",
        ];
    return [
      "Counselling:",
      ...tips.slice(0, 3).map((t) => `- ${t}`),
      "",
      `Draft to ${bride}: "For your outdoor day wedding, I'd suggest a fresh soft-glam look that photographs well and stays comfortable — we can tailor products to your skin at the trial."`,
    ].join("\n");
  }

  return [
    input.leadContextBlock?.trim() ||
      (input.lead
        ? `Lead: ${input.lead.brideName} (${input.lead.city}) — ${input.lead.status.replace(/_/g, " ")}.`
        : ""),
    "Talking points:",
    ...(ragFacts.length ? ragFacts.map((f) => `- ${f}`) : ["- Confirm event type, date, and city coverage.", "- Summarise next step before closing."]),
    `Question: ${input.message.slice(0, 150)}`,
  ]
    .filter(Boolean)
    .join("\n");
}
