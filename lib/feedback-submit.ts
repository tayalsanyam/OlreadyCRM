import { sql, withTransaction, generateTaskDisplayId } from "@/db/index";
import {
  feedbackTerminalOutcomeSql,
  isLeadFeedbackEligible,
} from "@/lib/feedback-eligibility";
import {
  FEEDBACK_ATTEMPT_KIND_LABELS,
  FEEDBACK_MAX_UNREACHABLE_ATTEMPTS,
  type FeedbackUnreachableAttemptKind,
} from "@/lib/feedback-constants";
import { createCareTicketFromNegativeFeedback } from "@/lib/feedback-care-ticket";
import { parseReferralsFromNote } from "@/lib/feedback-referral-capture";
import { scheduleReferralPhoneFollowUp } from "@/lib/feedback-referral-intake";
import { cancelPendingFeedbackTasksForLead } from "@/lib/feedback-tasks";
import { scheduleUploaderFeedbackReferralTask } from "@/lib/uploader-referral-task";
import type {
  FeedbackConnectionStatus,
  FeedbackEngageAgain,
  FeedbackMuaType,
  FeedbackServiceSentiment,
} from "@/lib/types";
import { resolveFeedbackEventId } from "@/lib/feedback-booking-events";
import { normalizePhoneDigits } from "@/lib/validation";
import type { TransactionSql } from "@/db/index";

function attemptNote(
  kind: FeedbackUnreachableAttemptKind,
  note?: string | null
): string {
  const label = FEEDBACK_ATTEMPT_KIND_LABELS[kind];
  const extra = note?.trim();
  return extra ? `${label}: ${extra}` : label;
}

async function assertLeadFeedbackStillOpen(
  leadId: string,
  tx: TransactionSql,
): Promise<void> {
  const [row] = await tx<{ ok: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM lead_feedback lf
      WHERE lf.lead_id = ${leadId}::uuid
        AND ${tx.unsafe(feedbackTerminalOutcomeSql("lf"))}
    ) AS ok
  `;
  if (row?.ok) {
    throw new Error("Feedback is already completed for this lead");
  }
}

export async function countUnreachableFeedbackAttempts(
  leadId: string,
  tx?: TransactionSql,
): Promise<number> {
  const query = tx ?? sql;
  const [row] = await query<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM lead_feedback
    WHERE lead_id = ${leadId}::uuid
      AND connection_status = 'not_answered'
  `;
  return row?.count ?? 0;
}

async function logUnreachableFeedbackAttempt(
  tx: TransactionSql,
  opts: {
    leadId: string;
    staffId: string;
    followUpAt: string;
    attemptKind: FeedbackUnreachableAttemptKind;
    followUpNote?: string | null;
  }
): Promise<void> {
  const note = attemptNote(opts.attemptKind, opts.followUpNote);
  await assertLeadFeedbackStillOpen(opts.leadId, tx);
  await tx`
    INSERT INTO lead_feedback (
      lead_id, mua_type, connection_status, submitted_by,
      follow_up_requested, follow_up_at, follow_up_note, improvements_note
    ) VALUES (
      ${opts.leadId}::uuid,
      'olready',
      'not_answered',
      ${opts.staffId}::uuid,
      true,
      ${opts.followUpAt}::date,
      ${note},
      ${note}
    )
  `;
}

export async function scheduleFeedbackCallback(
  leadId: string,
  staffId: string,
  followUpAt: string,
  followUpNote?: string | null,
  attemptKind: FeedbackUnreachableAttemptKind = "busy"
): Promise<string> {
  return withTransaction(async (tx) => {
    await logUnreachableFeedbackAttempt(tx, {
      leadId,
      staffId,
      followUpAt,
      attemptKind,
      followUpNote,
    });

    await cancelPendingFeedbackTasksForLead(tx, leadId, "feedback_follow_up");

    const taskDisplayId = await generateTaskDisplayId(tx);
    const [task] = await tx<{ id: string }[]>`
      INSERT INTO rm_tasks (
        display_id, staff_id, lead_id, task_type, title, due_date, status
      ) VALUES (
        ${taskDisplayId},
        ${staffId}::uuid,
        ${leadId}::uuid,
        'feedback_follow_up',
        ${"Feedback call-back"},
        ${followUpAt}::date,
        'pending'
      )
      RETURNING id
    `;
    return task!.id;
  });
}

export async function closeFeedbackNoContact(
  leadId: string,
  staffId: string,
  note?: string | null
): Promise<string> {
  return withTransaction(async (tx) => {
    const attempts = await countUnreachableFeedbackAttempts(leadId, tx);
    if (attempts < FEEDBACK_MAX_UNREACHABLE_ATTEMPTS) {
      throw new Error(
        `Need ${FEEDBACK_MAX_UNREACHABLE_ATTEMPTS} call-back attempts before closing as no contact`
      );
    }

    const [connected] = await tx<{ ok: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM lead_feedback
        WHERE lead_id = ${leadId}::uuid AND connection_status = 'connected'
      ) AS ok
    `;
    if (connected?.ok) {
      throw new Error("Lead already has connected feedback");
    }

    await cancelPendingFeedbackTasksForLead(tx, leadId);

    const text =
      note?.trim() ||
      `Closed — no contact after ${FEEDBACK_MAX_UNREACHABLE_ATTEMPTS} call-back attempts`;

    const [row] = await tx<{ id: string }[]>`
      INSERT INTO lead_feedback (
        lead_id, mua_type, connection_status, submitted_by, improvements_note
      ) VALUES (
        ${leadId}::uuid,
        'olready',
        'closed_no_contact',
        ${staffId}::uuid,
        ${text}
      )
      RETURNING id
    `;
    return row!.id;
  });
}

export async function logFeedbackFollowUpAttempt(
  leadId: string,
  staffId: string,
  followUpAt: string,
  note?: string | null,
  attemptKind: FeedbackUnreachableAttemptKind = "callback"
): Promise<void> {
  await withTransaction(async (tx) => {
    await logUnreachableFeedbackAttempt(tx, {
      leadId,
      staffId,
      followUpAt,
      attemptKind,
      followUpNote: note,
    });
  });
}

export type FeedbackSubmitBody = {
  connectionStatus: FeedbackConnectionStatus;
  eventId?: string | null;
  muaType?: FeedbackMuaType;
  olreadyMuaId?: string | null;
  nonOlreadyMuaName?: string | null;
  prospectPhone?: string | null;
  prospectInsta?: string | null;
  prospectCity?: string | null;
  serviceSentiment?: FeedbackServiceSentiment | null;
  negativeReasons?: string[];
  negativeReasonOther?: string | null;
  valuableOptions?: boolean | null;
  recommendationsNote?: string | null;
  referralsNote?: string | null;
  referencesNote?: string | null;
  improvementsNote?: string | null;
  olreadyServiceNote?: string | null;
  muaServiceNote?: string | null;
  engageAgain?: FeedbackEngageAgain | null;
  engageAgainNote?: string | null;
  followUpRequested?: boolean;
  followUpAt?: string | null;
  followUpNote?: string | null;
  referrals?: { name: string; phone: string }[];
  olreadyRating?: number | null;
  muaRating?: number | null;
};

export async function submitLeadFeedback(
  leadId: string,
  staffId: string,
  body: FeedbackSubmitBody
): Promise<{
  feedbackId: string;
  followUpTaskId: string | null;
  referralFollowUpTaskId: string | null;
  careTicketId: string | null;
}> {
  let followUpTaskId: string | null = null;
  let referralFollowUpTaskId: string | null = null;
  let careTicketId: string | null = null;

  const feedbackId = await withTransaction(async (tx) => {
    const muaType = body.muaType ?? "olready";
    const connected = body.connectionStatus === "connected";

    if (connected && muaType === "olready" && !body.olreadyMuaId) {
      throw new Error("Select the Olready MUA she booked with");
    }
    if (connected && muaType === "non_olready" && !body.nonOlreadyMuaName?.trim()) {
      throw new Error("Enter the outside MUA name");
    }

    const eventId = await resolveFeedbackEventId(tx, leadId, {
      eventId: body.eventId,
      connected,
      muaType,
    });

    if (connected && muaType === "olready" && body.olreadyMuaId) {
      const [dup] = await tx<{ ok: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM lead_feedback
          WHERE lead_id = ${leadId}::uuid
            AND olready_mua_id = ${body.olreadyMuaId}::uuid
            AND connection_status = 'connected'
            AND mua_type = 'olready'
            AND (
              (${eventId}::uuid IS NULL AND event_id IS NULL)
              OR event_id = ${eventId}::uuid
            )
        ) AS ok
      `;
      if (dup?.ok) {
        throw new Error(
          "Connected feedback already recorded for this ceremony and MUA"
        );
      }
    }

    const [row] = await tx<{ id: string }[]>`
      INSERT INTO lead_feedback (
        lead_id, event_id, mua_type, olready_mua_id, non_olready_mua_name,
        valuable_options, references_note, improvements_note,
        connection_status, submitted_by,
        service_sentiment, negative_reasons, negative_reason_other,
        recommendations_note, referrals_note,
        olready_service_note, mua_service_note,
        engage_again, engage_again_note,
        follow_up_requested, follow_up_at, follow_up_note,
        olready_rating, mua_rating
      ) VALUES (
        ${leadId}::uuid,
        ${eventId}::uuid,
        ${muaType},
        ${body.olreadyMuaId ?? null}::uuid,
        ${body.nonOlreadyMuaName?.trim() ?? null},
        ${body.valuableOptions ?? null},
        ${body.referencesNote?.trim() ?? body.referralsNote?.trim() ?? null},
        ${body.improvementsNote?.trim() ?? body.negativeReasonOther?.trim() ?? null},
        ${body.connectionStatus},
        ${staffId}::uuid,
        ${body.serviceSentiment ?? null},
        ${body.negativeReasons ?? []}::text[],
        ${body.negativeReasonOther?.trim() ?? null},
        ${body.recommendationsNote?.trim() ?? null},
        ${body.referralsNote?.trim() ?? null},
        ${body.olreadyServiceNote?.trim() ?? null},
        ${body.muaServiceNote?.trim() ?? null},
        ${body.engageAgain ?? null},
        ${body.engageAgainNote?.trim() ?? null},
        ${Boolean(body.followUpRequested)},
        ${body.followUpAt ?? null}::date,
        ${body.followUpNote?.trim() ?? null},
        ${body.olreadyRating ?? null},
        ${body.muaRating ?? null}
      )
      RETURNING id
    `;

    const id = row!.id;

    if (
      connected &&
      muaType === "non_olready" &&
      body.nonOlreadyMuaName?.trim()
    ) {
      const phone = body.prospectPhone?.trim()
        ? normalizePhoneDigits(body.prospectPhone)
        : null;
      const insta = body.prospectInsta?.trim() || null;
      const city = body.prospectCity?.trim() || null;
      const hasContact = Boolean(phone || insta || city);
      await tx`
        INSERT INTO mua_prospects (
          lead_id, non_olready_mua_name, insta_id, phone, city,
          status, feedback_id
        ) VALUES (
          ${leadId}::uuid,
          ${body.nonOlreadyMuaName.trim()},
          ${insta},
          ${phone},
          ${city},
          ${hasContact ? "collected" : "pending"},
          ${id}::uuid
        )
      `;
    }

    const referralsFromNote = parseReferralsFromNote(body.referralsNote ?? "");
    const structured = body.referrals ?? [];
    const referralRows: {
      name: string;
      phone: string | null;
      captureType: "structured" | "note";
      notes: string | null;
    }[] = [];

    const seenPhones = new Set<string>();
    for (const ref of [...structured, ...referralsFromNote]) {
      const name = ref.name?.trim();
      const phone = ref.phone?.trim();
      if (!name || !phone) continue;
      const digits = normalizePhoneDigits(phone);
      if (seenPhones.has(digits)) continue;
      seenPhones.add(digits);
      referralRows.push({
        name,
        phone: digits,
        captureType: "structured",
        notes: null,
      });
    }

    const noteText = body.referralsNote?.trim();
    if (noteText && referralRows.length === 0) {
      referralFollowUpTaskId = await scheduleReferralPhoneFollowUp(tx, {
        leadId,
        staffId,
        feedbackId: id,
        note: noteText,
        dueDate: body.followUpAt,
      });
    }

    const [sourceLead] = await tx<{ displayId: string; brideName: string }[]>`
      SELECT display_id AS "displayId", bride_name AS "brideName"
      FROM bride_leads
      WHERE id = ${leadId}::uuid
    `;

    for (const ref of referralRows) {
      const [referralRow] = await tx<{ id: string }[]>`
        INSERT INTO feedback_referrals (
          source_lead_id, feedback_id, referral_name, referral_phone,
          captured_by, capture_type, notes
        ) VALUES (
          ${leadId}::uuid,
          ${id}::uuid,
          ${ref.name},
          ${ref.phone},
          ${staffId}::uuid,
          ${ref.captureType},
          ${ref.notes}
        )
        RETURNING id
      `;
      if (referralRow?.id && sourceLead) {
        await scheduleUploaderFeedbackReferralTask(tx, {
          referralId: referralRow.id,
          referralName: ref.name,
          referralPhone: ref.phone!,
          sourceLeadId: leadId,
          sourceDisplayId: sourceLead.displayId,
          sourceBrideName: sourceLead.brideName,
          assignedBy: staffId,
        });
      }
    }

    if (body.followUpRequested && body.followUpAt) {
      await cancelPendingFeedbackTasksForLead(tx, leadId, "feedback_follow_up");
      const taskDisplayId = await generateTaskDisplayId(tx);
      const [task] = await tx<{ id: string }[]>`
        INSERT INTO rm_tasks (
          display_id, staff_id, lead_id, task_type, title, due_date, status
        ) VALUES (
          ${taskDisplayId},
          ${staffId}::uuid,
          ${leadId}::uuid,
          'feedback_follow_up',
          ${"Feedback call-back"},
          ${body.followUpAt}::date,
          'pending'
        )
        RETURNING id
      `;
      followUpTaskId = task?.id ?? null;
    } else if (
      body.connectionStatus === "connected" ||
      body.connectionStatus === "not_interested"
    ) {
      await cancelPendingFeedbackTasksForLead(tx, leadId, "feedback_follow_up");
    }

    careTicketId = await createCareTicketFromNegativeFeedback(
      tx,
      leadId,
      staffId,
      id,
      body
    );

    return id;
  });

  return { feedbackId, followUpTaskId, referralFollowUpTaskId, careTicketId };
}

export async function assertFeedbackLeadAccess(
  leadId: string,
  staffId: string,
  role: string
): Promise<void> {
  if (role !== "feedbackRm") return;

  const eligible = await isLeadFeedbackEligible(leadId);
  if (!eligible) {
    throw new Error("Lead is not in the feedback queue yet (ceremonies still upcoming)");
  }
}
