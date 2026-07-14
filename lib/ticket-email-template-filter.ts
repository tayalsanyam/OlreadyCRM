import {
  BRIDE_TICKET_CATEGORIES,
  OTHER_TICKET_CATEGORIES,
  TICKET_CATEGORIES,
} from "@/lib/ticket-categories";

export type EmailTemplateOption = {
  id: string;
  name: string;
  category: string | null;
  approvalTier: number;
  requiresAdminApproval: boolean;
};

function categorySlugsForParty(raisedByType: string): Set<string> {
  if (raisedByType === "bride") {
    return new Set(BRIDE_TICKET_CATEGORIES.map((c) => c.value));
  }
  if (raisedByType === "other") {
    return new Set(OTHER_TICKET_CATEGORIES.map((c) => c.value));
  }
  return new Set(TICKET_CATEGORIES.map((c) => c.value));
}

/** Templates visible when drafting — general + all party categories (+ ticket category). */
export function filterEmailTemplatesForTicket(
  templates: EmailTemplateOption[],
  opts: { raisedByType?: string | null; ticketCategory?: string | null }
): EmailTemplateOption[] {
  const raisedByType = opts.raisedByType ?? "mua";
  const partyCategories = categorySlugsForParty(raisedByType);
  const ticketCategory = opts.ticketCategory ?? null;

  const visible = templates.filter((t) => {
    if (!t.category) return true;
    if (partyCategories.has(t.category)) return true;
    if (ticketCategory && t.category === ticketCategory) return true;
    return false;
  });

  const rank = (t: EmailTemplateOption): number => {
    if (ticketCategory && t.category === ticketCategory) return 0;
    if (!t.category) return 1;
    return 2;
  };

  return [...visible].sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    return a.name.localeCompare(b.name);
  });
}
