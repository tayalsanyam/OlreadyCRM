import { appendCareEmailSignature } from "@/lib/care-email-signature";
import { buildGmailComposeUrl } from "@/lib/gmail-compose";
import { splitEmailBodyCoreAndAppendix } from "@/lib/ticket-email-content";
import { ensureTicketThreadSubject } from "@/lib/ticket-email-thread";

export function buildTicketEmailGmailCompose(opts: {
  ticketNumber: string;
  toEmail: string;
  subject: string;
  bodyHtml: string;
}): string {
  return buildTicketEmailGmailComposeResult(opts).url;
}

export function buildTicketEmailGmailComposeResult(opts: {
  ticketNumber: string;
  toEmail: string;
  subject: string;
  bodyHtml: string;
}): { url: string; appendixOmitted: boolean } {
  const threadedSubject = ensureTicketThreadSubject(opts.ticketNumber, opts.subject);
  const { core, appendix } = splitEmailBodyCoreAndAppendix(opts.bodyHtml);
  const gmailBody = appendix && core.length < 4500 ? opts.bodyHtml : core;
  const appendixOmitted = Boolean(appendix) && gmailBody === core;
  const body = appendCareEmailSignature(gmailBody, "plain");
  return {
    url: buildGmailComposeUrl({
      to: opts.toEmail,
      subject: threadedSubject,
      body,
    }),
    appendixOmitted,
  };
}

export function prepareTicketEmailContent(opts: {
  ticketNumber: string;
  subject: string;
  bodyHtml: string;
}): { threadedSubject: string; bodyHtml: string; bodyPlain: string } {
  const threadedSubject = ensureTicketThreadSubject(opts.ticketNumber, opts.subject);
  const bodyPlain = appendCareEmailSignature(opts.bodyHtml, "plain");
  const bodyHtml = appendCareEmailSignature(opts.bodyHtml.replace(/\n/g, "<br>"), "html");
  return { threadedSubject, bodyHtml, bodyPlain };
}
