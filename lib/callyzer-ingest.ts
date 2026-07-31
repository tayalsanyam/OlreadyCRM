import type { TransactionSql } from "@/db/index";
import { appendComm } from "@/db/index";
import {
  type CallyzerIdentity,
  type CallyzerStaffRow,
  loadCallyzerIdentityByPhone,
  loadCallyzerIdentityByStaffId,
  pickIngestStaff,
} from "@/lib/callyzer-identity";
import { COMM } from "@/lib/comm-types";
import { normalizePhone } from "@/lib/phone";

export type CallyzerCallInput = {
  callId: string;
  empNumber: string;
  clientPhone: string;
  direction: "inbound" | "outbound" | null;
  durationSec: number;
  calledAt: string | null;
  outcome?: string | null;
  recordingUrl?: string | null;
  source: "callyzer" | "callyzer_webhook";
  /** When set (personal sync), skip phone→staff lookup which can pick the wrong duplicate line. */
  staffId?: string;
};

type MuaMatch = { id: string; name: string };

function phoneTailMatch(client: string) {
  const tail = normalizePhone(client);
  if (tail.length < 10) return null;
  return "%" + tail;
}

async function resolveIngestContext(
  tx: TransactionSql,
  input: CallyzerCallInput,
): Promise<{ identity: CallyzerIdentity; staff: CallyzerStaffRow } | null> {
  const identity =
    (input.staffId ? await loadCallyzerIdentityByStaffId(tx, input.staffId) : null) ??
    (await loadCallyzerIdentityByPhone(tx, input.empNumber));
  if (!identity || identity.staff.length === 0) return null;

  if (identity.staff.length > 1) {
    console.info(
      `[callyzer-ingest] ${identity.staff.length} role logins share line ${identity.phone ?? "?"}: ${identity.staff.map((r) => `${r.name} (${r.role})`).join(", ")}`,
    );
  }

  return { identity, staff: pickIngestStaff(identity, input.staffId) };
}

async function resolveMuaMatchesForIdentity(
  tx: TransactionSql,
  clientPhone: string,
  identity: CallyzerIdentity,
): Promise<MuaMatch[]> {
  const tail = phoneTailMatch(clientPhone);
  if (!tail) return [];

  const staffIds = identity.staffIds;
  const hasRmScope = identity.hasRegionalRm || identity.hasCommissionRm;

  if (!hasRmScope) {
    return tx<MuaMatch[]>`
      SELECT id, name
      FROM muas
      WHERE regexp_replace(COALESCE(phone, ''), '\D', '', 'g') LIKE ${tail}
         OR regexp_replace(COALESCE(whatsapp, ''), '\D', '', 'g') LIKE ${tail}
      ORDER BY updated_at DESC
    `;
  }

  return tx<MuaMatch[]>`
    SELECT DISTINCT ON (m.id) m.id, m.name
    FROM muas m
    WHERE (
        regexp_replace(COALESCE(m.phone, ''), '\D', '', 'g') LIKE ${tail}
        OR regexp_replace(COALESCE(m.whatsapp, ''), '\D', '', 'g') LIKE ${tail}
      )
      AND (
        m.plan_rm_id = ANY(${staffIds}::uuid[])
        OR m.assigned_rm_id = ANY(${staffIds}::uuid[])
        OR EXISTS (
          SELECT 1 FROM mua_pushes mp
          WHERE mp.mua_id = m.id AND mp.pushed_by = ANY(${staffIds}::uuid[])
        )
        OR EXISTS (
          SELECT 1 FROM lead_events le
          JOIN bride_leads bl ON bl.id = le.lead_id
          WHERE le.mua_id = m.id
            AND (
              bl.assigned_rm_id = ANY(${staffIds}::uuid[])
              OR (
                bl.status = 'commission_rm'::lead_status
                AND (bl.assigned_rm_id IS NULL OR bl.assigned_rm_id = ANY(${staffIds}::uuid[]))
              )
            )
        )
      )
    ORDER BY m.id, m.updated_at DESC
  `;
}

/** Link by where the lead sits in the pipeline today for anyone on this Callyzer line. */
async function resolveLeadForIdentity(
  tx: TransactionSql,
  clientPhone: string,
  identity: CallyzerIdentity,
): Promise<string | null> {
  const tail = phoneTailMatch(clientPhone);
  if (!tail) return null;

  const staffIds = identity.staffIds;

  if (identity.hasFeedbackRm) {
    const [feedbackRow] = await tx<{ id: string }[]>`
      SELECT bl.id FROM bride_leads bl
      WHERE regexp_replace(COALESCE(bl.phone, ''), '\D', '', 'g') LIKE ${tail}
        AND bl.status IN ('expired'::lead_status, 'booked'::lead_status)
        AND NOT EXISTS (
          SELECT 1 FROM lead_events le
          WHERE le.lead_id = bl.id
            AND le.status != 'not_needed'
            AND le.event_date >= CURRENT_DATE
        )
      ORDER BY (bl.assigned_rm_id = ANY(${staffIds}::uuid[])) DESC, bl.updated_at DESC
      LIMIT 1
    `;
    if (feedbackRow) return feedbackRow.id;
  }

  const [row] = await tx<{ id: string }[]>`
    SELECT bl.id
    FROM bride_leads bl
    WHERE regexp_replace(COALESCE(bl.phone, ''), '\D', '', 'g') LIKE ${tail}
      AND bl.status NOT IN ('archived'::lead_status, 'missed'::lead_status)
      AND (
        bl.assigned_rm_id = ANY(${staffIds}::uuid[])
        OR (
          bl.status = 'commission_rm'::lead_status
          AND bl.assigned_rm_id IS NULL
          AND ${identity.hasCommissionRm}
        )
      )
    ORDER BY
      (bl.assigned_rm_id = ANY(${staffIds}::uuid[])) DESC,
      bl.updated_at DESC
    LIMIT 1
  `;
  if (row) return row.id;

  const [fallback] = await tx<{ id: string }[]>`
    SELECT id FROM bride_leads
    WHERE regexp_replace(COALESCE(phone, ''), '\D', '', 'g') LIKE ${tail}
      AND status NOT IN ('archived'::lead_status, 'missed'::lead_status)
    ORDER BY updated_at DESC
    LIMIT 1
  `;
  return fallback?.id ?? null;
}

async function resolveLeadFromMuaForIdentity(
  tx: TransactionSql,
  muaId: string,
  identity: CallyzerIdentity,
): Promise<string | null> {
  const staffIds = identity.staffIds;
  const [row] = await tx<{ leadId: string }[]>`
    SELECT bl.id AS "leadId"
    FROM bride_leads bl
    JOIN lead_events le ON le.lead_id = bl.id
    WHERE le.mua_id = ${muaId}::uuid
      AND bl.status NOT IN ('archived'::lead_status, 'missed'::lead_status)
      AND (
        bl.assigned_rm_id = ANY(${staffIds}::uuid[])
        OR (
          bl.status = 'commission_rm'::lead_status
          AND (bl.assigned_rm_id IS NULL OR bl.assigned_rm_id = ANY(${staffIds}::uuid[]))
        )
      )
    ORDER BY
      (bl.assigned_rm_id = ANY(${staffIds}::uuid[])) DESC,
      bl.updated_at DESC
    LIMIT 1
  `;
  return row?.leadId ?? null;
}

async function resolvePipelineId(
  tx: TransactionSql,
  muaId: string | null,
): Promise<string | null> {
  if (!muaId) return null;
  const [row] = await tx<{ id: string }[]>`
    SELECT p.id
    FROM sales.pipeline p
    WHERE p.mua_id = ${muaId}::uuid
    ORDER BY (p.status = 'active') DESC, p.updated_at DESC
    LIMIT 1
  `;
  return row?.id ?? null;
}

async function resolvePushId(
  tx: TransactionSql,
  leadId: string,
  muaId: string,
): Promise<string | null> {
  const [row] = await tx<{ id: string }[]>`
    SELECT id FROM mua_pushes
    WHERE lead_id = ${leadId}::uuid AND mua_id = ${muaId}::uuid
    ORDER BY updated_at DESC
    LIMIT 1
  `;
  return row?.id ?? null;
}

function buildDescription(
  direction: "inbound" | "outbound" | null,
  durationSec: number,
  source: CallyzerCallInput["source"],
  staffName: string,
  sharedMuaNames: string[] = [],
): string {
  const via = source === "callyzer_webhook" ? "received" : "synced";
  const dir = direction === "inbound" ? "incoming" : "outgoing";
  let desc = `${staffName} — Callyzer ${dir} call ${via} (${Math.max(0, durationSec)} sec)`;
  if (sharedMuaNames.length > 0) {
    desc += ` · Same phone also on: ${sharedMuaNames.join(", ")}`;
  }
  return desc;
}

async function salesCommExists(
  tx: TransactionSql,
  pipelineId: string,
  callId: string,
): Promise<boolean> {
  const [row] = await tx<{ ok: number }[]>`
    SELECT 1 AS ok
    FROM sales.comms_log
    WHERE pipeline_id = ${pipelineId}::uuid
      AND metadata->>'callyzerCallId' = ${callId}
    LIMIT 1
  `;
  return !!row;
}

async function mirrorSalesCallLog(
  tx: TransactionSql,
  params: {
    staffId: string;
    pipelineId: string;
    callId: string;
    direction: "inbound" | "outbound" | null;
    durationSec: number;
    calledAt: string | null;
    outcome: string | null;
    recordingUrl: string | null;
  },
): Promise<void> {
  await tx`
    INSERT INTO sales.call_logs (
      salesperson_id,
      pipeline_id,
      callyzer_call_id,
      direction,
      duration_sec,
      called_at,
      outcome,
      recording_url
    )
    VALUES (
      ${params.staffId}::uuid,
      ${params.pipelineId}::uuid,
      ${params.callId},
      ${params.direction},
      ${params.durationSec},
      ${params.calledAt},
      ${params.outcome},
      ${params.recordingUrl}
    )
    ON CONFLICT (callyzer_call_id) DO NOTHING
  `;
}

async function mirrorSalesComms(
  tx: TransactionSql,
  params: {
    pipelineId: string;
    staffId: string;
    staffName: string;
    description: string;
    source: CallyzerCallInput["source"];
    callId: string;
    clientPhone: string;
    durationSec: number;
    calledAt: string | null;
    outcome: string | null;
    matchedMuaIds: string[];
    matchedMuaNames: string[];
  },
): Promise<void> {
  const metaSource = params.source === "callyzer_webhook" ? "callyzerWebhook" : "callyzer";
  await tx`
    INSERT INTO sales.comms_log (pipeline_id, entry_type, description, actor_id, metadata)
    VALUES (
      ${params.pipelineId}::uuid,
      'callyzerSynced',
      ${params.description},
      ${params.staffId}::uuid,
      ${tx.json({
        source: metaSource,
        callyzerCallId: params.callId,
        clientPhone: normalizePhone(params.clientPhone),
        durationSec: params.durationSec,
        calledAt: params.calledAt,
        outcome: params.outcome,
        staffName: params.staffName,
        matchedMuaIds: params.matchedMuaIds,
        matchedMuaNames: params.matchedMuaNames,
      })}
    )
  `;
}

/** Ingest one Callyzer call into rm.call_logs and fan out to comms / sales mirrors. */
export async function ingestCallyzerCall(
  tx: TransactionSql,
  input: CallyzerCallInput,
): Promise<"inserted" | "skipped" | "unmapped"> {
  const ctx = await resolveIngestContext(tx, input);
  if (!ctx) return "unmapped";
  const { identity, staff } = ctx;

  const muaMatches = await resolveMuaMatchesForIdentity(tx, input.clientPhone, identity);
  const muaId = muaMatches[0]?.id ?? null;
  const matchedMuaIds = muaMatches.map((m) => m.id);
  const matchedMuaNames = muaMatches.map((m) => m.name);
  const leadFromPhone = await resolveLeadForIdentity(tx, input.clientPhone, identity);
  const leadFromMua =
    muaId && !leadFromPhone
      ? await resolveLeadFromMuaForIdentity(tx, muaId, identity)
      : null;

  const leadId = leadFromPhone ?? leadFromMua;
  const pipelineId = await resolvePipelineId(tx, muaId);
  const contactType = leadId ? "lead" : muaId ? "mua" : "unknown";

  const [ins] = await tx<{ id: string }[]>`
    INSERT INTO call_logs (
      staff_id,
      callyzer_call_id,
      client_phone,
      direction,
      duration_sec,
      called_at,
      outcome,
      recording_url,
      lead_id,
      mua_id,
      pipeline_id,
      contact_type,
      source
    )
    VALUES (
      ${staff.id}::uuid,
      ${input.callId},
      ${normalizePhone(input.clientPhone)},
      ${input.direction},
      ${Math.max(0, input.durationSec)},
      ${input.calledAt},
      ${input.outcome?.trim() || null},
      ${input.recordingUrl || null},
      ${leadId}::uuid,
      ${muaId}::uuid,
      ${pipelineId}::uuid,
      ${contactType},
      ${input.source}
    )
    ON CONFLICT (callyzer_call_id) DO NOTHING
    RETURNING id
  `;
  if (!ins) {
    if (leadId) {
      await tx`
        UPDATE call_logs
        SET
          lead_id = COALESCE(lead_id, ${leadId}::uuid),
          mua_id = COALESCE(mua_id, ${muaId}::uuid),
          pipeline_id = COALESCE(pipeline_id, ${pipelineId}::uuid),
          contact_type = CASE
            WHEN contact_type = 'unknown' AND ${leadId}::uuid IS NOT NULL THEN 'lead'
            WHEN contact_type = 'unknown' AND ${muaId}::uuid IS NOT NULL THEN 'mua'
            ELSE contact_type
          END
        WHERE callyzer_call_id = ${input.callId}
          AND (lead_id IS NULL OR contact_type = 'unknown')
      `;
    }
    return "skipped";
  }

  const baseMeta = {
    source: input.source === "callyzer_webhook" ? "callyzerWebhook" : "callyzer",
    callyzerCallId: input.callId,
    clientPhone: normalizePhone(input.clientPhone),
    durationSec: Math.max(0, input.durationSec),
    calledAt: input.calledAt,
    outcome: input.outcome ?? null,
    direction: input.direction,
    recordingUrl: input.recordingUrl ?? null,
    contactType,
    staffName: staff.name,
    matchedMuaIds,
    matchedMuaNames,
  };

  const commMuas = muaMatches.length > 0 ? muaMatches : muaId ? [{ id: muaId, name: "" }] : [];

  for (const mua of commMuas) {
    const sharedNames = matchedMuaNames.filter((n) => n !== mua.name);
    const description = buildDescription(
      input.direction,
      input.durationSec,
      input.source,
      staff.name,
      sharedNames,
    );

    if (leadId) {
      const pushId =
        mua.id && leadId ? await resolvePushId(tx, leadId, mua.id) : null;
      await appendComm(tx, {
        leadId,
        entryType: COMM.callyzerSynced,
        description,
        actorId: staff.id,
        muaId: mua.id,
        metadata: pushId ? { ...baseMeta, pushId } : baseMeta,
      });
    }

    const pipelineId = await resolvePipelineId(tx, mua.id);
    if (pipelineId) {
      const salesCallMirrored = await tx<{ id: string }[]>`
        SELECT id FROM sales.call_logs WHERE callyzer_call_id = ${input.callId} LIMIT 1
      `;
      if (salesCallMirrored.length === 0) {
        await mirrorSalesCallLog(tx, {
          staffId: staff.id,
          pipelineId,
          callId: input.callId,
          direction: input.direction,
          durationSec: input.durationSec,
          calledAt: input.calledAt,
          outcome: input.outcome?.trim() || null,
          recordingUrl: input.recordingUrl ?? null,
        });
      }
      if (!(await salesCommExists(tx, pipelineId, input.callId))) {
        await mirrorSalesComms(tx, {
          pipelineId,
          staffId: staff.id,
          staffName: staff.name,
          description,
          source: input.source,
          callId: input.callId,
          clientPhone: input.clientPhone,
          durationSec: input.durationSec,
          calledAt: input.calledAt,
          outcome: input.outcome ?? null,
          matchedMuaIds,
          matchedMuaNames,
        });
      }
    }
  }

  if (commMuas.length === 0 && leadId) {
    const description = buildDescription(
      input.direction,
      input.durationSec,
      input.source,
      staff.name,
      [],
    );
    await appendComm(tx, {
      leadId,
      entryType: COMM.callyzerSynced,
      description,
      actorId: staff.id,
      muaId: null,
      metadata: baseMeta,
    });
  }

  return "inserted";
}
