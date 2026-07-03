import { appendCareEmailSignature } from "@/lib/care-email-signature";

type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  attachments?: ResendAttachment[];
  threadHeaders?: { inReplyTo: string; references: string[] };
};

export type ResendAttachment = {
  filename: string;
  content: string;
  content_type?: string;
};

type SendEmailResult =
  | { ok: true; messageId: string | null }
  | { ok: false; error: string };

/** Customer-facing care mailbox (Gmail). Used as reply-to on automated Resend acks. */
export function getCareGmailAddress(): string {
  return (
    process.env.CARE_GMAIL_ADDRESS ??
    process.env.CARE_FROM_EMAIL ??
    "care@olready.in"
  );
}

/** @deprecated Use getCareGmailAddress — kept for existing imports. */
export function getCareFromEmail(): string {
  return getCareGmailAddress();
}

/** Verified Resend sender (e.g. onboarding@resend.dev or a verified domain). */
export function getResendFromEmail(): string {
  return process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
}

export function renderTemplate(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}

/** Automated transactional email via Resend (ticket acknowledgement only). */
export async function sendCareEmail(
  params: SendEmailParams
): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const fromAddress = getResendFromEmail();
  const replyTo = params.replyTo ?? getCareGmailAddress();

  if (!apiKey) {
    console.warn("[resend] RESEND_API_KEY not set — skipping send", params.subject);
    return { ok: false, error: "RESEND_API_KEY is not configured" };
  }

  try {
    const htmlBody = appendCareEmailSignature(params.html.replace(/\n/g, "<br>"), "html");
    const textBody = appendCareEmailSignature(params.text ?? params.html, "plain");

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `Team Olready <${fromAddress}>`,
        to: [params.to],
        subject: params.subject,
        html: htmlBody,
        text: textBody,
        reply_to: replyTo,
        ...(params.threadHeaders
          ? {
              headers: {
                "In-Reply-To": params.threadHeaders.inReplyTo,
                References: params.threadHeaders.references.join(" "),
              },
            }
          : {}),
        ...(params.attachments?.length
          ? {
              attachments: params.attachments.map((a) => ({
                filename: a.filename,
                content: a.content,
                ...(a.content_type ? { content_type: a.content_type } : {}),
              })),
            }
          : {}),
      }),
    });

    const body = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
    };

    if (!res.ok) {
      const err = body.message ?? `Resend error ${res.status}`;
      console.error("[resend] send failed:", err, { from: fromAddress, to: params.to });
      return { ok: false, error: err };
    }

    return { ok: true, messageId: body.id ?? null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send email";
    console.error("[resend] send error:", message);
    return { ok: false, error: message };
  }
}
