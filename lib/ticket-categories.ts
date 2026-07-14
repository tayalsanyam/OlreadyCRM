import type { RaisedByType } from "@/lib/types";

export type TicketCategoryDef = {
  value: string;
  label: string;
  description: string;
};

/** Issue types brides / leads can raise on the public support form. */
export const BRIDE_TICKET_CATEGORIES: TicketCategoryDef[] = [
  {
    value: "too_many_calls",
    label: "Too many calls",
    description: "Excessive or repeated calls from Olready or artists",
  },
  {
    value: "artist_not_responding",
    label: "Artist not responding",
    description: "Assigned or suggested artist is not replying",
  },
  {
    value: "no_contact_from_muas",
    label: "No contact from MUAs",
    description: "No artist outreach after enquiry or match",
  },
  {
    value: "rm_unresponsive",
    label: "RMs unresponsive",
    description: "Relationship manager or coordinator not responding",
  },
  {
    value: "wrong_details_shared",
    label: "Wrong details shared",
    description: "Incorrect information about artist, booking, or event",
  },
  {
    value: "other",
    label: "Other",
    description: "Does not fit the categories above",
  },
];

/** Issue types for public form when submitter selects "Other". */
export const OTHER_TICKET_CATEGORIES: TicketCategoryDef[] = [
  {
    value: "business_collaboration",
    label: "Business collaboration",
    description: "Partnership, vendor, or business enquiry",
  },
  {
    value: "other",
    label: "Others",
    description: "General enquiry not covered above",
  },
];

/** Issue types an MUA can raise — aligned with support.category_config */
export const TICKET_CATEGORIES: TicketCategoryDef[] = [
  {
    value: "lead_reversal",
    label: "Lead reversal",
    description: "Wants leads reversed / credited back",
  },
  {
    value: "lead_quality",
    label: "Lead quality",
    description: "Leads were wrong, fake, or not serious",
  },
  {
    value: "did_not_get_business",
    label: "Did not get business",
    description: "Lead did not convert or book",
  },
  {
    value: "plan_extension",
    label: "Plan extension",
    description: "Renewal, expiry, or plan upgrade request",
  },
  {
    value: "invoice_contract",
    label: "Invoice / contract / payment",
    description: "Billing, invoice, contract, or payment issue",
  },
  {
    value: "rm_relationship",
    label: "RM relationship",
    description: "Issue with assigned relationship manager",
  },
  {
    value: "sales_promise",
    label: "Sales promise",
    description: "Sales team promised something not delivered",
  },
  {
    value: "profile_query",
    label: "Profile / plan query",
    description: "Profile, visibility, or plan feature question",
  },
  {
    value: "other",
    label: "Other",
    description: "Does not fit the categories above",
  },
];

export const ALL_TICKET_CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  [...TICKET_CATEGORIES, ...BRIDE_TICKET_CATEGORIES, ...OTHER_TICKET_CATEGORIES].map((c) => [
    c.value,
    c.label,
  ]),
);

export const TICKET_CATEGORY_LABELS: Record<string, string> = ALL_TICKET_CATEGORY_LABELS;

export function getTicketCategoriesForRaisedBy(raisedByType: RaisedByType | string): TicketCategoryDef[] {
  if (raisedByType === "bride") return BRIDE_TICKET_CATEGORIES;
  if (raisedByType === "other") return OTHER_TICKET_CATEGORIES;
  return TICKET_CATEGORIES;
}

export function isValidTicketCategory(category: string, raisedByType: RaisedByType | string): boolean {
  return getTicketCategoriesForRaisedBy(raisedByType).some((c) => c.value === category);
}

export function formatTicketCategories(categories: string[]): string {
  return categories
    .map((c) => TICKET_CATEGORY_LABELS[c] ?? c.replace(/_/g, " "))
    .join(", ");
}

export function categoryTagKey(value: string): string {
  return `category:${value}`;
}

export function parseCategoryTags(tags: string[]): string[] {
  return tags
    .filter((t) => t.startsWith("category:"))
    .map((t) => t.slice("category:".length));
}

export function allCategoriesFromTicket(category: string, tags: string[]): string[] {
  const fromTags = parseCategoryTags(tags);
  return [...new Set([category, ...fromTags])];
}
