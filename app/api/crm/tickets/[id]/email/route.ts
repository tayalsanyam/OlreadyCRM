import { NextResponse } from "next/server";
import { withTransaction, type TransactionSql } from "@/db/index";
import { requireGrievanceAccess, requireSession } from "@/lib/api-auth";
import {
  attachmentSummary,
  resolveEmailAttachments,
} from "@/lib/email-attachments";
import { getCareGmailAddress, getResendFromEmail, renderTemplate } from "@/lib/resend";
import { ticketEmailTemplateVars } from "@/lib/ticket-email-template-vars";
import { getTicketById } from "@/lib/ticket-create";
import { buildTicketEmailGmailCompose, buildTicketEmailGmailComposeResult, prepareTicketEmailContent } from "@/lib/ticket-email-gmail";
import {
  recordTicketEmailSent,
  sendTicketEmailViaResend,
} from "@/lib/ticket-email-send";
import { ticketEmailThreadToken } from "@/lib/ticket-email-thread";
import { approvedCoreContentMatches, splitEmailBodyCoreAndAppendix } from "@/lib/ticket-email-content";
import {
  applyComposerOverridesToEmail,
  type ComposerSendOverrides,
} from "@/lib/ticket-email-compose-overrides";
import {
  approveEmailForCareSend,
  adminUpdatePendingEmail,
  queueEmailForAdminApproval,
  requestEmailRevision,
  stableSubjectForTicket,
  supersedeTicketEmail,
} from "@/lib/ticket-email-workflow";

type RouteParams = { params: Promise<{ id: string }> };

type DeliveryMethod = "resend" | "gmail";

type ComposeResult =
  | { error: string }
  | { preview: { subject: string; bodyHtml: string; toEmail: string; approvalTier: number } }
  | { pending: string }
  | { gmailCompose: { url: string; emailId: string; hasAttachments?: boolean; appendixOmitted?: boolean } }
  | { sentViaResend: string }
  | { draft: string }
  | { approved: string }
  | { revisionRequested: string }
  | { markedSent: string };

function normalizeAttachmentIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === "string" && id.length > 0);
}

function parseComposerOverrides(body: {
  bodyHtml?: string;
  toEmail?: string;
  subject?: string;
  attachmentIds?: unknown;
}): ComposerSendOverrides | undefined {
  const bodyHtml = body.bodyHtml?.trim();
  const toEmail = body.toEmail?.trim();
  const attachmentIds = normalizeAttachmentIds(body.attachmentIds);
  if (!bodyHtml && !toEmail && !attachmentIds.length) return undefined;
  return {
    bodyHtml: bodyHtml || undefined,
    toEmail: toEmail || undefined,
    attachmentIds: attachmentIds.length ? attachmentIds : undefined,
  };
}

function parseDeliveryMethod(raw: unknown): DeliveryMethod {
  return raw === "resend" ? "resend" : "gmail";
}

async function loadEmailRow(
  tx: TransactionSql,
  ticketId: string,
  emailId: string,
) {
  const [email] = await tx<{
    id: string;
    subject: string;
    bodyHtml: string;
    toEmail: string;
    status: string;
    attachmentIds: string[];
    approvedSubject: string | null;
    approvedBodyHtml: string | null;
    approvedToEmail: string | null;
    approvalTier: number;
    templateId: string | null;
  }[]>`
    SELECT id, subject, body_html AS "bodyHtml", to_email AS "toEmail",
      status::text AS status,
      COALESCE(attachment_ids, '{}') AS "attachmentIds",
      approved_subject AS "approvedSubject",
      approved_body_html AS "approvedBodyHtml",
      approved_to_email AS "approvedToEmail",
      approval_tier AS "approvalTier",
      template_id AS "templateId"
    FROM support.ticket_email_responses
    WHERE id = ${emailId}::uuid AND ticket_id = ${ticketId}::uuid
  `;
  return email ?? null;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const auth = await requireGrievanceAccess();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;

  const data = await withTransaction(async (tx) => {
    const ticket = await getTicketById(tx, id);
    const templates = await tx`
        SELECT id, category, name, subject_template AS "subjectTemplate",
          body_template AS "bodyTemplate", approval_tier AS "approvalTier",
          requires_admin_approval AS "requiresAdminApproval"
        FROM support.ticket_templates
        WHERE active = true
        ORDER BY category NULLS FIRST, name
      `;

    const [sendChannelCol] = await tx<{ exists: number }[]>`
      SELECT 1 AS exists FROM information_schema.columns
      WHERE table_schema = 'support' AND table_name = 'ticket_email_responses'
        AND column_name = 'send_channel'
      LIMIT 1
    `;

    const emails = sendChannelCol
      ? await tx`
          SELECT id, subject, body_html AS "bodyHtml", to_email AS "toEmail", status::text AS status,
            approval_tier AS "approvalTier", sent_at AS "sentAt", created_at AS "createdAt",
            admin_revision_note AS "adminRevisionNote",
            attachment_ids AS "attachmentIds",
            send_channel AS "sendChannel"
          FROM support.ticket_email_responses
          WHERE ticket_id = ${id}::uuid
          ORDER BY created_at DESC
          LIMIT 20
        `
      : await tx`
          SELECT id, subject, body_html AS "bodyHtml", to_email AS "toEmail", status::text AS status,
            approval_tier AS "approvalTier", sent_at AS "sentAt", created_at AS "createdAt",
            admin_revision_note AS "adminRevisionNote",
            attachment_ids AS "attachmentIds",
            NULL::text AS "sendChannel"
          FROM support.ticket_email_responses
          WHERE ticket_id = ${id}::uuid
          ORDER BY created_at DESC
          LIMIT 20
        `;

    return {
      templates,
      emails,
      gmailAddress: getCareGmailAddress(),
      resendFromEmail: getResendFromEmail(),
      threadToken: ticket ? ticketEmailThreadToken(ticket.ticketNumber) : null,
      ticketNumber: ticket?.ticketNumber ?? null,
      stableSubject: ticket ? stableSubjectForTicket(ticket) : null,
    };
  });

  return NextResponse.json({ data, error: null });
}

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    action?:
      | "preview"
      | "draft"
      | "send"
      | "approve"
      | "request_revision"
      | "gmail_compose"
      | "send_resend"
      | "mark_sent"
      | "update_pending";
    templateId?: string;
    toEmail?: string;
    subject?: string;
    bodyHtml?: string;
    emailId?: string;
    revisionNote?: string;
    attachmentIds?: string[];
    deliveryMethod?: DeliveryMethod;
    nextSteps?: string;
    resolution?: string;
  };

  const isAdmin = ["admin", "owner"].includes(auth.session.role);
  const isOperator = ["careAgent", "admin", "owner"].includes(auth.session.role);

  if (!isOperator) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  if (body.action === "approve") {
    if (!isAdmin) {
      return NextResponse.json({ data: null, error: "Admin approval required" }, { status: 403 });
    }
    if (!body.emailId) {
      return NextResponse.json({ data: null, error: "emailId required" }, { status: 400 });
    }

    const result = await withTransaction(async (tx) => {
      const [email] = await tx<{ id: string; subject: string; status: string }[]>`
        SELECT id, subject, status::text AS status
        FROM support.ticket_email_responses
        WHERE id = ${body.emailId}::uuid AND ticket_id = ${id}::uuid
      `;
      if (!email) return { error: "Email not found" as const };
      if (email.status !== "pending_approval") {
        return { error: "Email is not pending approval" as const };
      }

      const ticket = await getTicketById(tx, id);
      if (!ticket) return { error: "Ticket not found" as const };

      await approveEmailForCareSend(tx, {
        ticket,
        emailId: email.id,
        subject: email.subject,
        adminId: auth.session.userId,
      });

      return { ok: true, approved: true };
    });

    if ("error" in result) {
      return NextResponse.json({ data: null, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ data: result, error: null });
  }

  if (body.action === "request_revision") {
    if (!isAdmin) {
      return NextResponse.json({ data: null, error: "Admin only" }, { status: 403 });
    }
    if (!body.emailId) {
      return NextResponse.json({ data: null, error: "emailId required" }, { status: 400 });
    }
    const revisionNote = body.revisionNote?.trim();
    if (!revisionNote) {
      return NextResponse.json({ data: null, error: "revisionNote is required" }, { status: 400 });
    }

    const result = await withTransaction(async (tx) => {
      const [email] = await tx<{ id: string; subject: string; status: string }[]>`
        SELECT id, subject, status::text AS status
        FROM support.ticket_email_responses
        WHERE id = ${body.emailId}::uuid AND ticket_id = ${id}::uuid
      `;
      if (!email) return { error: "Email not found" as const };
      if (email.status !== "pending_approval") {
        return { error: "Email is not pending approval" as const };
      }

      const ticket = await getTicketById(tx, id);
      if (!ticket) return { error: "Ticket not found" as const };

      await requestEmailRevision(tx, {
        ticket,
        emailId: email.id,
        subject: email.subject,
        adminId: auth.session.userId,
        revisionNote,
      });

      return { ok: true, revisionRequested: true };
    });

    if ("error" in result) {
      return NextResponse.json({ data: null, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ data: result, error: null });
  }

  if (body.action === "update_pending") {
    if (!isAdmin) {
      return NextResponse.json({ data: null, error: "Admin only" }, { status: 403 });
    }
    if (!body.emailId) {
      return NextResponse.json({ data: null, error: "emailId required" }, { status: 400 });
    }
    const subjectRaw = body.subject?.trim();
    const bodyHtml = body.bodyHtml?.trim();
    const toEmail = body.toEmail?.trim();
    if (!subjectRaw || !bodyHtml || !toEmail) {
      return NextResponse.json(
        { data: null, error: "subject, bodyHtml, and toEmail are required" },
        { status: 400 },
      );
    }

    const result = await withTransaction(async (tx) => {
      const ticket = await getTicketById(tx, id);
      if (!ticket) return { error: "Ticket not found" as const };

      const updated = await adminUpdatePendingEmail(tx, {
        ticket,
        emailId: body.emailId!,
        adminId: auth.session.userId,
        subject: subjectRaw,
        bodyHtml,
        toEmail,
      });

      if ("error" in updated) return updated;
      return { ok: true, updated };
    });

    if ("error" in result) {
      return NextResponse.json({ data: null, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ data: result, error: null });
  }

  if (body.action === "gmail_compose") {
    if (!body.emailId) {
      return NextResponse.json({ data: null, error: "emailId required" }, { status: 400 });
    }

    const composerOverrides = parseComposerOverrides(body);

    const result = await withTransaction(async (tx) => {
      const ticket = await getTicketById(tx, id);
      if (!ticket) return { error: "Ticket not found" as const };

      const loaded = await loadEmailRow(tx, id, body.emailId!);
      if (!loaded) return { error: "Email not found" as const };
      if (!["approved", "draft"].includes(loaded.status)) {
        return { error: "Only approved or draft emails can be opened in Gmail" as const };
      }

      const merged = await applyComposerOverridesToEmail(tx, ticket, id, loaded, composerOverrides);
      if ("error" in merged) return { error: merged.error };

      const attachmentIds = merged.attachmentIds ?? [];
      const resolved = await resolveEmailAttachments(tx, id, attachmentIds);
      if (resolved.error) return { error: resolved.error };

      const { core, appendix } = splitEmailBodyCoreAndAppendix(merged.bodyHtml);
      const gmail = buildTicketEmailGmailComposeResult({
        ticketNumber: ticket.ticketNumber,
        toEmail: merged.toEmail,
        subject: merged.subject,
        bodyHtml: merged.bodyHtml,
      });

      return {
        gmailCompose: {
          url: gmail.url,
          emailId: merged.id,
          hasAttachments: resolved.attachments.length > 0,
          appendixOmitted: gmail.appendixOmitted,
        },
      };
    });

    if ("error" in result) {
      return NextResponse.json({ data: null, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ data: result, error: null });
  }

  if (body.action === "send_resend") {
    if (!body.emailId) {
      return NextResponse.json({ data: null, error: "emailId required" }, { status: 400 });
    }

    const composerOverrides = parseComposerOverrides(body);

    const result = await withTransaction(async (tx) => {
      const ticket = await getTicketById(tx, id);
      if (!ticket) return { error: "Ticket not found" as const };

      const loaded = await loadEmailRow(tx, id, body.emailId!);
      if (!loaded) return { error: "Email not found" as const };
      if (loaded.status !== "approved") {
        return { error: "Only approved emails can be sent via Resend" as const };
      }

      const merged = await applyComposerOverridesToEmail(tx, ticket, id, loaded, composerOverrides);
      if ("error" in merged) return { error: merged.error };

      const resolved = await resolveEmailAttachments(tx, id, merged.attachmentIds ?? []);
      if (resolved.error) return { error: resolved.error };

      const attachNote = attachmentSummary(resolved.attachments.map((a) => a.filename));
      const sent = await sendTicketEmailViaResend(tx, {
        ticketId: id,
        ticketNumber: ticket.ticketNumber,
        emailId: merged.id,
        toEmail: merged.toEmail,
        subject: merged.subject,
        bodyHtml: merged.bodyHtml,
        actorId: auth.session.userId,
        attachNote,
        attachments: resolved.attachments,
      });

      if (!sent.ok) return { error: sent.error };
      return { sentViaResend: merged.id };
    });

    if ("error" in result) {
      return NextResponse.json({ data: null, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ data: result, error: null });
  }

  if (body.action === "mark_sent") {
    if (!body.emailId) {
      return NextResponse.json({ data: null, error: "emailId required" }, { status: 400 });
    }

    const composerOverrides = parseComposerOverrides(body);

    const result = await withTransaction(async (tx) => {
      const ticket = await getTicketById(tx, id);
      if (!ticket) return { error: "Ticket not found" as const };

      const loaded = await loadEmailRow(tx, id, body.emailId!);
      if (!loaded) return { error: "Email not found" as const };
      if (loaded.status !== "approved") {
        return { error: "Only approved emails can be marked sent. Open in Gmail first." as const };
      }

      const merged = await applyComposerOverridesToEmail(tx, ticket, id, loaded, composerOverrides);
      if ("error" in merged) return { error: merged.error };

      const resolved = await resolveEmailAttachments(tx, id, merged.attachmentIds ?? []);
      if (resolved.error) return { error: resolved.error };

      const attachNote = attachmentSummary(resolved.attachments.map((a) => a.filename));
      const prepared = prepareTicketEmailContent({
        ticketNumber: ticket.ticketNumber,
        subject: merged.subject,
        bodyHtml: merged.bodyHtml,
      });

      const markedId = await recordTicketEmailSent(tx, {
        ticketId: id,
        emailId: merged.id,
        actorId: auth.session.userId,
        toEmail: merged.toEmail,
        subject: merged.subject,
        bodyHtml: merged.bodyHtml,
        threadedSubject: prepared.threadedSubject,
        attachNote,
        channel: "gmail",
      });

      return { markedSent: markedId };
    });

    if ("error" in result) {
      return NextResponse.json({ data: null, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ data: result, error: null });
  }

  const attachmentIds = normalizeAttachmentIds(body.attachmentIds);
  const deliveryMethod = parseDeliveryMethod(body.deliveryMethod);

  const result = await withTransaction(async (tx): Promise<ComposeResult | null> => {
    const existing = await getTicketById(tx, id);
    if (!existing) return null;

    const threadedSubject = stableSubjectForTicket(existing);
    let bodyHtml = body.bodyHtml?.trim() ?? "";
    let approvalTier = 0;
    let requiresAdmin = false;
    let usedTemplate = false;
    let templateId = body.templateId ?? null;

    if (body.templateId) {
      const [tpl] = await tx<{
        subjectTemplate: string;
        bodyTemplate: string;
        approvalTier: number;
        requiresAdminApproval: boolean;
      }[]>`
        SELECT subject_template AS "subjectTemplate", body_template AS "bodyTemplate",
          approval_tier AS "approvalTier", requires_admin_approval AS "requiresAdminApproval"
        FROM support.ticket_templates WHERE id = ${body.templateId}::uuid
      `;
      if (tpl) {
        usedTemplate = true;
        const vars = ticketEmailTemplateVars(existing, {
          next_steps: body.nextSteps ?? "",
          resolution: body.resolution ?? "",
        });
        bodyHtml = renderTemplate(tpl.bodyTemplate, vars);
        approvalTier = tpl.approvalTier;
        requiresAdmin = tpl.requiresAdminApproval;
      }
    }

    const toEmail = body.toEmail?.trim() || existing.raisedByEmail || "";
    const subject = threadedSubject;

    if (body.action === "preview") {
      if (!bodyHtml) {
        return { error: "Pick a template or provide body" };
      }
      return { preview: { subject, bodyHtml, toEmail, approvalTier } };
    }

    if (!toEmail || !bodyHtml) {
      return { error: "toEmail and body are required" };
    }

    const resolved = await resolveEmailAttachments(tx, id, attachmentIds);
    if (resolved.error) {
      return { error: resolved.error };
    }

    const sendNow = body.action === "send";
    const attachNote = attachmentSummary(resolved.attachments.map((a) => a.filename));

    const queuePending = async (emailId: string) => {
      await queueEmailForAdminApproval(tx, {
        ticket: existing,
        emailId,
        subject,
        actorId: auth.session.userId,
        attachNote,
      });
      return { pending: emailId };
    };

    const sendApprovedRow = async (emailId: string) => {
      await tx`
        UPDATE support.ticket_email_responses
        SET subject = ${subject},
            body_html = ${bodyHtml},
            to_email = ${toEmail},
            attachment_ids = ${attachmentIds},
            updated_at = NOW()
        WHERE id = ${emailId}::uuid AND ticket_id = ${id}::uuid
      `;

      if (deliveryMethod === "resend") {
        const sent = await sendTicketEmailViaResend(tx, {
          ticketId: id,
          ticketNumber: existing.ticketNumber,
          emailId,
          toEmail,
          subject,
          bodyHtml,
          actorId: auth.session.userId,
          attachNote,
          attachments: resolved.attachments,
        });
        if (!sent.ok) return { error: sent.error };
        return { sentViaResend: emailId };
      }

      const gmail = buildTicketEmailGmailComposeResult({
        ticketNumber: existing.ticketNumber,
        toEmail,
        subject,
        bodyHtml,
      });
      return {
        gmailCompose: {
          url: gmail.url,
          emailId,
          hasAttachments: resolved.attachments.length > 0,
          appendixOmitted: gmail.appendixOmitted,
        },
      };
    };

    if (sendNow && body.emailId) {
      const prior = await loadEmailRow(tx, id, body.emailId);
      if (!prior) return { error: "Email not found" };

      if (prior.status === "approved") {
        const unchanged = approvedCoreContentMatches(existing.ticketNumber, prior, {
          subject,
          bodyHtml,
          toEmail,
        });
        if (unchanged) {
          return sendApprovedRow(prior.id);
        }
        await supersedeTicketEmail(tx, prior.id, id);
        templateId = prior.templateId ?? templateId;
        approvalTier = prior.approvalTier;
        requiresAdmin = true;
      } else if (prior.status === "revision_requested") {
        await tx`
          UPDATE support.ticket_email_responses
          SET subject = ${subject},
              body_html = ${bodyHtml},
              to_email = ${toEmail},
              attachment_ids = ${attachmentIds},
              status = 'pending_approval',
              approved_subject = NULL,
              approved_body_html = NULL,
              approved_to_email = NULL,
              admin_revision_note = NULL,
              updated_at = NOW()
          WHERE id = ${prior.id}::uuid AND ticket_id = ${id}::uuid
        `;
        return queuePending(prior.id);
      } else if (prior.status === "pending_approval") {
        return { error: "This draft is already awaiting admin review" };
      } else if (prior.status === "superseded") {
        return { error: "This approved draft was replaced — submit as a new draft" };
      }
    }

    const needsApproval = !usedTemplate || requiresAdmin || approvalTier > 0;

    if (sendNow && needsApproval) {
      const [row] = await tx`
        INSERT INTO support.ticket_email_responses (
          ticket_id, template_id, subject, body_html, to_email,
          approval_tier, status, created_by, attachment_ids
        ) VALUES (
          ${id}::uuid,
          ${templateId},
          ${subject},
          ${bodyHtml},
          ${toEmail},
          ${approvalTier},
          'pending_approval',
          ${auth.session.userId}::uuid,
          ${attachmentIds}
        )
        RETURNING id
      `;

      return queuePending(row.id as string);
    }

    if (sendNow && deliveryMethod === "resend") {
      const [row] = await tx`
        INSERT INTO support.ticket_email_responses (
          ticket_id, template_id, subject, body_html, to_email,
          approval_tier, status, created_by, attachment_ids
        ) VALUES (
          ${id}::uuid,
          ${templateId},
          ${subject},
          ${bodyHtml},
          ${toEmail},
          ${approvalTier},
          'approved',
          ${auth.session.userId}::uuid,
          ${attachmentIds}
        )
        RETURNING id
      `;

      const sent = await sendTicketEmailViaResend(tx, {
        ticketId: id,
        ticketNumber: existing.ticketNumber,
        emailId: row.id as string,
        toEmail,
        subject,
        bodyHtml,
        actorId: auth.session.userId,
        attachNote,
        attachments: resolved.attachments,
      });

      if (!sent.ok) return { error: sent.error };
      return { sentViaResend: row.id as string };
    }

    if (sendNow) {
      const [row] = await tx`
        INSERT INTO support.ticket_email_responses (
          ticket_id, template_id, subject, body_html, to_email,
          approval_tier, status, created_by, attachment_ids
        ) VALUES (
          ${id}::uuid,
          ${templateId},
          ${subject},
          ${bodyHtml},
          ${toEmail},
          ${approvalTier},
          'approved',
          ${auth.session.userId}::uuid,
          ${attachmentIds}
        )
        RETURNING id
      `;

      const url = buildTicketEmailGmailCompose({
        ticketNumber: existing.ticketNumber,
        toEmail,
        subject,
        bodyHtml,
      });
      return {
        gmailCompose: {
          url,
          emailId: row.id as string,
          hasAttachments: resolved.attachments.length > 0,
        },
      };
    }

    const [row] = await tx`
      INSERT INTO support.ticket_email_responses (
        ticket_id, template_id, subject, body_html, to_email,
        approval_tier, status, created_by, attachment_ids
      ) VALUES (
        ${id}::uuid,
        ${templateId},
        ${subject},
        ${bodyHtml},
        ${toEmail},
        ${approvalTier},
        'draft',
        ${auth.session.userId}::uuid,
        ${attachmentIds}
      )
      RETURNING id
    `;

    return { draft: row.id as string };
  });

  if (result === null) {
    return NextResponse.json({ data: null, error: "Ticket not found" }, { status: 404 });
  }
  if ("error" in result) {
    return NextResponse.json({ data: null, error: result.error }, { status: 400 });
  }

  return NextResponse.json({ data: result, error: null }, { status: 201 });
}
