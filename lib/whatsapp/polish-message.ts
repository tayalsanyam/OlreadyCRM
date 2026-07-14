import { completeChat } from "@/lib/ai-openai";
import { hasOpenAiKey } from "@/lib/ai-config";

type PolishInput = {
  draft: string;
  audience?: "mua" | "bride";
  muaName?: string | null;
  brideName?: string | null;
};

export async function polishWhatsAppMessage(input: PolishInput): Promise<string> {
  const draft = input.draft.trim();
  if (!draft) return draft;

  if (!hasOpenAiKey()) {
    return fallbackPolish(draft);
  }

  const audienceLabel = input.audience === "bride" ? "bride" : "makeup artist (MUA)";
  const names = [
    input.muaName ? `MUA name: ${input.muaName}` : null,
    input.brideName ? `Bride name: ${input.brideName}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const system = `You polish WhatsApp messages for Olready bridal coordinators in India.
Fix spelling, grammar, and awkward phrasing. Keep the same meaning and length — do not add new offers or facts.
Preserve placeholders exactly: {muaName}, {brideName}, {city}, {scheduledTime}.
Keep a warm, professional tone suitable for ${audienceLabel} outreach.
Return ONLY the polished message text — no quotes, labels, or explanation.`;

  const user = names
    ? `${names}\n\nMessage to polish:\n${draft}`
    : `Message to polish:\n${draft}`;

  try {
    return await completeChat(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { temperature: 0.2, maxTokens: 600 },
    );
  } catch {
    return fallbackPolish(draft);
  }
}

function fallbackPolish(text: string): string {
  return text
    .replace(/\bi\b/g, "I")
    .replace(/\s{3,}/g, "\n\n")
    .replace(/ +([,.!?])/g, "$1")
    .trim();
}
