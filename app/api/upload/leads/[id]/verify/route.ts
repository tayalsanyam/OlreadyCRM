import { NextResponse } from "next/server";
import {
  withTransaction,
  appendComm,
  insertAuditLog,
  sql,
} from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { toDbTier } from "@/lib/db-mappers";
import { COMM } from "@/lib/comm-types";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import {
  LEAD_EXIT_LABELS,
  UPLOADER_NI_HANDOVER_VERIFY,
  type VerifyOutcome,
  toDbExitMarkedByRole,
} from "@/lib/lead-exit";
import {
  deriveLeadPrimaryRegion,
  leadEventLocationSummary,
  resolveRegionFromLocation,
  uniqueRegions,
} from "@/lib/ceremony-region";
import { loadBudgetTierConfig } from "@/lib/budget-tier-db";
import { completeUploaderReviewTasksForLead } from "@/lib/uploader-review-task";
import { refreshLeadPhase } from "@/lib/lead-phase";
import { syncFeedbackReferralFromLeadVerification } from "@/lib/feedback-referral-on-verify";
import { resolveLeadBudgetTier, sumCeremonyBudgets } from "@/lib/budget-tier";
import { resolveLeadEventDate } from "@/lib/lead-event-date";
import { upsertMakeupLookProfile } from "@/lib/makeup-look-db";
import type { MakeupLookProfileInput } from "@/lib/makeup-look";
import {
  canClosePendingVerification,
  getVerificationConnectAttempts,
} from "@/lib/lead-verification-connect";
import { MAX_VERIFICATION_CONNECT_ATTEMPTS } from "@/lib/lead-uploader-config";
import {
  applyPostVerifyRouting,
  resolveVerifyRoutingFlags,
  type LeadRouting,
} from "@/lib/lead-verify-routing";
import type { BrideLead, CityRegion, Region } from "@/lib/types";

type TalkedTo = "bride" | "family" | "both";

type CeremonyInput = {
  name: string;
  budget: number | null;
  date?: string | null;
  description?: string | null;
  location?: string | null;
  region?: Region | null;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRoles(["leadUploader", "admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const { session } = auth;
  const payload = (await request.json().catch(() => ({}))) as Partial<BrideLead> & {
    ceremonies?: CeremonyInput[];
    verifiedViaCall?: boolean;
    verifiedViaWhatsapp?: boolean;
    talkedTo?: TalkedTo;
    portalOnly?: boolean;
    portalPushed?: boolean;
    portalCap?: number | null;
    routing?: LeadRouting;
    commissionRmId?: string | null;
    verifyOutcome?: VerifyOutcome;
    exitNote?: string | null;
    assignmentRegion?: Region | null;
    makeupLook?: MakeupLookProfileInput;
  };

  const markNotInterested = payload.verifyOutcome === "not_interested_archive";
  const markNotAnswering = payload.verifyOutcome === "not_answering_archive";
  const exitNote = payload.exitNote?.trim() ?? "";
  const hasContactChecklist =
    !!(payload.verifiedViaCall || payload.verifiedViaWhatsapp) && !!payload.talkedTo;
  const closingWithoutContact =
    (markNotInterested || markNotAnswering) && !hasContactChecklist;

  if (markNotInterested && exitNote.length < 5) {
    return NextResponse.json(
      {
        data: null,
        error: "Add a short note why the lead is not interested (min 5 characters)",
      },
      { status: 400 }
    );
  }
  if (markNotAnswering && exitNote.length < 5) {
    return NextResponse.json(
      {
        data: null,
        error: `Add a short note for ${LEAD_EXIT_LABELS.notAnswering.toLowerCase()} (min 5 characters)`,
      },
      { status: 400 }
    );
  }

  if (closingWithoutContact) {
    const attempts = USE_MOCK
      ? mockStore.getVerificationConnectAttempts(id)
      : await getVerificationConnectAttempts(sql, id);
    if (!canClosePendingVerification(attempts)) {
      return NextResponse.json(
        {
          data: null,
          error: `Log at least ${MAX_VERIFICATION_CONNECT_ATTEMPTS} connect attempts before closing as not interested or archived (${attempts}/${MAX_VERIFICATION_CONNECT_ATTEMPTS} so far)`,
        },
        { status: 400 }
      );
    }
  }

  if (!hasContactChecklist && !closingWithoutContact) {
    if (!payload.verifiedViaCall && !payload.verifiedViaWhatsapp) {
      return NextResponse.json(
        { data: null, error: "Confirm verification via call and/or WhatsApp" },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { data: null, error: "Select who you spoke with" },
      { status: 400 }
    );
  }

  const talkedLabel: Record<TalkedTo, string> = {
    bride: "bride",
    family: "family member",
    both: "bride and family member",
  };
  const channels = [
    payload.verifiedViaCall ? "call" : null,
    payload.verifiedViaWhatsapp ? "WhatsApp" : null,
  ]
    .filter(Boolean)
    .join(", ");

  const ceremonies: CeremonyInput[] = payload.ceremonies?.length
    ? payload.ceremonies
    : [{ name: "Wedding", budget: null }];
  const routing: LeadRouting =
    payload.routing ??
    (payload.portalOnly ? "portal" : payload.portalPushed ? "both" : "rm");
  const { portalOnly, portalPushed, useCommission } = resolveVerifyRoutingFlags(routing);

  if (useCommission && !markNotInterested && !markNotAnswering && !payload.commissionRmId?.trim()) {
    return NextResponse.json(
      { data: null, error: "Select a Commission RM" },
      { status: 400 }
    );
  }

  const skipCeremonyValidation = closingWithoutContact || markNotAnswering;

  const leadEventDate = skipCeremonyValidation
    ? payload.eventDate ?? null
    : resolveLeadEventDate(
        ceremonies.map((c) => ({ date: c.date })),
        payload.eventDate
      );
  if (!skipCeremonyValidation) {
    if (!leadEventDate || ceremonies.some((c) => !c.date?.trim())) {
      return NextResponse.json(
        { data: null, error: "Each ceremony must have a date before verification" },
        { status: 400 }
      );
    }
    if (ceremonies.some((c) => !c.location?.trim())) {
      return NextResponse.json(
        { data: null, error: "Each ceremony must have a location (city / venue)" },
        { status: 400 }
      );
    }
    if (!markNotInterested) {
      const ceremonyTotal = sumCeremonyBudgets(ceremonies);
      if (ceremonyTotal <= 0) {
        return NextResponse.json(
          {
            data: null,
            error: "Enter a budget for each ceremony — tier is set from total event budgets",
          },
          { status: 400 }
        );
      }
    }
  }

  if (USE_MOCK) {
    const lead = mockStore.verifyLead(
      id,
      {
        ...payload,
        ceremonies: ceremonies.map((c) => c.name),
        ceremonyBudgets: ceremonies,
        verifiedViaCall: payload.verifiedViaCall,
        verifiedViaWhatsapp: payload.verifiedViaWhatsapp,
        talkedTo: payload.talkedTo,
        portalOnly,
        portalPushed: !!payload.portalPushed,
        portalCap: payload.portalCap ?? null,
        verifyOutcome: payload.verifyOutcome,
        exitNote: exitNote || null,
        assignmentRegion: payload.assignmentRegion ?? null,
      },
      session.name,
      session.userId
    );
    if (!lead) {
      return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ data: lead, error: null });
  }

  try {
  await withTransaction(async (tx) => {
    if (markNotAnswering) {
      await tx`
        UPDATE bride_leads SET
          status = 'archived',
          hostile_note = ${exitNote},
          exit_marked_by_role = ${toDbExitMarkedByRole("leadUploader")},
          updated_at = NOW()
        WHERE id = ${id}::uuid
      `;
      await appendComm(tx, {
        leadId: id,
        entryType: COMM.hostileFlagged,
        description: `${LEAD_EXIT_LABELS.notAnswering} during verification (after connect attempts): ${exitNote}`,
        actorId: session.userId,
      });
      await insertAuditLog(tx, {
        tableName: "bride_leads",
        recordId: id,
        action: "verify_not_answering",
        actorId: session.userId,
        changes: { exitNote },
      });
      await syncFeedbackReferralFromLeadVerification(
        tx,
        id,
        "not_answering",
        session.userId
      );
      await refreshLeadPhase(tx, id);
      return;
    }

    if (markNotInterested && closingWithoutContact) {
      await tx`
        UPDATE bride_leads SET
          verified = true,
          verified_at = NOW(),
          verified_by = ${session.userId}::uuid,
          status = 'archived'::lead_status,
          hostile_note = NULL,
          assigned_rm_id = NULL,
          assignment_date = NULL,
          shifted_at = NULL,
          handover_reason = ${UPLOADER_NI_HANDOVER_VERIFY},
          uploader_confirmed_at = NOW(),
          uploader_confirmed_by = ${session.userId}::uuid,
          uploader_confirmation = 'confirmed_ni',
          exit_marked_by_role = ${toDbExitMarkedByRole("leadUploader")},
          portal_only = false,
          portal_pushed = false,
          updated_at = NOW()
        WHERE id = ${id}::uuid
      `;
      await appendComm(tx, {
        leadId: id,
        entryType: COMM.note,
        description: `${LEAD_EXIT_LABELS.notInterestedAndArchive} during verification: ${exitNote}`,
        actorId: session.userId,
      });
      await appendComm(tx, {
        leadId: id,
        entryType: COMM.leadVerified,
        description: `${LEAD_EXIT_LABELS.notInterested} — archived after ${MAX_VERIFICATION_CONNECT_ATTEMPTS} connect attempts without contact: ${exitNote}`,
        actorId: session.userId,
        metadata: {
          verifyOutcome: "not_interested_archive",
          closedWithoutContact: true,
        },
      });
      await insertAuditLog(tx, {
        tableName: "bride_leads",
        recordId: id,
        action: "verify_not_interested",
        actorId: session.userId,
        changes: { exitNote },
      });
      await completeUploaderReviewTasksForLead(tx, id, session.userId);
      await syncFeedbackReferralFromLeadVerification(
        tx,
        id,
        "not_interested",
        session.userId
      );
      await refreshLeadPhase(tx, id);
      return;
    }

    const tierConfig = await loadBudgetTierConfig(tx);
    const cityRows = await tx<CityRegion[]>`
      SELECT city, region::text AS region FROM city_regions ORDER BY city
    `;
    const [existingLead] = await tx<{ region: string | null; city: string }[]>`
      SELECT region::text AS region, city FROM bride_leads WHERE id = ${id}::uuid
    `;
    const uploadFallbackRegion =
      (payload.assignmentRegion ??
        payload.region ??
        (existingLead?.region as Region | undefined) ??
        (payload.city
          ? resolveRegionFromLocation(payload.city, cityRows)
          : existingLead?.city
            ? resolveRegionFromLocation(existingLead.city, cityRows)
            : null)) ??
      null;

    const resolvedCeremonies = ceremonies.map((c) => {
      const location = c.location?.trim() ?? "";
      const region =
        c.region ??
        resolveRegionFromLocation(location, cityRows) ??
        (payload.region as Region | undefined) ??
        null;
      return { ...c, location, region };
    });

    if (resolvedCeremonies.some((c) => !c.region)) {
      throw new Error(
        "Could not determine region for each ceremony — pick a listed city or set region manually"
      );
    }

    const regionSet = uniqueRegions(resolvedCeremonies.map((c) => c.region));
    if (regionSet.length > 1 && !payload.assignmentRegion) {
      throw new Error(
        "Ceremonies span multiple regions — select the main region for RM assignment"
      );
    }

    const { region: leadRegion } = deriveLeadPrimaryRegion({
      ceremonies: resolvedCeremonies.map((c) => ({
        name: c.name,
        date: c.date,
        location: c.location,
        region: c.region,
      })),
      assignmentRegion: payload.assignmentRegion ?? null,
      fallbackRegion: uploadFallbackRegion,
    });

    const leadLocationSummary = leadEventLocationSummary(
      resolvedCeremonies.map((c) => ({
        name: c.name,
        location: c.location,
      }))
    );

    if (payload.brideName) {
      await tx`UPDATE bride_leads SET bride_name = ${payload.brideName} WHERE id = ${id}::uuid`;
    }
    if (payload.phone) {
      await tx`UPDATE bride_leads SET phone = ${payload.phone} WHERE id = ${id}::uuid`;
    }
    if (payload.email !== undefined) {
      await tx`UPDATE bride_leads SET email = ${payload.email} WHERE id = ${id}::uuid`;
    }
    if (payload.city) {
      await tx`UPDATE bride_leads SET city = ${payload.city} WHERE id = ${id}::uuid`;
    }
    await tx`
      UPDATE bride_leads SET
        region = ${leadRegion}::region,
        event_location = ${leadLocationSummary || payload.eventLocation?.trim() || null}
      WHERE id = ${id}::uuid
    `;
    await tx`UPDATE bride_leads SET event_date = ${leadEventDate}::date WHERE id = ${id}::uuid`;

    const { totalBudget, tier } = resolveLeadBudgetTier(
      resolvedCeremonies,
      tierConfig.limits
    );
    if (totalBudget > 0) {
      await tx`
        UPDATE bride_leads SET
          budget_amount = ${totalBudget},
          budget_tier = ${toDbTier(tier)}::budget_tier
        WHERE id = ${id}::uuid
      `;
    }

    if (payload.source !== undefined) {
      await tx`UPDATE bride_leads SET source = ${payload.source} WHERE id = ${id}::uuid`;
    }

    const portalPushed = !!payload.portalPushed;
    const [prior] = await tx<{ wasHostile: boolean; handoverReason: string | null; status: string }[]>`
      SELECT
        (hostile_note IS NOT NULL) AS was_hostile,
        handover_reason AS "handoverReason",
        status::text AS status
      FROM bride_leads WHERE id = ${id}::uuid
    `;
    const wasHostile = prior?.wasHostile ?? false;
    const wasNiExit =
      (prior?.handoverReason ?? "").toLowerCase().includes("not interested") ||
      prior?.status === "archived" ||
      prior?.status === "commission_rm";

    await tx`
      UPDATE bride_leads SET
        verified = true,
        verified_at = NOW(),
        verified_by = ${session.userId}::uuid,
        status = ${markNotInterested ? "archived" : "verified"}::lead_status,
        hostile_note = NULL,
        assigned_rm_id = NULL,
        assignment_date = NULL,
        shifted_at = NULL,
        handover_reason = ${markNotInterested ? UPLOADER_NI_HANDOVER_VERIFY : null},
        uploader_confirmed_at = CASE WHEN ${markNotInterested} THEN NOW() ELSE uploader_confirmed_at END,
        uploader_confirmed_by = CASE
          WHEN ${markNotInterested} THEN ${session.userId}::uuid
          ELSE uploader_confirmed_by
        END,
        uploader_confirmation = CASE
          WHEN ${markNotInterested} THEN 'confirmed_ni'
          WHEN ${wasNiExit} AND NOT ${markNotInterested} THEN 'reopen'
          ELSE uploader_confirmation
        END,
        exit_marked_by_role = CASE
          WHEN ${markNotInterested} THEN ${toDbExitMarkedByRole("leadUploader")}
          WHEN ${wasNiExit} AND NOT ${markNotInterested} THEN NULL
          ELSE exit_marked_by_role
        END,
        portal_only = ${portalOnly},
        portal_pushed = ${portalPushed},
        portal_cap = ${payload.portalCap ?? null},
        portal_pushed_at = CASE WHEN ${portalPushed} THEN COALESCE(portal_pushed_at, NOW()) ELSE portal_pushed_at END,
        updated_at = NOW()
      WHERE id = ${id}::uuid
    `;

    const ceremonyNames = ceremonies.map((c) => c.name);
    const existingEvents = await tx<{ id: string; ceremonyType: string }[]>`
      SELECT id, ceremony_type FROM lead_events WHERE lead_id = ${id}::uuid
    `;

    for (const c of resolvedCeremonies) {
      const match = existingEvents.find(
        (e: { id: string; ceremonyType: string }) => e.ceremonyType === c.name
      );
      const ceremonyDate = c.date ?? leadEventDate;
      if (match) {
        await tx`
          UPDATE lead_events SET
            budget_amount = ${c.budget},
            event_date = ${ceremonyDate}::date,
            event_location = ${c.location},
            region = ${c.region}::region,
            description = ${c.description ?? null},
            updated_at = NOW()
          WHERE id = ${match.id}::uuid
        `;
      } else {
        await tx`
          INSERT INTO lead_events (
            lead_id, ceremony_type, event_date, event_location, region,
            status, budget_amount, description
          )
          VALUES (
            ${id}::uuid,
            ${c.name},
            ${ceremonyDate}::date,
            ${c.location},
            ${c.region}::region,
            'open',
            ${c.budget},
            ${c.description ?? null}
          )
        `;
      }
    }

    for (const ev of existingEvents as { id: string; ceremonyType: string }[]) {
      if (!ceremonyNames.includes(ev.ceremonyType)) {
        await tx`DELETE FROM lead_events WHERE id = ${ev.id}::uuid`;
      }
    }

    if (payload.verifiedViaCall) {
      await appendComm(tx, {
        leadId: id,
        entryType: COMM.callLogged,
        description: "Verification call completed",
        actorId: session.userId,
      });
    }
    if (payload.verifiedViaWhatsapp) {
      await appendComm(tx, {
        leadId: id,
        entryType: COMM.whatsappLogged,
        description: "Verification WhatsApp confirmed",
        actorId: session.userId,
      });
    }

    if (markNotInterested) {
      await appendComm(tx, {
        leadId: id,
        entryType: COMM.note,
        description: `${LEAD_EXIT_LABELS.notInterestedAndArchive} during verification: ${exitNote}`,
        actorId: session.userId,
      });
      const niDescription = hasContactChecklist
        ? `Contact confirmed by ${session.name} via ${channels}. Spoke with ${talkedLabel[payload.talkedTo!]}. ${LEAD_EXIT_LABELS.notInterested} — archived.`
        : `${LEAD_EXIT_LABELS.notInterested} — archived after ${MAX_VERIFICATION_CONNECT_ATTEMPTS} connect attempts without contact: ${exitNote}`;
      await appendComm(tx, {
        leadId: id,
        entryType: COMM.leadVerified,
        description: niDescription,
        actorId: session.userId,
        metadata: {
          verifiedViaCall: !!payload.verifiedViaCall,
          verifiedViaWhatsapp: !!payload.verifiedViaWhatsapp,
          talkedTo: payload.talkedTo ?? null,
          verifyOutcome: "not_interested_archive",
          closedWithoutContact: closingWithoutContact,
        },
      });
    } else {
      const verifyPrefix = wasHostile
        ? `Re-verified after ${LEAD_EXIT_LABELS.notAnswering.toLowerCase()} — previous RM/Commission exit was incorrect`
        : wasNiExit
          ? "Re-verified after RM/Commission exit — previous exit was incorrect"
          : "Lead verified";
      await appendComm(tx, {
        leadId: id,
        entryType: COMM.leadVerified,
        description: `${verifyPrefix} by ${session.name} via ${channels}. Spoke with ${talkedLabel[payload.talkedTo!]}.`,
        actorId: session.userId,
        metadata: {
          verifiedViaCall: !!payload.verifiedViaCall,
          verifiedViaWhatsapp: !!payload.verifiedViaWhatsapp,
          talkedTo: payload.talkedTo,
          portalOnly,
          reVerifiedFromHostile: wasHostile,
        },
      });
    }

    if (!markNotInterested && !markNotAnswering) {
      await applyPostVerifyRouting(tx, {
        leadId: id,
        region: leadRegion,
        actorId: session.userId,
        routing,
        commissionRmId: payload.commissionRmId,
      });
    }

    await insertAuditLog(tx, {
      tableName: "bride_leads",
      recordId: id,
      action: markNotInterested ? "verify_not_interested" : "verify",
      actorId: session.userId,
      changes: markNotInterested ? { exitNote } : undefined,
    });

    if (payload.makeupLook) {
      await upsertMakeupLookProfile(tx, id, payload.makeupLook);
    }

    await completeUploaderReviewTasksForLead(tx, id, session.userId);
    await syncFeedbackReferralFromLeadVerification(
      tx,
      id,
      markNotInterested ? "not_interested" : "verified",
      session.userId
    );
    await refreshLeadPhase(tx, id);
  });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Verification failed";
    return NextResponse.json({ data: null, error: message }, { status: 400 });
  }

  return NextResponse.json({
    data: {
      ok: true,
      outcome: markNotAnswering
        ? "not_answering"
        : markNotInterested
          ? "not_interested"
          : "verified",
    },
    error: null,
  });
}
