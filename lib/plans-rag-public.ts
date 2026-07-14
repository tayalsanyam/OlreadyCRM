import { CARE_PHONE_DISPLAY } from "@/lib/care-contact";

/** Only these plans exist in public plansrag.md — never mention Privy, Phoenix 2, etc. */
export const PUBLIC_MUA_PLAN_NAMES = ["Prime", "Pro", "Phoenix"] as const;

export function isProspectPlanQuestion(message: string, historyText = ""): boolean {
  const text = `${historyText}\n${message}`.toLowerCase();
  return /\b(plan|plans|pricing|price|cost|lead|quer(y|ies)|how many|detail|compare|which plan|offer|fit for|prime|pro|phoenix|package|subscription)\b/.test(
    text,
  );
}

export const PROSPECT_MUA_SALES_ANSWER_RULES = `PROSPECT MUA — PLAN SALES (overrides brevity limits for this reply)
- You are selling Olready to a **prospect MUA** — be helpful, specific, and confident. Capture interest with real numbers.
- Use **only** the Authoritative plan catalog below. There are exactly **3 plans: Prime, Pro, Phoenix**. Do NOT mention Privy, Phoenix 2, Highest Privy, or any tier not in the catalog.
- When asked about plans, pricing, leads, or "detail them out": share **price, lead count, validity, state access, makeup types, RM/reversal/IG features** for each plan.
- Prefer a **comparison table** (Prime / Pro / Phoenix) with Price, Leads, Validity, Access columns — then 1–2 lines on who each plan suits.
- Highlight **Phoenix** as best value when comparing (RM, 120 leads, all-India, reversal, IG feature).
- End with a **soft sales CTA**: ask city + events per month, suggest which plan fits, invite them to talk to Team Olready (${CARE_PHONE_DISPLAY}) if ready to join.
- No vague words like "minimum exposure" or "strong exposure" without pairing with **price + lead count** from the catalog.
- BAN filler openers. First line = direct answer with plan facts.`;

export function buildProspectPlansTableFallback(visitorFirstName?: string): string {
  const first = visitorFirstName?.trim().split(/\s+/)[0] || "there";
  return `Hi ${first},

Olready has **3 partner plans** — here's what each includes:

| Plan | Price | Leads | Validity | Access | Highlights |
| --- | --- | --- | --- | --- | --- |
| **Prime** | ₹9,999 | 30 | 2 months | 1 state | Party / low-budget events · email support |
| **Pro** | ₹19,999 | 70 | 3 months | 3 states | Bridal & wedding events · lead reversal |
| **Phoenix** ★ | ₹29,999 | 120 | 6 months | All India | High-end & destination bridal · dedicated RM · lead reversal · 1 IG/FB feature |

**How leads work:** verified bride queries are matched to you; you unlock and contact leads within your plan's lead pool.

Which city do you work in most, and how many bridal events do you handle per month? I can suggest Prime vs Pro vs Phoenix — or WhatsApp ${CARE_PHONE_DISPLAY} to get started.`;
}
