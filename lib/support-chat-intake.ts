import type { TransactionSql } from "@/db/index";
import { normalizePhone } from "@/lib/phone";
import {
  resolveSupportChatMode,
  supportModeContextHint,
  type SupportChatMode,
} from "@/lib/support-chat-mode";
import { matchLeadByPhone } from "@/lib/ticket-lead-match";
import { matchMuaByPhone } from "@/lib/ticket-mua-match";

export type SupportVisitorKind = "mua" | "bride";

export type SupportVisitorSegment =
  | "existing_mua_active"
  | "existing_mua_inactive"
  | "potential_mua"
  | "existing_bride"
  | "potential_bride";

export type SupportChatIntakeResult = {
  segment: SupportVisitorSegment;
  segmentLabel: string;
  chatMode: SupportChatMode;
  greeting: string;
  muaId: string | null;
  leadId: string | null;
  contextSnapshot: Record<string, unknown>;
};

export const SUPPORT_SEGMENT_LABELS: Record<SupportVisitorSegment, string> = {
  existing_mua_active: "Existing MUA — active plan",
  existing_mua_inactive: "Existing MUA — past plan partner",
  potential_mua: "Potential MUA — prospect",
  existing_bride: "Existing bride / lead on file",
  potential_bride: "Potential bride / new enquiry",
};

function greetingForSegment(
  segment: SupportVisitorSegment,
  name: string,
  extras?: {
    planTier?: string | null;
    city?: string | null;
    activePlan?: boolean;
  },
): string {
  const first = name.trim().split(/\s+/)[0] || "there";
  switch (segment) {
    case "existing_mua_active":
      return `Hi ${first} — you're an Olready partner on file${extras?.planTier ? ` (${extras.planTier})` : ""}. Ask about plans, leads, reversals, or RM support — for account-specific issues I'll guide you to Submit concern.`;
    case "existing_mua_inactive":
      return `Hi ${first} — welcome back. You're an Olready partner on file${extras?.planTier ? ` (previously ${extras.planTier})` : ""}. I can help with policies, account questions, billing, or rejoining — for disputes tied to your records, use Submit concern.`;
    case "potential_mua":
      return `Hi ${first} — ask me about Olready plans, how bridal leads work, or whether we're a fit for you.`;
    case "existing_bride":
      return `Hi ${first} — thanks for reaching out. I can help with makeup guidance and how Olready supports brides${extras?.city ? ` in ${extras.city}` : ""}. For booking changes, your assigned artist or our care team is best for account-specific help.`;
    case "potential_bride":
      return `Hi ${first} — welcome to Olready. I'm here to help you understand how we connect brides with makeup artists. Share your questions about services, consultation, or next steps.`;
  }
}

async function loadMuaPlanRow(
  tx: TransactionSql,
  muaId: string,
): Promise<{
  planTier: string | null;
  planExpiry: string | null;
  city: string | null;
  status: string;
} | null> {
  const [row] = await tx<
    { planTier: string | null; planExpiry: string | null; city: string; status: string }[]
  >`
    SELECT
      plan_tier::text AS "planTier",
      plan_expiry::text AS "planExpiry",
      city,
      status
    FROM muas
    WHERE id = ${muaId}::uuid
    LIMIT 1
  `;
  return row ?? null;
}

function isActiveMuaPlan(planTier: string | null, planExpiry: string | null): boolean {
  if (!planTier) return false;
  if (!planExpiry) return true;
  const expiry = new Date(planExpiry);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return expiry >= today;
}

/** Active plan, current tier on file, or any row in plan history = existing customer. */
async function hasEverBeenOnPlan(
  tx: TransactionSql,
  muaId: string,
  plan: { planTier: string | null } | null,
): Promise<boolean> {
  if (plan?.planTier) return true;

  const [hist] = await tx<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM mua_plan_history WHERE mua_id = ${muaId}::uuid
  `;
  return (hist?.n ?? 0) > 0;
}

export async function resolveSupportChatIntake(
  tx: TransactionSql,
  input: {
    name: string;
    phone: string;
    visitorKind: SupportVisitorKind;
  },
): Promise<SupportChatIntakeResult> {
  const name = input.name.trim();
  const phoneNormalized = normalizePhone(input.phone);

  if (input.visitorKind === "mua") {
    const matches = await matchMuaByPhone(tx, input.phone);
    const mua = matches[0];

    if (!mua) {
      const segment: SupportVisitorSegment = "potential_mua";
      return {
        segment,
        segmentLabel: SUPPORT_SEGMENT_LABELS[segment],
        chatMode: resolveSupportChatMode(segment),
        greeting: greetingForSegment(segment, name),
        muaId: null,
        leadId: null,
        contextSnapshot: {
          visitorKind: "mua",
          declaredName: name,
          phoneNormalized,
          everOnPlan: false,
          hasPipeline: false,
        },
      };
    }

    const plan = await loadMuaPlanRow(tx, mua.muaId);
    const active = plan ? isActiveMuaPlan(plan.planTier, plan.planExpiry) : false;
    const everOnPlan = await hasEverBeenOnPlan(tx, mua.muaId, plan);

    const baseSnapshot = {
      visitorKind: "mua" as const,
      declaredName: name,
      phoneNormalized,
      muaName: mua.muaName,
      planTier: plan?.planTier ?? null,
      planExpiry: plan?.planExpiry ?? null,
      pipelineStage: mua.stage ?? null,
      pipelineId: mua.pipelineId ?? null,
      city: plan?.city ?? null,
      everOnPlan,
      hasPipeline: Boolean(mua.pipelineId),
    };

    if (everOnPlan) {
      const segment: SupportVisitorSegment = active ? "existing_mua_active" : "existing_mua_inactive";
      return {
        segment,
        segmentLabel: SUPPORT_SEGMENT_LABELS[segment],
        chatMode: resolveSupportChatMode(segment),
        greeting: greetingForSegment(segment, name, {
          planTier: plan?.planTier,
          city: plan?.city,
          activePlan: active,
        }),
        muaId: mua.muaId,
        leadId: null,
        contextSnapshot: { ...baseSnapshot, activePlan: active },
      };
    }

    const segment: SupportVisitorSegment = "potential_mua";
    return {
      segment,
      segmentLabel: SUPPORT_SEGMENT_LABELS[segment],
      chatMode: resolveSupportChatMode(segment),
      greeting: greetingForSegment(segment, name),
      muaId: mua.muaId,
      leadId: null,
      contextSnapshot: baseSnapshot,
    };
  }

  const leads = await matchLeadByPhone(tx, input.phone);
  const lead = leads[0];

  if (!lead) {
    const segment: SupportVisitorSegment = "potential_bride";
    return {
      segment,
      segmentLabel: SUPPORT_SEGMENT_LABELS[segment],
      chatMode: resolveSupportChatMode(segment),
      greeting: greetingForSegment(segment, name),
      muaId: null,
      leadId: null,
      contextSnapshot: { visitorKind: "bride", declaredName: name, phoneNormalized },
    };
  }

  const segment: SupportVisitorSegment = "existing_bride";
  return {
    segment,
    segmentLabel: SUPPORT_SEGMENT_LABELS[segment],
    chatMode: resolveSupportChatMode(segment),
    greeting: greetingForSegment(segment, name, { city: null }),
    muaId: null,
    leadId: lead.leadId,
    contextSnapshot: {
      visitorKind: "bride",
      declaredName: name,
      phoneNormalized,
      brideNameOnFile: lead.brideName,
      leadDisplayId: lead.displayId,
    },
  };
}

export function formatVisitorContextForAi(intake: {
  name: string;
  phone: string;
  visitorKind: SupportVisitorKind;
  segment: SupportVisitorSegment;
  segmentLabel: string;
  contextSnapshot: Record<string, unknown>;
}): string {
  const mode = resolveSupportChatMode(intake.segment);
  const everOnPlan = intake.contextSnapshot.everOnPlan === true;
  const activePlan = intake.contextSnapshot.activePlan === true;

  return [
    `Visitor name (declared): ${intake.name}`,
    `Phone (declared): ${intake.phone}`,
    `Visitor type: ${intake.visitorKind === "mua" ? "Makeup artist (MUA)" : "Bride / customer"}`,
    `CRM segment: ${intake.segmentLabel} (${intake.segment})`,
    `Chat mode: ${mode}`,
    supportModeContextHint(mode),
    everOnPlan
      ? `Existing customer: ${activePlan ? "active plan now" : "has been on a plan in the past (lapsed or expired)"}.`
      : intake.visitorKind === "mua"
        ? "Prospect: no active or past Olready plan on file — treat as sales/education, not care escalation."
        : undefined,
    `CRM snapshot (routing only — do not recite internal IDs): ${JSON.stringify(intake.contextSnapshot)}`,
  ]
    .filter(Boolean)
    .join("\n");
}
