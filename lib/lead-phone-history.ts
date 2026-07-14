import type { Sql } from "@/db/index";
import { fromDbStatus } from "@/lib/db-mappers";
import { exitKindFromRow } from "@/lib/lead-exit";
import { normalizePhone } from "@/lib/phone";
import type { LeadStatus } from "@/lib/types";

export type PhoneLeadHistoryComm = {
  entryType: string;
  description: string;
  actorName: string | null;
  createdAt: string;
};

export type PhoneLeadHistoryRow = {
  id: string;
  displayId: string;
  brideName: string;
  phone: string;
  city: string;
  region: string | null;
  eventDate: string | null;
  status: LeadStatus;
  verified: boolean;
  portalOnly: boolean;
  handoverReason: string | null;
  hostileNote: string | null;
  assignedRmName: string | null;
  createdAt: string;
  updatedAt: string;
  commCount: number;
  bookingCount: number;
  pushCount: number;
  lastActivityAt: string | null;
  exitKind: string | null;
  recentComms: PhoneLeadHistoryComm[];
};

type DbRow = {
  id: string;
  displayId: string;
  brideName: string;
  phone: string;
  city: string;
  region: string;
  eventDate: string | null;
  status: string;
  verified: boolean;
  portalOnly: boolean;
  handoverReason: string | null;
  hostileNote: string | null;
  assignedRmName: string | null;
  createdAt: string;
  updatedAt: string;
  commCount: number;
  bookingCount: number;
  pushCount: number;
  lastActivityAt: string | null;
  recentComms: PhoneLeadHistoryComm[] | null;
};

export function mapPhoneLeadHistoryRow(r: DbRow): PhoneLeadHistoryRow {
  const status = fromDbStatus(r.status);
  const exitKind = exitKindFromRow({
    status,
    hostileNote: r.hostileNote,
    handoverReason: r.handoverReason,
  });
  return {
    id: r.id,
    displayId: r.displayId,
    brideName: r.brideName,
    phone: r.phone,
    city: r.city,
    region: r.region,
    eventDate: r.eventDate,
    status,
    verified: r.verified,
    portalOnly: r.portalOnly,
    handoverReason: r.handoverReason,
    hostileNote: r.hostileNote,
    assignedRmName: r.assignedRmName,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    commCount: r.commCount,
    bookingCount: r.bookingCount,
    pushCount: r.pushCount,
    lastActivityAt: r.lastActivityAt,
    exitKind,
    recentComms: r.recentComms ?? [],
  };
}

export async function fetchLeadsByPhoneHistory(
  db: Sql,
  params: { phone: string; excludeLeadId?: string | null; limit?: number }
): Promise<PhoneLeadHistoryRow[]> {
  const normalized = normalizePhone(params.phone);
  if (normalized.length < 10) return [];

  const excludeLeadId = params.excludeLeadId?.trim() || null;
  const limit = Math.min(Math.max(params.limit ?? 8, 1), 20);

  const rows = await db<DbRow[]>`
    SELECT
      bl.id,
      bl.display_id AS "displayId",
      bl.bride_name AS "brideName",
      bl.phone,
      bl.city,
      bl.region::text AS region,
      bl.event_date::text AS "eventDate",
      bl.status::text AS status,
      bl.verified,
      COALESCE(bl.portal_only, false) AS "portalOnly",
      bl.handover_reason AS "handoverReason",
      bl.hostile_note AS "hostileNote",
      rm.name AS "assignedRmName",
      bl.created_at::text AS "createdAt",
      bl.updated_at::text AS "updatedAt",
      (SELECT COUNT(*)::int FROM comms c WHERE c.lead_id = bl.id) AS "commCount",
      (SELECT COUNT(*)::int FROM bookings b WHERE b.lead_id = bl.id) AS "bookingCount",
      (SELECT COUNT(*)::int FROM mua_pushes mp WHERE mp.lead_id = bl.id) AS "pushCount",
      (
        SELECT MAX(c.created_at)::text FROM comms c WHERE c.lead_id = bl.id
      ) AS "lastActivityAt",
      (
        SELECT COALESCE(json_agg(t ORDER BY t."createdAt" DESC), '[]'::json)
        FROM (
          SELECT
            c.entry_type::text AS "entryType",
            c.description,
            s.name AS "actorName",
            c.created_at::text AS "createdAt"
          FROM comms c
          LEFT JOIN staff s ON s.id = c.actor_id
          WHERE c.lead_id = bl.id
          ORDER BY c.created_at DESC
          LIMIT 5
        ) t
      ) AS "recentComms"
    FROM bride_leads bl
    LEFT JOIN staff rm ON rm.id = bl.assigned_rm_id
    WHERE right(regexp_replace(bl.phone, '\\D', '', 'g'), 10) = ${normalized}
      AND (
        ${excludeLeadId}::uuid IS NULL
        OR bl.id <> ${excludeLeadId}::uuid
      )
    ORDER BY bl.created_at DESC
    LIMIT ${limit}
  `;

  return rows.map(mapPhoneLeadHistoryRow);
}
