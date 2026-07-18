import { NextResponse } from "next/server";
import { sql, generateTaskDisplayId, withTransaction } from "@/db/index";
import { requireSession } from "@/lib/api-auth";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import { fromDbPushStage, fromDbTaskType, fromDbTier, fromDbStatus, fromDbUrgencyBand } from "@/lib/db-mappers";
import {
  findPendingMuaTaskConflict,
  formatMuaTaskConflictError,
} from "@/lib/task-duplicates";
import { apiErrorResponse } from "@/lib/api-error-response";
import { taskListResponse } from "@/lib/task-list-response";
import { QUEUE_EVENT_LABELS_COLUMN } from "@/lib/queue-event-labels-sql";
import type { Task } from "@/lib/types";

export async function GET(request: Request) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  if (USE_MOCK) {
    const mine = mockStore.getTasks(auth.session.userId);
    return NextResponse.json({
      data: taskListResponse(mine),
      error: null,
    });
  }

  let rows: (Task & {
    pushStage?: string | null;
    taskType: string;
    salesPipelineId?: string | null;
    salesPipelineStage?: string | null;
    salesPipelineMuaName?: string | null;
    salesPipelineMuaCity?: string | null;
    salesPipelineMuaType?: string | null;
    salesPipelineMuaPhone?: string | null;
    salesPipelineMuaWhatsapp?: string | null;
    salesTrainingComplete?: boolean | null;
    activationSentBack?: boolean | null;
    activationSentBackNote?: string | null;
    muaPhone?: string | null;
    muaWhatsapp?: string | null;
    muaCity?: string | null;
    leadPhone?: string | null;
    muaId?: string | null;
  })[];

  try {
    rows = await sql<
      (Task & {
        pushStage?: string | null;
        taskType: string;
        salesPipelineId?: string | null;
        salesPipelineStage?: string | null;
        salesPipelineMuaName?: string | null;
        salesPipelineMuaCity?: string | null;
        salesPipelineMuaType?: string | null;
        salesPipelineMuaPhone?: string | null;
        salesPipelineMuaWhatsapp?: string | null;
        salesTrainingComplete?: boolean | null;
        activationSentBack?: boolean | null;
        activationSentBackNote?: string | null;
        muaPhone?: string | null;
        muaWhatsapp?: string | null;
        muaCity?: string | null;
        leadPhone?: string | null;
        muaId?: string | null;
      })[]
    >`
    SELECT
      t.*,
      bl.bride_name AS lead_name,
      bl.display_id AS bride_display_id,
      bl.phone AS lead_phone,
      bl.city AS lead_city,
      bl.region AS lead_region,
      bl.budget_amount,
      bl.budget_tier,
      bl.status AS lead_status,
      rm.lead_sla_event_date(bl.id) AS event_date,
      (rm.lead_sla_event_date(bl.id) - CURRENT_DATE)::int AS days_to_event,
      rm.compute_urgency_band(rm.lead_sla_event_date(bl.id)) AS urgency_band,
      ${sql.unsafe(QUEUE_EVENT_LABELS_COLUMN)},
      (SELECT MAX(c.created_at) FROM comms c WHERE c.lead_id = bl.id) AS last_activity_at,
      (
        SELECT COUNT(*)::int
        FROM mua_pushes mp3
        WHERE mp3.lead_id = bl.id AND mp3.status NOT IN ('closed', 'booked')
      ) AS active_pushes_count,
      (
        SELECT COUNT(DISTINCT mp4.mua_id)::int
        FROM mua_pushes mp4
        WHERE mp4.lead_id = bl.id
      ) AS muas_offered_count,
      (
        SELECT string_agg(names.name, ', ' ORDER BY names.name)
        FROM (
          SELECT DISTINCT m2.name
          FROM mua_pushes mp5
          JOIN muas m2 ON m2.id = mp5.mua_id
          WHERE mp5.lead_id = bl.id
        ) names
      ) AS muas_offered_names,
      (
        SELECT COUNT(*)::int
        FROM lead_events le
        WHERE le.lead_id = bl.id AND le.status = 'booked'
      ) AS booked_event_count,
      (
        SELECT COUNT(*)::int
        FROM lead_events le
        WHERE le.lead_id = bl.id AND le.status = 'open'
      ) AS open_event_count,
      bl.confirmation_status,
      (
        SELECT COUNT(DISTINCT mp2.mua_id)::int
        FROM mua_pushes mp2
        JOIN bride_leads bl2 ON bl2.id = t.lead_id
        WHERE mp2.lead_id = t.lead_id
          AND mp2.status NOT IN ('closed', 'booked')
          AND (
            bl2.status <> 'commission_rm'::lead_status
            OR bl2.owner_assigned_at IS NULL
            OR mp2.created_at >= bl2.owner_assigned_at
          )
      ) AS active_distinct_muas,
      m.name AS mua_name,
      m.id AS mua_id,
      m.phone AS mua_phone,
      m.whatsapp AS mua_whatsapp,
      m.city AS mua_city,
      mp.stage AS push_stage,
      sp.id AS sales_pipeline_id,
      sp.stage AS sales_pipeline_stage,
      sm.name AS sales_pipeline_mua_name,
      sm.city AS sales_pipeline_mua_city,
      sp.mua_type AS sales_pipeline_mua_type,
      sm.phone AS sales_pipeline_mua_phone,
      sm.whatsapp AS sales_pipeline_mua_whatsapp,
      COALESCE(str.complete, false) AS sales_training_complete,
      (
        sal.sent_back_at IS NOT NULL
        AND COALESCE(sal.activated_at, NULL) IS NULL
        AND NOT COALESCE(str.complete, false)
      ) AS activation_sent_back,
      sal.sent_back_note AS activation_sent_back_note,
      fri.note AS referral_intake_note
    FROM rm_tasks t
    LEFT JOIN bride_leads bl ON bl.id = t.lead_id
    LEFT JOIN mua_pushes mp ON mp.id = t.push_id
    LEFT JOIN muas m ON m.id = mp.mua_id
    LEFT JOIN feedback_referral_intake fri ON fri.task_id = t.id AND fri.status = 'pending'
    LEFT JOIN sales.pipeline sp ON sp.id = (
      CASE
        WHEN t.title ~ '\\[PIPE:[0-9a-f-]{36}\\]'
        THEN substring(t.title from '\\[PIPE:([0-9a-f-]{36})\\]')::uuid
        ELSE NULL
      END
    )
    LEFT JOIN muas sm ON sm.id = sp.mua_id
    LEFT JOIN sales.training str ON str.pipeline_id = sp.id
    LEFT JOIN sales.activation_log sal ON sal.pipeline_id = sp.id
    WHERE t.staff_id = ${auth.session.userId}::uuid
      AND t.status = 'pending'
    ORDER BY t.due_date NULLS LAST, t.created_at DESC
  `;
  } catch (error) {
    return apiErrorResponse(error, "Failed to load tasks");
  }

  const tasks: Task[] = rows.map((row) => {
    const r = row as Task & {
      lead_city?: string | null;
      budget_amount?: number | null;
      budget_tier?: string | null;
      lead_status?: string | null;
      event_date?: string | null;
      days_to_event?: number | null;
      urgency_band?: string | null;
      event_labels?: string | null;
      last_activity_at?: string | null;
      active_pushes_count?: number | null;
      muas_offered_count?: number | null;
      muas_offered_names?: string | null;
      booked_event_count?: number | null;
      open_event_count?: number | null;
      active_distinct_muas?: number;
      confirmation_status?: string;
    };

    return {
      ...row,
      taskType: fromDbTaskType(String(row.taskType)),
      pushStage: row.pushStage ? fromDbPushStage(String(row.pushStage)) : null,
      salesPipelineId: row.salesPipelineId ?? null,
      salesPipelineStage: (row.salesPipelineStage as Task["salesPipelineStage"]) ?? null,
      salesPipelineMuaName: row.salesPipelineMuaName ?? null,
      salesPipelineMuaCity: row.salesPipelineMuaCity ?? null,
      salesPipelineMuaType: row.salesPipelineMuaType ?? null,
      salesPipelineMuaPhone: row.salesPipelineMuaPhone ?? null,
      salesPipelineMuaWhatsapp: row.salesPipelineMuaWhatsapp ?? null,
      salesTrainingComplete: row.salesTrainingComplete ?? null,
      activationSentBack: row.activationSentBack ?? null,
      activationSentBackNote: (row as { activationSentBackNote?: string | null }).activationSentBackNote ?? null,
      muaPhone: row.muaPhone ?? null,
      muaWhatsapp: row.muaWhatsapp ?? null,
      muaCity: row.muaCity ?? null,
      leadPhone: row.leadPhone ?? null,
      muaId: row.muaId ?? null,
      referralIntakeNote: (row as { referralIntakeNote?: string | null }).referralIntakeNote ?? null,
      activeDistinctMuas: Number(r.activeDistinctMuas ?? r.active_distinct_muas ?? 0),
      confirmationStatus:
        r.confirmationStatus ??
        (r.confirmation_status === "confirmed" ? "confirmed" : "pending"),
      leadCity: r.leadCity ?? r.lead_city ?? null,
      leadRegion:
        (r.leadRegion ?? (r as { lead_region?: string | null }).lead_region) as
          | Task["leadRegion"]
          | undefined ?? null,
      eventDate: r.eventDate ?? r.event_date ?? null,
      daysToEvent:
        r.daysToEvent != null
          ? Number(r.daysToEvent)
          : r.days_to_event != null
            ? Number(r.days_to_event)
            : null,
      urgencyBand:
        r.urgencyBand != null
          ? fromDbUrgencyBand(String(r.urgencyBand))
          : r.urgency_band
            ? fromDbUrgencyBand(String(r.urgency_band))
            : null,
      budgetAmount:
        r.budgetAmount != null
          ? Number(r.budgetAmount)
          : r.budget_amount != null
            ? Number(r.budget_amount)
            : null,
      budgetTier:
        r.budgetTier != null
          ? fromDbTier(String(r.budgetTier))
          : r.budget_tier
            ? fromDbTier(String(r.budget_tier))
            : undefined,
      leadStatus:
        r.leadStatus != null
          ? fromDbStatus(String(r.leadStatus))
          : r.lead_status
            ? fromDbStatus(String(r.lead_status))
            : undefined,
      eventLabels: r.eventLabels ?? r.event_labels ?? null,
      lastActivityAt: r.lastActivityAt ?? r.last_activity_at ?? null,
      activePushesCount: Number(r.activePushesCount ?? r.active_pushes_count ?? 0),
      muasOfferedCount: Number(r.muasOfferedCount ?? r.muas_offered_count ?? 0),
      muasOfferedNames: r.muasOfferedNames ?? r.muas_offered_names ?? null,
      bookedEventCount: Number(r.bookedEventCount ?? r.booked_event_count ?? 0),
      openEventCount: Number(r.openEventCount ?? r.open_event_count ?? 0),
    };
  });

  return NextResponse.json({
    data: taskListResponse(tasks),
    error: null,
  });
}

export async function POST(request: Request) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const body = (await request.json()) as {
    leadId: string;
    pushId?: string;
    taskType: string;
    title: string;
    dueDate?: string;
  };

  if (!body.leadId || !body.taskType || !body.title?.trim()) {
    return NextResponse.json(
      { data: null, error: "leadId, taskType, and title required" },
      { status: 400 }
    );
  }

  if (USE_MOCK) {
    try {
      const task = mockStore.createTask({
        staffId: auth.session.userId,
        leadId: body.leadId,
        pushId: body.pushId,
        taskType: body.taskType,
        title: body.title,
        dueDate: body.dueDate,
      });
      return NextResponse.json({ data: task, error: null });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not create task";
      return NextResponse.json({ data: null, error: message }, { status: 409 });
    }
  }

  if (body.pushId) {
    const conflict = await findPendingMuaTaskConflict(sql, {
      leadId: body.leadId,
      pushId: body.pushId,
    });
    if (conflict) {
      return NextResponse.json(
        { data: null, error: formatMuaTaskConflictError(conflict), conflict },
        { status: 409 }
      );
    }
  }

  const displayId = await generateTaskDisplayId(sql);
  const typeMap: Record<string, string> = {
    follow_up: "follow_up",
    followUp: "follow_up",
    closeConversation: "close_conversation",
    adminReview: "admin_review",
    shiftWarning: "shift_warning",
  };
  const dbType = typeMap[body.taskType] ?? body.taskType;

  const [task] = await sql`
    INSERT INTO rm_tasks (
      display_id, staff_id, lead_id, push_id, task_type, title, due_date, status
    ) VALUES (
      ${displayId},
      ${auth.session.userId}::uuid,
      ${body.leadId}::uuid,
      ${body.pushId ?? null}::uuid,
      ${dbType}::task_type,
      ${body.title},
      ${body.dueDate ?? null}::date,
      'pending'
    )
    RETURNING *
  `;

  return NextResponse.json({ data: task, error: null });
}
