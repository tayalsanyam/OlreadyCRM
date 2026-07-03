/** Deep-link uploader add-lead from feedback referral intake. */
export const FEEDBACK_REFERRAL_LEAD_SOURCE = "Referral";

export function uploadReferralCreateLeadHref(opts: {
  name: string;
  phone: string;
  referralId: string;
}): string {
  const params = new URLSearchParams();
  params.set("add", "1");
  params.set("brideName", opts.name.trim());
  params.set("phone", opts.phone.trim());
  params.set("referralId", opts.referralId);
  return `/upload/leads?${params.toString()}`;
}

export function parseUploadReferralCreateLeadParams(searchParams: URLSearchParams): {
  open: boolean;
  brideName: string;
  phone: string;
  referralId: string | null;
} | null {
  if (searchParams.get("add") !== "1") return null;
  const brideName = searchParams.get("brideName")?.trim() ?? "";
  const phone = searchParams.get("phone")?.trim() ?? "";
  const referralId = searchParams.get("referralId")?.trim() || null;
  if (!brideName && !phone) return null;
  return { open: true, brideName, phone, referralId };
}
