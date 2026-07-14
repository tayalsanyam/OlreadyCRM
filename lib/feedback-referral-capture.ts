/** Parse bride referral hints from free-text (friends/family note). */
export function parseReferralsFromNote(note: string): { name: string; phone: string }[] {
  const trimmed = note.trim();
  if (!trimmed) return [];

  const lines = trimmed
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const results: { name: string; phone: string }[] = [];
  const seenPhones = new Set<string>();

  for (const line of lines) {
    const phoneMatch = line.match(/(?:\+91[\s-]*)?([6-9]\d{9})/);
    if (phoneMatch) {
      const phone = phoneMatch[1]!;
      if (seenPhones.has(phone)) continue;
      seenPhones.add(phone);
      const namePart = line.replace(phoneMatch[0], "").replace(/[,–—-]\s*$/, "").trim();
      results.push({
        name: namePart || "Referral",
        phone,
      });
    }
  }

  return results;
}

export function noteOnlyReferralLabel(note: string): string {
  const first = note.trim().split(/\n+/)[0]?.trim() ?? "";
  if (!first) return "Friends / family (see note)";
  return first.length > 80 ? `${first.slice(0, 77)}…` : first;
}
