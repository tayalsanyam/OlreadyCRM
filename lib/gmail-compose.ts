/** Plain text for Gmail compose `body=` (templates are usually plain or simple HTML). */
export function emailBodyToPlainText(body: string): string {
  return body
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Opens Gmail web compose with to / subject / body pre-filled. */
export function buildGmailComposeUrl(opts: {
  to: string;
  subject: string;
  body: string;
}): string {
  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    to: opts.to.trim(),
    su: opts.subject.trim(),
    body: emailBodyToPlainText(opts.body),
  });
  return `https://mail.google.com/mail/?${params.toString()}`;
}
