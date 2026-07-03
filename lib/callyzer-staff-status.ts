import { sql } from "@/db/index";
import { getCallyzerLastSyncedAt, normalizeEmpPhone } from "@/lib/callyzer-sync-state";

export type CallyzerStaffSyncStatus = {
  callyzerNumber: string | null;
  lastSyncedAt: string | null;
  empPhone: string | null;
  /** False when missing or fewer than 10 digits after normalization. */
  valid: boolean;
  message?: string;
};

export async function getCallyzerStaffSyncStatus(
  staffId: string,
): Promise<CallyzerStaffSyncStatus> {
  const [staff] = await sql<{ callyzerNumber: string | null }[]>`
    SELECT callyzer_number AS "callyzerNumber"
    FROM staff
    WHERE id = ${staffId}::uuid
  `;

  const callyzerNumber = staff?.callyzerNumber ?? null;
  const empPhone = callyzerNumber ? normalizeEmpPhone(callyzerNumber) : null;

  if (!callyzerNumber) {
    return {
      callyzerNumber: null,
      lastSyncedAt: null,
      empPhone: null,
      valid: false,
      message: "No Callyzer number on profile",
    };
  }

  if (!empPhone) {
    const digits = callyzerNumber.replace(/\D/g, "");
    return {
      callyzerNumber,
      lastSyncedAt: null,
      empPhone: null,
      valid: false,
      message:
        digits.length > 0 && digits.length < 10
          ? `Callyzer number must be 10 digits (saved number has ${digits.length})`
          : "Callyzer number must be a valid 10-digit mobile",
    };
  }

  const lastSynced = await getCallyzerLastSyncedAt(empPhone);
  return {
    callyzerNumber,
    lastSyncedAt: lastSynced?.toISOString() ?? null,
    empPhone,
    valid: true,
  };
}
