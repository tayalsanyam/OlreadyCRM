import { sql, withTransaction, appendComm } from "@/db/index";
import { PLAN_TIER_TO_LABEL } from "@/lib/admin-plan-assign-shared";
import { COMM } from "@/lib/comm-types";
import { fromDbPlanTier } from "@/lib/db-mappers";
import { formatMakeupLookForAi } from "@/lib/makeup-look";
import { getMakeupLookProfile } from "@/lib/makeup-look-db";
import { USE_MOCK } from "@/lib/mock-data";
import { isMuaOnActivePlan } from "@/lib/mua-active-plan";
import { getCareGmailAddress, renderTemplate, sendCareEmail } from "@/lib/resend";
import type { BudgetTier, PlanTier } from "@/lib/types";
import { BUDGET_TIER_LABELS, BUDGET_TIER_RANGES } from "@/lib/types";

export const RM_PUSH_TEMPLATE_PRIVY = "RM Push — Privy bride share";
export const RM_PUSH_TEMPLATE_RECOMMENDED = "RM Push — Recommended bride";

export type MuaPushEmailNotification = {
  status: "sent" | "skipped" | "missing_email" | "failed";
  message?: string;
};

function pushEmailKind(planTier: PlanTier | null): "privy" | "recommended" | null {
  if (!planTier || planTier === "prime") return null;
  if (planTier === "highestPrivy") return "privy";
  if (planTier === "phoenix" || planTier === "phoenix2" || planTier === "pro") {
    return "recommended";
  }
  return null;
}

function formatBudgetLine(
  budgetAmount: number | null,
  budgetTier: BudgetTier | null,
): string {
  const parts: string[] = [];
  if (budgetAmount != null && budgetAmount > 0) {
    parts.push(`Rs. ${budgetAmount.toLocaleString("en-IN")}`);
  }
  if (budgetTier) {
    parts.push(`${BUDGET_TIER_LABELS[budgetTier]} (${BUDGET_TIER_RANGES[budgetTier]})`);
  }
  return parts.join(" · ") || "Not specified";
}

async function loadPushEmailTemplate(
  name: string,
): Promise<{ subjectTemplate: string; bodyTemplate: string } | null> {
  const [row] = await sql<{ subjectTemplate: string; bodyTemplate: string }[]>`
    SELECT subject_template AS "subjectTemplate", body_template AS "bodyTemplate"
    FROM support.ticket_templates
    WHERE name = ${name}
      AND active = true
    LIMIT 1
  `;
  return row ?? null;
}

async function buildEventsBlock(eventIds: string[]): Promise<string> {
  if (!eventIds.length) return "Not specified";
  const events = await sql<
    {
      ceremonyType: string;
      eventDate: string | null;
      eventLocation: string | null;
    }[]
  >`
    SELECT
      ceremony_type AS "ceremonyType",
      event_date::text AS "eventDate",
      event_location AS "eventLocation"
    FROM lead_events
    WHERE id = ANY(${sql.array(eventIds)}::uuid[])
    ORDER BY event_date NULLS LAST, ceremony_type
  `;
  if (!events.length) return "Not specified";
  return events
    .map((event) => {
      const date = event.eventDate
        ? new Date(event.eventDate).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
        : "Date TBD";
      const location = event.eventLocation?.trim();
      return location
        ? `${event.ceremonyType} — ${date} (${location})`
        : `${event.ceremonyType} — ${date}`;
    })
    .join("\n");
}

async function buildMakeupDetailsBlock(leadId: string): Promise<string> {
  const profile = await getMakeupLookProfile(sql, leadId);
  if (!profile) return "";
  const summary = formatMakeupLookForAi(profile).trim();
  if (!summary) return "";
  return `\n\nMakeup preferences:\n${summary}`;
}

async function logPushEmailComm(params: {
  leadId: string;
  muaId: string;
  actorId: string;
  entryType: string;
  description: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await withTransaction(async (tx) => {
    await appendComm(tx, {
      leadId: params.leadId,
      muaId: params.muaId,
      entryType: params.entryType,
      description: params.description,
      actorId: params.actorId,
      metadata: params.metadata,
    });
  });
}

export async function sendMuaPushNotificationEmail(params: {
  leadId: string;
  muaId: string;
  eventIds: string[];
  actorId: string;
}): Promise<MuaPushEmailNotification> {
  if (USE_MOCK) {
    return { status: "skipped" };
  }

  try {
    const [mua] = await sql<
      {
        name: string;
        email: string | null;
        planTier: string | null;
        planExpiry: string | null;
      }[]
    >`
      SELECT
        name,
        email,
        plan_tier::text AS "planTier",
        plan_expiry::text AS "planExpiry"
      FROM muas
      WHERE id = ${params.muaId}::uuid
    `;
    if (!mua) return { status: "skipped" };

    const planTier = fromDbPlanTier(mua.planTier);
    if (!isMuaOnActivePlan({ planTier: mua.planTier, planExpiry: mua.planExpiry })) {
      return { status: "skipped" };
    }

    const kind = pushEmailKind(planTier);
    if (!kind) return { status: "skipped" };

    if (!mua.email?.trim()) {
      await logPushEmailComm({
        leadId: params.leadId,
        muaId: params.muaId,
        actorId: params.actorId,
        entryType: COMM.note,
        description: `Push succeeded; automated email not sent to ${mua.name} — no email on file`,
        metadata: { muaId: params.muaId, reason: "missing_email" },
      });
      return { status: "missing_email", message: "Email ID missing" };
    }

    const [lead] = await sql<
      {
        brideName: string;
        city: string | null;
        budgetAmount: number | null;
        budgetTier: string | null;
      }[]
    >`
      SELECT
        bride_name AS "brideName",
        city,
        budget_amount AS "budgetAmount",
        budget_tier::text AS "budgetTier"
      FROM bride_leads
      WHERE id = ${params.leadId}::uuid
    `;
    if (!lead) return { status: "skipped" };

    const templateName =
      kind === "privy" ? RM_PUSH_TEMPLATE_PRIVY : RM_PUSH_TEMPLATE_RECOMMENDED;
    const template = await loadPushEmailTemplate(templateName);
    if (!template) {
      console.error("[rm-mua-push-email] template not found:", templateName);
      return { status: "failed" };
    }

    const planName = planTier ? PLAN_TIER_TO_LABEL[planTier] : "";
    const vars: Record<string, string> = {
      mua_name: mua.name,
      plan_name: planName,
      bride_name: lead.brideName,
      city: lead.city?.trim() || "Not specified",
      budget_line: formatBudgetLine(
        lead.budgetAmount,
        (lead.budgetTier as BudgetTier | null) ?? null,
      ),
      events_block: await buildEventsBlock(params.eventIds),
      makeup_details: await buildMakeupDetailsBlock(params.leadId),
      disclaimer:
        kind === "privy"
          ? "This is an automated notification for a Profile share to a prospective Lead."
          : "Unlock and Contact for more details. This is an automated system generated recommendation",
    };

    const subject = renderTemplate(template.subjectTemplate, vars);
    const body = renderTemplate(template.bodyTemplate, vars);
    const sendResult = await sendCareEmail({
      to: mua.email.trim(),
      subject,
      html: body,
      text: body,
      replyTo: getCareGmailAddress(),
    });

    if (!sendResult.ok) {
      await logPushEmailComm({
        leadId: params.leadId,
        muaId: params.muaId,
        actorId: params.actorId,
        entryType: COMM.note,
        description: `Automated MUA email failed for ${mua.name}: ${sendResult.error}`,
        metadata: { muaId: params.muaId, reason: "send_failed", error: sendResult.error },
      });
      return { status: "failed" };
    }

    await logPushEmailComm({
      leadId: params.leadId,
      muaId: params.muaId,
      actorId: params.actorId,
      entryType: COMM.careEmailSent,
      description: `Automated bride share email sent to ${mua.name} (${planName})`,
      metadata: { muaId: params.muaId, planTier: mua.planTier },
    });
    return { status: "sent" };
  } catch (err) {
    console.error("[rm-mua-push-email]", err);
    return { status: "failed" };
  }
}
