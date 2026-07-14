import { NextResponse } from "next/server";
import { sql, withTransaction } from "@/db/index";
import { createTicket } from "@/lib/ticket-create";
import {
  savePublicIntakeAttachments,
  validateIntakeFile,
  verifyPublicTicketAccess,
} from "@/lib/public-ticket-intake";
import { appendTicketUpdate } from "@/lib/ticket-update";
import { MAX_INTAKE_ATTACHMENTS } from "@/lib/ticket-attachments";
import { isPublicSupportCategoryAllowed } from "@/lib/ticket-category-registry";
import type { RaisedByType } from "@/lib/types";

type ConcernFields = {
  name?: string;
  phone?: string;
  email?: string;
  category?: string;
  complaint?: string;
  raisedByType: RaisedByType;
  ticketId?: string;
};

function parseJsonBody(body: Record<string, unknown>): ConcernFields {
  const raisedByType = body.raisedByType;
  return {
    name: typeof body.name === "string" ? body.name : undefined,
    phone: typeof body.phone === "string" ? body.phone : undefined,
    email: typeof body.email === "string" ? body.email : undefined,
    category: typeof body.category === "string" ? body.category : undefined,
    complaint: typeof body.complaint === "string" ? body.complaint : undefined,
    ticketId: typeof body.ticketId === "string" ? body.ticketId : undefined,
    raisedByType:
      raisedByType === "mua" || raisedByType === "bride" || raisedByType === "other"
        ? raisedByType
        : "mua",
  };
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  let fields: ConcernFields = { raisedByType: "mua" };
  let files: File[] = [];

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    fields = parseJsonBody({
      name: form.get("name")?.toString() ?? "",
      phone: form.get("phone")?.toString() ?? "",
      email: form.get("email")?.toString() ?? "",
      category: form.get("category")?.toString() ?? "",
      complaint: form.get("complaint")?.toString() ?? "",
      raisedByType: form.get("raisedByType")?.toString() ?? "",
      ticketId: form.get("ticketId")?.toString() ?? "",
    });
    files = form
      .getAll("files")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  } else {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    fields = parseJsonBody(body);
  }

  const complaintText = fields.complaint?.trim();
  if (!complaintText || complaintText.length < 10) {
    return NextResponse.json(
      { data: null, error: "Please describe your concern (at least 10 characters)." },
      { status: 400 }
    );
  }

  if (!fields.phone?.trim() && !fields.email?.trim()) {
    return NextResponse.json(
      { data: null, error: "Phone or email is required." },
      { status: 400 }
    );
  }

  const raisedByType = fields.raisedByType ?? "mua";
  const category = fields.category?.trim() || "other";
  const categoryAllowed = await isPublicSupportCategoryAllowed(sql, category, raisedByType);
  if (!categoryAllowed) {
    return NextResponse.json(
      { data: null, error: "Please choose a valid category for your profile type." },
      { status: 400 }
    );
  }

  if (files.length > MAX_INTAKE_ATTACHMENTS) {
    return NextResponse.json(
      { data: null, error: `Maximum ${MAX_INTAKE_ATTACHMENTS} attachments per submission` },
      { status: 400 }
    );
  }

  for (const file of files) {
    const err = validateIntakeFile(file);
    if (err) {
      return NextResponse.json({ data: null, error: err }, { status: 400 });
    }
  }

  try {
    if (fields.ticketId?.trim() && fields.phone?.trim()) {
      const updateResult = await withTransaction(async (tx) => {
        const allowed = await verifyPublicTicketAccess(
          tx,
          fields.ticketId!.trim(),
          fields.phone!.trim()
        );
        if (!allowed) return { forbidden: true as const };

        return appendTicketUpdate(tx, fields.ticketId!.trim(), {
          updateText: complaintText,
          categories: [category],
          source: "public_form",
          reopenIfClosed: true,
          files,
        });
      });

      if (updateResult && "forbidden" in updateResult) {
        return NextResponse.json(
          { data: null, error: "Could not verify ticket and phone. Check details and try again." },
          { status: 403 }
        );
      }
      if (!updateResult) {
        return NextResponse.json({ data: null, error: "Ticket not found." }, { status: 404 });
      }

      return NextResponse.json({
        data: {
          ticketNumber: updateResult.ticket.ticketNumber,
          updated: true,
          message: `Update added to ticket ${updateResult.ticket.ticketNumber}. Our care team will review it.`,
        },
        error: null,
      });
    }

    const result = await withTransaction(async (tx) => {
      const ticket = await createTicket(tx, {
        category,
        complaintText,
        raisedByName: fields.name?.trim() ?? null,
        raisedByPhone: fields.phone?.trim() ?? null,
        raisedByEmail: fields.email?.trim() ?? null,
        raisedByType,
        source: "publicForm",
        sendAck: Boolean(fields.email?.trim()),
      });

      let attachmentErrors: string[] = [];
      if (files.length > 0) {
        const upload = await savePublicIntakeAttachments(tx, ticket.id, files);
        attachmentErrors = upload.errors;
      }

      return { ticket, attachmentErrors };
    });

    const { ticket, attachmentErrors } = result;
    const ackRequested = Boolean(fields.email?.trim());

    return NextResponse.json({
      data: {
        ticketNumber: ticket.ticketNumber,
        ackRequested,
        ackSent: Boolean(ticket.ackSent),
        attachmentsSaved: files.length - attachmentErrors.length,
        attachmentErrors,
        message: ackRequested
          ? ticket.ackSent
            ? "Your concern was received. Check your email for the ticket reference."
            : "Your concern was received. Save your ticket reference below — we could not send email (try again or contact care@olready.in)."
          : "Your concern was received. Save your ticket reference to check status later.",
      },
      error: null,
    });
  } catch (err) {
    console.error("[public/concerns]", err);
    return NextResponse.json(
      { data: null, error: "Unable to submit your concern. Please try again later." },
      { status: 500 }
    );
  }
}
